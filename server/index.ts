import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { audit, db, migrate, seed, transaction } from "./database.ts";

migrate();
seed();

const app = express();
const webOrigins = (process.env.WEB_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((value) => value.trim().replace(/\/$/, ""))
  .filter(Boolean);
app.set("trust proxy", 1);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || webOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Bu kaynaktan erişime izin verilmiyor."));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", database: "sqlite" });
});

const sessionCookie = (token: string, maxAge = 43200) => {
  const crossOrigin = process.env.CROSS_ORIGIN_COOKIES === "true";
  const secure = process.env.NODE_ENV === "production" || crossOrigin;
  return [
    `celmak_session=${token}`,
    "HttpOnly",
    `SameSite=${crossOrigin ? "None" : "Lax"}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
};

function postLedger(input: {
  customerId: number;
  type: string;
  date: string;
  description: string;
  debit?: number;
  credit?: number;
  currency: string;
  foreignAmount: number;
  rate: number;
  sourceType: string;
  sourceId: number;
  actorId: number;
  reversalOfId?: number;
}) {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO account_transactions (customer_id,transaction_type,transaction_date,description,debit,credit,currency,foreign_amount,exchange_rate,source_type,source_id,reversal_of_id,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      input.customerId,
      input.type,
      input.date,
      input.description,
      input.debit || 0,
      input.credit || 0,
      input.currency,
      input.foreignAmount,
      input.rate,
      input.sourceType,
      input.sourceId,
      input.reversalOfId || null,
      input.actorId,
    );
  if (Number(result.changes) > 0)
    db.prepare("UPDATE customers SET balance=balance+?-? WHERE id=?").run(
      input.debit || 0,
      input.credit || 0,
      input.customerId,
    );
  return Number(result.lastInsertRowid);
}

type AppUser = {
  id: number;
  name: string;
  role: "ADMIN" | "SALES" | "ACCOUNTING" | "SHIPPING" | "AUDITOR";
  email: string;
  permissions:string[];
};
const permissionKeys=["DASHBOARD","CUSTOMERS","SALES","INSTRUMENTS","RECEIPTS","APPROVALS","SHIPMENTS","EDOCUMENTS","AUDIT","SECURITY","USER_MANAGEMENT"] as const;
type PermissionKey=(typeof permissionKeys)[number];
const roleDefaults:Record<AppUser["role"],PermissionKey[]>={
  ADMIN:[...permissionKeys],
  SALES:["DASHBOARD","CUSTOMERS","SALES","SECURITY"],
  ACCOUNTING:["DASHBOARD","CUSTOMERS","INSTRUMENTS","RECEIPTS","EDOCUMENTS","SECURITY"],
  SHIPPING:["DASHBOARD","CUSTOMERS","SHIPMENTS","EDOCUMENTS","SECURITY"],
  AUDITOR:["DASHBOARD","CUSTOMERS","SALES","INSTRUMENTS","RECEIPTS","APPROVALS","SHIPMENTS","EDOCUMENTS","AUDIT","SECURITY"],
};
function permissionsFor(user:{id:number;role:AppUser["role"]}){if(user.role==="ADMIN")return [...permissionKeys];const configured=(db.prepare("SELECT permissions_configured configured FROM users WHERE id=?").get(user.id) as {configured:number}).configured;const rows=db.prepare("SELECT permission FROM user_permissions WHERE user_id=?").all(user.id) as {permission:string}[];return configured?rows.map(x=>x.permission):roleDefaults[user.role]}
declare global {
  namespace Express {
    interface Request {
      user: AppUser;
      correlationId: string;
    }
  }
}

app.use((req, res, next) => {
  req.correlationId = randomUUID();
  res.setHeader("x-correlation-id", req.correlationId);
  next();
});

const passwordValid = (password: string, stored: string) => {
  const [salt, hash] = stored.split(":");
  return Boolean(
    salt &&
    hash &&
    timingSafeEqual(Buffer.from(hash, "hex"), scryptSync(password, salt, 64)),
  );
};
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const cookieToken = (req: Request) =>
  req.headers.cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("celmak_session="))
    ?.slice("celmak_session=".length);
const b32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const b32encode = (buffer: Buffer) => {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5)
    out += b32[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  return out;
};
const b32decode = (value: string) => {
  let bits = "";
  for (const char of value.toUpperCase())
    bits += b32.indexOf(char).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
};
const verifyTotp = (secret: string, code: string) => {
  const step = Math.floor(Date.now() / 30000);
  for (let offset = -1; offset <= 1; offset++) {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(step + offset));
    const h = createHmac("sha1", b32decode(secret)).update(counter).digest();
    const p = h[h.length - 1] & 15;
    const n =
      (((h[p] & 127) << 24) |
        ((h[p + 1] & 255) << 16) |
        ((h[p + 2] & 255) << 8) |
        (h[p + 3] & 255)) %
      1000000;
    if (String(n).padStart(6, "0") === code) return true;
  }
  return false;
};

app.post("/api/auth/login", (req, res) => {
  const parsed = z
    .object({
      email: z.string().email(),
      password: z.string().min(8),
      code: z.string().length(6).optional(),
      deviceName: z.string().max(80).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ message: "Giriş bilgileri geçersiz." });
  const user = db
    .prepare("SELECT * FROM users WHERE email=? AND active=1")
    .get(parsed.data.email) as
    | {
        id: number;
        name: string;
        email: string;
        role: AppUser["role"];
        password_hash: string;
        two_factor_enabled: number;
        totp_secret: string | null;
      }
    | undefined;
  if (!user || !passwordValid(parsed.data.password, user.password_hash))
    return res.status(401).json({ message: "E-posta veya parola hatalı." });
  if (
    user.two_factor_enabled &&
    (!parsed.data.code ||
      !user.totp_secret ||
      !verifyTotp(user.totp_secret, parsed.data.code))
  )
    return res
      .status(401)
      .json({
        message: parsed.data.code
          ? "Doğrulama kodu hatalı."
          : "İki aşamalı doğrulama kodu gerekli.",
        requiresTwoFactor: true,
      });
  const token = randomBytes(32).toString("base64url");
  db.prepare(
    `INSERT INTO auth_sessions (user_id,token_hash,device_name,ip_address,user_agent,expires_at) VALUES (?,?,?,?,?,datetime('now','+12 hours'))`,
  ).run(
    user.id,
    tokenHash(token),
    parsed.data.deviceName || "Web tarayıcı",
    req.ip ?? null,
    req.header("user-agent") || null,
  );
  res.setHeader(
    "set-cookie",
    sessionCookie(token),
  );
  audit(
    user.id,
    "LOGIN_SUCCESS",
    "auth_session",
    "new",
    null,
    { deviceName: parsed.data.deviceName },
    req.ip,
    req.correlationId,
  );
  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

app.post("/api/auth/forgot-password", (req, res) => {
  const email = z.string().email().safeParse(req.body.email);
  if (email.success) {
    const user = db
      .prepare("SELECT id FROM users WHERE email=?")
      .get(email.data) as { id: number } | undefined;
    if (user) {
      const token = randomBytes(24).toString("base64url");
      db.prepare(
        "INSERT INTO password_reset_tokens (user_id,token_hash,expires_at) VALUES (?,?,datetime('now','+30 minutes'))",
      ).run(user.id, tokenHash(token));
      console.log(
        `Parola sıfırlama geliştirme bağlantısı: ${webOrigins[0]}/sifre-sifirla?token=${token}`,
      );
    }
  }
  res.json({
    message: "Hesap bulunuyorsa parola sıfırlama bağlantısı gönderildi.",
  });
});

app.post("/api/auth/reset-password", (req, res) => {
  const parsed = z
    .object({ token: z.string().min(20), password: z.string().min(10) })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ message: "Sıfırlama bilgileri geçersiz." });
  const row = db
    .prepare(
      "SELECT * FROM password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP",
    )
    .get(tokenHash(parsed.data.token)) as
    { id: number; user_id: number } | undefined;
  if (!row)
    return res
      .status(400)
      .json({ message: "Bağlantı geçersiz veya süresi dolmuş." });
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(parsed.data.password, salt, 64).toString("hex");
  transaction(() => {
    db.prepare(
      "UPDATE users SET password_hash=?,password_changed_at=CURRENT_TIMESTAMP WHERE id=?",
    ).run(`${salt}:${hash}`, row.user_id);
    db.prepare(
      "UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE id=?",
    ).run(row.id);
    db.prepare(
      "UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revoked_at IS NULL",
    ).run(row.user_id);
  });
  res.json({
    message: "Parolanız değiştirildi. Yeniden giriş yapabilirsiniz.",
  });
});

const rpID = process.env.WEBAUTHN_RP_ID || "localhost";
const expectedOrigin = process.env.WEBAUTHN_ORIGIN || "http://localhost:3000";
app.post("/api/auth/passkey/options", async (req, res) => {
  const email = z.string().email().safeParse(req.body.email);
  if (!email.success)
    return res.status(400).json({ message: "E-posta geçersiz." });
  const user = db
    .prepare("SELECT id FROM users WHERE email=? AND active=1")
    .get(email.data) as { id: number } | undefined;
  if (!user)
    return res.status(404).json({ message: "Passkey hesabı bulunamadı." });
  const credentials = db
    .prepare(
      "SELECT credential_id id,transports FROM passkey_credentials WHERE user_id=?",
    )
    .all(user.id) as { id: string; transports: string | null }[];
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    allowCredentials: credentials.map((x) => ({
      id: x.id,
      transports: x.transports ? JSON.parse(x.transports) : undefined,
    })),
  });
  db.prepare(
    "INSERT INTO auth_challenges (user_id,challenge,purpose,expires_at) VALUES (?,?,'AUTHENTICATE',datetime('now','+5 minutes'))",
  ).run(user.id, options.challenge);
  res.json(options);
});
app.post("/api/auth/passkey/verify", async (req, res) => {
  const credential = db
    .prepare("SELECT * FROM passkey_credentials WHERE credential_id=?")
    .get(req.body.id) as
    | {
        id: number;
        user_id: number;
        credential_id: string;
        public_key: string;
        counter: number;
        transports: string | null;
      }
    | undefined;
  if (!credential)
    return res.status(400).json({ message: "Passkey bulunamadı." });
  const challenge = db
    .prepare(
      "SELECT * FROM auth_challenges WHERE user_id=? AND purpose='AUTHENTICATE' AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP ORDER BY id DESC LIMIT 1",
    )
    .get(credential.user_id) as { id: number; challenge: string } | undefined;
  if (!challenge)
    return res
      .status(400)
      .json({ message: "Passkey isteğinin süresi dolmuş." });
  try {
    const verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge: challenge.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      credential: {
        id: credential.credential_id,
        publicKey: new Uint8Array(Buffer.from(credential.public_key, "base64")),
        counter: credential.counter,
        transports: credential.transports
          ? JSON.parse(credential.transports)
          : undefined,
      },
    });
    if (!verification.verified)
      return res.status(401).json({ message: "Passkey doğrulanamadı." });
    const token = randomBytes(32).toString("base64url");
    transaction(() => {
      db.prepare(
        "UPDATE auth_challenges SET used_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(challenge.id);
      db.prepare(
        "UPDATE passkey_credentials SET counter=?,last_used_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(verification.authenticationInfo.newCounter, credential.id);
      db.prepare(
        `INSERT INTO auth_sessions (user_id,token_hash,device_name,ip_address,user_agent,expires_at) VALUES (?,?,?,?,?,datetime('now','+12 hours'))`,
      ).run(
        credential.user_id,
        tokenHash(token),
        "Passkey",
        req.ip ?? null,
        req.header("user-agent") || null,
      );
    });
    res.setHeader(
      "set-cookie",
      sessionCookie(token),
    );
    res.json({ verified: true });
  } catch (error) {
    res
      .status(400)
      .json({
        message:
          error instanceof Error ? error.message : "Passkey doğrulama hatası.",
      });
  }
});

app.use((req, res, next) => {
  const token = cookieToken(req);
  let user: AppUser | undefined;
  if (token) {
    user = db
      .prepare(
        `SELECT u.id,u.name,u.role,u.email FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP AND u.active=1`,
      )
      .get(tokenHash(token)) as AppUser | undefined;
    if (user)
      db.prepare(
        "UPDATE auth_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE token_hash=?",
      ).run(tokenHash(token));
  }
  if (!user && process.env.NODE_ENV !== "production" && req.header("x-user-id"))
    user = db
      .prepare("SELECT id,name,role,email FROM users WHERE id=? AND active=1")
      .get(Number(req.header("x-user-id"))) as AppUser | undefined;
  if (!user)
    return res.status(401).json({ message: "Oturum açmanız gerekiyor." });
  user.permissions=permissionsFor(user);
  req.user = user;
  next();
});

const allow =
  (...roles: AppUser["role"][]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user.role)) {
      audit(
        req.user.id,
        "ACCESS_DENIED",
        "route",
        req.path,
        null,
        { method: req.method },
        req.ip,
        req.correlationId,
      );
      return res
        .status(403)
        .json({ message: "Bu işlem için yetkiniz bulunmuyor." });
    }
    next();
  };

app.post("/api/auth/logout", (req, res) => {
  const token = cookieToken(req);
  if (token)
    db.prepare(
      "UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE token_hash=?",
    ).run(tokenHash(token));
  res.setHeader(
    "set-cookie",
    sessionCookie("", 0),
  );
  res.json({ message: "Oturum kapatıldı." });
});
app.get("/api/auth/devices", (req, res) =>
  res.json(
    db
      .prepare(
        `SELECT id,device_name deviceName,ip_address ipAddress,user_agent userAgent,last_seen_at lastSeenAt,created_at createdAt,expires_at expiresAt FROM auth_sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP ORDER BY last_seen_at DESC`,
      )
      .all(req.user.id),
  ),
);
app.delete("/api/auth/devices/:id", (req, res) => {
  db.prepare(
    "UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?",
  ).run(Number(req.params.id), req.user.id);
  res.json({ message: "Cihaz oturumu kapatıldı." });
});
app.post("/api/auth/2fa/setup", (req, res) => {
  const secret = b32encode(randomBytes(20));
  db.prepare(
    "UPDATE users SET totp_secret=?,two_factor_enabled=0 WHERE id=?",
  ).run(secret, req.user.id);
  res.json({
    secret,
    otpauthUrl: `otpauth://totp/Celmak:${encodeURIComponent(req.user.email)}?secret=${secret}&issuer=Celmak`,
  });
});
app.post("/api/auth/2fa/enable", (req, res) => {
  const code = z.string().length(6).safeParse(req.body.code);
  const row = db
    .prepare("SELECT totp_secret FROM users WHERE id=?")
    .get(req.user.id) as { totp_secret: string | null };
  if (
    !code.success ||
    !row.totp_secret ||
    !verifyTotp(row.totp_secret, code.data)
  )
    return res.status(400).json({ message: "Doğrulama kodu geçersiz." });
  db.prepare("UPDATE users SET two_factor_enabled=1 WHERE id=?").run(
    req.user.id,
  );
  audit(
    req.user.id,
    "TWO_FACTOR_ENABLED",
    "user",
    req.user.id,
    null,
    null,
    req.ip,
    req.correlationId,
  );
  res.json({ message: "İki aşamalı doğrulama etkinleştirildi." });
});
app.post("/api/auth/passkey/register/options", async (req, res) => {
  const credentials = db
    .prepare(
      "SELECT credential_id id,transports FROM passkey_credentials WHERE user_id=?",
    )
    .all(req.user.id) as { id: string; transports: string | null }[];
  const options = await generateRegistrationOptions({
    rpName: "Çelmak Satış Yönetimi",
    rpID,
    userName: req.user.email,
    userDisplayName: req.user.name,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
    excludeCredentials: credentials.map((x) => ({
      id: x.id,
      transports: x.transports ? JSON.parse(x.transports) : undefined,
    })),
  });
  db.prepare(
    "INSERT INTO auth_challenges (user_id,challenge,purpose,expires_at) VALUES (?,?,'REGISTER',datetime('now','+5 minutes'))",
  ).run(req.user.id, options.challenge);
  res.json(options);
});
app.post("/api/auth/passkey/register/verify", async (req, res) => {
  const challenge = db
    .prepare(
      "SELECT * FROM auth_challenges WHERE user_id=? AND purpose='REGISTER' AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP ORDER BY id DESC LIMIT 1",
    )
    .get(req.user.id) as { id: number; challenge: string } | undefined;
  if (!challenge)
    return res
      .status(400)
      .json({ message: "Passkey kayıt isteğinin süresi dolmuş." });
  try {
    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge: challenge.challenge,
      expectedOrigin,
      expectedRPID: rpID,
    });
    if (!verification.verified || !verification.registrationInfo)
      return res.status(400).json({ message: "Passkey kaydı doğrulanamadı." });
    const credential = verification.registrationInfo.credential;
    transaction(() => {
      db.prepare(
        "INSERT INTO passkey_credentials (user_id,credential_id,public_key,counter,transports,device_name) VALUES (?,?,?,?,?,?)",
      ).run(
        req.user.id,
        credential.id,
        Buffer.from(credential.publicKey).toString("base64"),
        credential.counter,
        JSON.stringify(credential.transports || []),
        req.body.deviceName || "Passkey",
      );
      db.prepare(
        "UPDATE auth_challenges SET used_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(challenge.id);
    });
    audit(
      req.user.id,
      "PASSKEY_REGISTERED",
      "user",
      req.user.id,
      null,
      { credentialId: credential.id },
      req.ip,
      req.correlationId,
    );
    res.json({ verified: true, message: "Passkey kaydedildi." });
  } catch (error) {
    res
      .status(400)
      .json({
        message:
          error instanceof Error ? error.message : "Passkey kayıt hatası.",
      });
  }
});
app.get("/api/delegations", allow("ADMIN"), (_req, res) =>
  res.json(
    db
      .prepare(
        `SELECT d.id,d.start_date startDate,d.end_date endDate,d.scope,d.active,fu.name fromUser,tu.name toUser FROM delegations d JOIN users fu ON fu.id=d.from_user_id JOIN users tu ON tu.id=d.to_user_id ORDER BY d.id DESC`,
      )
      .all(),
  ),
);
app.post("/api/delegations", allow("ADMIN"), (req, res) => {
  const parsed = z
    .object({
      fromUserId: z.number().int().positive(),
      toUserId: z.number().int().positive(),
      startDate: z.string().date(),
      endDate: z.string().date(),
      scope: z.string().default("APPROVAL"),
    })
    .safeParse(req.body);
  if (!parsed.success || parsed.data.fromUserId === parsed.data.toUserId)
    return res.status(400).json({ message: "Vekâlet bilgileri geçersiz." });
  const result = db
    .prepare(
      "INSERT INTO delegations (from_user_id,to_user_id,start_date,end_date,scope,created_by) VALUES (?,?,?,?,?,?)",
    )
    .run(
      parsed.data.fromUserId,
      parsed.data.toUserId,
      parsed.data.startDate,
      parsed.data.endDate,
      parsed.data.scope,
      req.user.id,
    );
  res
    .status(201)
    .json({
      id: Number(result.lastInsertRowid),
      message: "Vekâlet tanımlandı.",
    });
});

app.get("/api/session", (req, res) => {
  const users = db
    .prepare(
      "SELECT id, name, role, email FROM users WHERE active = 1 ORDER BY id",
    )
    .all();
  const security = db
    .prepare(
      "SELECT two_factor_enabled twoFactorEnabled,(SELECT COUNT(*) FROM passkey_credentials WHERE user_id=users.id) passkeyCount FROM users WHERE id=?",
    )
    .get(req.user.id);
  res.json({ currentUser: req.user, users, security });
});

app.get("/api/admin/users",allow("ADMIN"),(_req,res)=>{
  const users=db.prepare("SELECT id,name,role,email,active FROM users ORDER BY name").all() as {id:number;name:string;role:AppUser["role"];email:string;active:number}[];
  res.json({permissions:permissionKeys,users:users.map(user=>({...user,active:Boolean(user.active),permissions:permissionsFor(user)}))});
});
app.put("/api/admin/users/:id/permissions",allow("ADMIN"),(req,res)=>{
  const parsed=z.object({permissions:z.array(z.enum(permissionKeys)).max(permissionKeys.length)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({message:"Yetki seçimi geçersiz."});
  const target=db.prepare("SELECT id,name,role FROM users WHERE id=?").get(Number(req.params.id)) as {id:number;name:string;role:AppUser["role"]}|undefined;
  if(!target)return res.status(404).json({message:"Kullanıcı bulunamadı."});
  if(target.role==="ADMIN")return res.status(409).json({message:"Yönetici hesapları bütün modüllere erişir."});
  const before=permissionsFor(target);
  transaction(()=>{db.prepare("DELETE FROM user_permissions WHERE user_id=?").run(target.id);const add=db.prepare("INSERT INTO user_permissions (user_id,permission,granted_by) VALUES (?,?,?)");for(const permission of parsed.data.permissions)add.run(target.id,permission,req.user.id);db.prepare("UPDATE users SET permissions_configured=1 WHERE id=?").run(target.id);audit(req.user.id,"USER_PERMISSIONS_UPDATED","user",target.id,{permissions:before},{permissions:parsed.data.permissions},req.ip,req.correlationId)});
  res.json({message:`${target.name} kullanıcısının ekran yetkileri güncellendi.`,permissions:parsed.data.permissions});
});

const moduleForPath=(path:string):PermissionKey|undefined=>{
  if(path==="/dashboard")return "DASHBOARD";
  if(path.includes("/reconciliations")||path.endsWith("/ledger")||path.startsWith("/receipts")||path.startsWith("/exchange-rates"))return "RECEIPTS";
  if(path.startsWith("/customers"))return "CUSTOMERS";
  if(path.startsWith("/products")||path.startsWith("/sales"))return "SALES";
  if(path.startsWith("/instruments"))return "INSTRUMENTS";
  if(path.startsWith("/approvals"))return "APPROVALS";
  if(path.startsWith("/shipments")||path.startsWith("/shipment-plans"))return "SHIPMENTS";
  if(path.startsWith("/e-documents"))return "EDOCUMENTS";
  if(path.startsWith("/audit-logs"))return "AUDIT";
};
app.use("/api",(req,res,next)=>{const permission=moduleForPath(req.path);const supportingRead=req.method==="GET"&&((permission==="CUSTOMERS"&&["SALES","RECEIPTS","SHIPMENTS"].some(x=>req.user.permissions.includes(x)))||(permission==="SALES"&&((req.path==="/sales"&&req.user.permissions.includes("EDOCUMENTS")) || (/^\/sales\/\d+\/detail$/.test(req.path)&&req.user.permissions.includes("APPROVALS")))));if(!permission||req.user.permissions.includes(permission)||supportingRead)return next();audit(req.user.id,"MODULE_ACCESS_DENIED","route",req.path,null,{permission,method:req.method},req.ip,req.correlationId);return res.status(403).json({message:"Bu ekran için yöneticiniz tarafından yetki verilmemiş."})});

app.get("/api/dashboard", (req, res) => {
  const totals = db
    .prepare(
      `SELECT
    (SELECT COALESCE(SUM(balance),0) FROM customers WHERE active=1) receivables,
    (SELECT COUNT(*) FROM approvals WHERE status='PENDING') pendingApprovals,
    (SELECT COUNT(*) FROM sales WHERE status='PENDING_APPROVAL') pendingSales,
    (SELECT COALESCE(SUM(grand_total),0) FROM sales WHERE status IN ('APPROVED','COMPLETED')) approvedSales`,
    )
    .get();
  const recent = db
    .prepare(
      `SELECT s.id, s.number, s.status, s.grand_total grandTotal, s.created_at createdAt,
    c.name customerName, u.name createdBy FROM sales s JOIN customers c ON c.id=s.customer_id JOIN users u ON u.id=s.created_by
    ORDER BY s.id DESC LIMIT 6`,
    )
    .all();
  const notifications = db
    .prepare(
      "SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 6",
    )
    .all(req.user.id);
  res.json({ totals, recent, notifications });
});

app.get("/api/customers", (_req, res) => {
  res.json(
    db
      .prepare(
        `SELECT id, code, name, tax_number taxNumber, phone, email, city,
    payment_term_days paymentTermDays, risk_limit riskLimit, balance, code_source codeSource,
    external_system externalSystem, external_id externalId,
    (SELECT GROUP_CONCAT(tag) FROM customer_tags ct WHERE ct.customer_id=customers.id) tags FROM customers WHERE active=1 ORDER BY name`,
      )
      .all(),
  );
});

const customerSchema = z.object({
  name: z.string().trim().min(2).max(180),
  code: z.string().trim().min(2).max(40).optional(),
  taxNumber: z.string().trim().max(11).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().email().optional().or(z.literal("")),
  city: z.string().trim().max(80).optional(),
  paymentTermDays: z.number().int().min(0).max(365).default(30),
  riskLimit: z.number().min(0).default(0),
  codeSource: z.enum(["AUTO", "MANUAL", "EXTERNAL"]).default("AUTO"),
  externalSystem: z.string().trim().max(40).optional(),
  externalId: z.string().trim().max(80).optional(),
  tags: z.array(z.enum(["CUSTOMER","SUPPLIER","DEALER"])).min(1).default(["CUSTOMER"]),
});
app.post(
  "/api/customers",
  allow("ADMIN", "SALES", "ACCOUNTING"),
  (req, res) => {
    const parsed = customerSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ message: "Müşteri bilgileri eksik veya geçersiz." });
    const input = parsed.data;
    if (input.codeSource !== "AUTO" && !input.code)
      return res
        .status(400)
        .json({
          message:
            "Manuel veya ERP kaynaklı müşteri için müşteri kodu zorunludur.",
        });
    if (
      input.codeSource === "EXTERNAL" &&
      (!input.externalSystem || !input.externalId)
    )
      return res
        .status(400)
        .json({
          message:
            "ERP kaynaklı müşteri için kaynak sistem ve harici kayıt numarası zorunludur.",
        });
    try {
      const result = transaction(() => {
        const temporary = `TMP-${randomUUID()}`;
        const inserted = db
          .prepare(
            `INSERT INTO customers (code,name,tax_number,phone,email,city,payment_term_days,risk_limit,code_source,external_system,external_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            input.code || temporary,
            input.name,
            input.taxNumber || null,
            input.phone || null,
            input.email || null,
            input.city || null,
            input.paymentTermDays,
            input.riskLimit,
            input.codeSource,
            input.externalSystem || null,
            input.externalId || null,
          );
        const id = Number(inserted.lastInsertRowid);
        const code =
          input.codeSource === "AUTO"
            ? `MUS-${String(id).padStart(6, "0")}`
            : input.code!;
        if (input.codeSource === "AUTO")
          db.prepare("UPDATE customers SET code=? WHERE id=?").run(code, id);
        const addTag=db.prepare("INSERT INTO customer_tags (customer_id,tag) VALUES (?,?)");
        for(const tag of input.tags)addTag.run(id,tag);
        audit(
          req.user.id,
          "CUSTOMER_CREATED",
          "customer",
          id,
          null,
          { ...input, code },
          req.ip,
          req.correlationId,
        );
        return { id, code };
      });
      res
        .status(201)
        .json({ ...result, message: "Müşteri başarıyla oluşturuldu." });
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE"))
        return res
          .status(409)
          .json({
            message: "Bu müşteri kodu veya harici kayıt zaten kullanılıyor.",
          });
      throw error;
    }
  },
);

app.get("/api/customers/:id", (req, res) => {
  const id = Number(req.params.id);
  const customer = db
    .prepare(
      `SELECT id,code,name,tax_number taxNumber,phone,email,city,payment_term_days paymentTermDays,
    risk_limit riskLimit,balance,code_source codeSource,external_system externalSystem,external_id externalId,created_at createdAt,
    (SELECT GROUP_CONCAT(tag) FROM customer_tags ct WHERE ct.customer_id=customers.id) tags
    FROM customers WHERE id=? AND active=1`,
    )
    .get(id);
  if (!customer)
    return res.status(404).json({ message: "Müşteri bulunamadı." });
  const sales = db
    .prepare(
      `SELECT s.id,s.number,s.status,s.order_kind orderKind,s.payment_method paymentMethod,s.grand_total grandTotal,s.currency,s.exchange_rate exchangeRate,s.instrument_type instrumentType,s.instrument_count instrumentCount,s.created_at createdAt,
    c.name customerName,c.code customerCode,u.name createdBy,
    (SELECT COALESCE(SUM(si.quantity),0) FROM sale_items si WHERE si.sale_id=s.id) totalQuantity
    FROM sales s JOIN customers c ON c.id=s.customer_id JOIN users u ON u.id=s.created_by WHERE s.customer_id=? ORDER BY s.id DESC`,
    )
    .all(id);
  const schedules = db
    .prepare(
      `SELECT ps.id,ps.sale_id saleId,s.number saleNumber,ps.sequence_no sequenceNo,ps.payment_type paymentType,
    ps.due_date dueDate,ps.amount,ps.currency,ps.exchange_rate exchangeRate,ps.status FROM payment_schedules ps JOIN sales s ON s.id=ps.sale_id WHERE s.customer_id=? ORDER BY ps.due_date`,
    )
    .all(id);
  const instruments = db
    .prepare(
      `SELECT id,number,instrument_type instrumentType,due_date dueDate,amount,currency,status,current_holder currentHolder
    FROM negotiable_instruments WHERE customer_id=? ORDER BY due_date`,
    )
    .all(id);
  const shipments = db
    .prepare(
      `SELECT sh.id,sh.number,sh.status,sh.planned_date plannedDate,sh.actual_date actualDate,s.number saleNumber,
    (SELECT COALESCE(SUM(quantity),0) FROM shipment_items WHERE shipment_id=sh.id) totalQuantity
    FROM shipments sh JOIN sales s ON s.id=sh.sale_id WHERE sh.customer_id=? ORDER BY sh.id DESC`,
    )
    .all(id);
  const stats = db
    .prepare(
      `SELECT
    (SELECT COUNT(*) FROM sales WHERE customer_id=? AND status IN ('APPROVED','COMPLETED')) approvedSales,
    (SELECT COALESCE(SUM(grand_total*exchange_rate),0) FROM sales WHERE customer_id=? AND status IN ('APPROVED','COMPLETED')) salesTryTotal,
    (SELECT COUNT(*) FROM negotiable_instruments WHERE customer_id=? AND status NOT IN ('COLLECTED','CANCELLED','ENDORSED','ASSIGNED')) openInstruments,
    (SELECT COUNT(*) FROM shipments WHERE customer_id=? AND status NOT IN ('DELIVERED','CANCELLED')) openShipments`,
    )
    .get(id, id, id, id);
  res.json({ customer, stats, sales, schedules, instruments, shipments });
});

app.get("/api/customers/:id/ledger", (req, res) => {
  const id = Number(req.params.id);
  const customer = db
    .prepare(
      "SELECT id,code,name,balance,risk_limit riskLimit FROM customers WHERE id=?",
    )
    .get(id);
  if (!customer)
    return res.status(404).json({ message: "Müşteri bulunamadı." });
  const transactions = db
    .prepare(
      `SELECT at.id,at.transaction_type transactionType,at.transaction_date transactionDate,at.description,at.debit,at.credit,at.currency,at.foreign_amount foreignAmount,at.exchange_rate exchangeRate,at.source_type sourceType,at.source_id sourceId,at.reversal_of_id reversalOfId,u.name createdBy,
    SUM(at.debit-at.credit) OVER (ORDER BY at.transaction_date,at.id) runningBalance FROM account_transactions at LEFT JOIN users u ON u.id=at.created_by WHERE at.customer_id=? ORDER BY at.transaction_date DESC,at.id DESC`,
    )
    .all(id);
  const reconciliations = db
    .prepare(
      "SELECT id,statement_date statementDate,system_balance systemBalance,declared_balance declaredBalance,difference,status,note,created_at createdAt FROM reconciliations WHERE customer_id=? ORDER BY id DESC",
    )
    .all(id);
  const schedules=db.prepare(`SELECT ps.id,ps.sale_id saleId,s.number saleNumber,ps.sequence_no sequenceNo,ps.payment_type paymentType,ps.due_date dueDate,ps.amount,ps.paid_amount paidAmount,ROUND(ps.amount-ps.paid_amount,2) remainingAmount,ps.currency,ps.exchange_rate exchangeRate,ps.status,
    n.id instrumentId,n.number instrumentNumber,n.status instrumentStatus,n.issuer,n.serial_number serialNumber,n.bank_name bankName
    FROM payment_schedules ps JOIN sales s ON s.id=ps.sale_id LEFT JOIN negotiable_instruments n ON n.payment_schedule_id=ps.id
    WHERE s.customer_id=? AND s.status IN ('APPROVED','COMPLETED') AND ps.payment_type<>'CASH' AND ps.status NOT IN ('PAID','CANCELLED') ORDER BY ps.due_date,ps.id`).all(id);
  res.json({ customer, transactions, reconciliations, schedules });
});

const receiptSchema = z.object({
  customerId: z.number().int().positive(),
  saleId: z.number().int().positive().optional(),
  paymentScheduleId: z.number().int().positive().optional(),
  method: z.enum(["CASH", "BANK_TRANSFER", "CHECK"]),
  receiptDate: z.string().date(),
  amount: z.number().positive(),
  currency: z.enum(["TRY", "USD", "EUR"]),
  exchangeRate: z.number().positive(),
  reference: z.string().trim().max(100).optional(),
  note: z.string().trim().max(500).optional(),
});
app.post("/api/receipts", allow("ADMIN", "ACCOUNTING"), (req, res) => {
  const parsed = receiptSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ message: "Tahsilat bilgileri eksik veya geçersiz." });
  const input = parsed.data;
  const customer = db
    .prepare("SELECT id,name FROM customers WHERE id=?")
    .get(input.customerId);
  if (!customer)
    return res.status(404).json({ message: "Müşteri bulunamadı." });
  const schedule=input.paymentScheduleId?db.prepare(`SELECT ps.id,ps.sale_id saleId,ps.amount,ps.paid_amount paidAmount,ps.currency,ps.status,s.customer_id customerId FROM payment_schedules ps JOIN sales s ON s.id=ps.sale_id WHERE ps.id=?`).get(input.paymentScheduleId) as {id:number;saleId:number;amount:number;paidAmount:number;currency:string;status:string;customerId:number}|undefined:undefined;
  if(input.paymentScheduleId&&!schedule)return res.status(404).json({message:"Seçilen vade bulunamadı."});
  if(schedule&&schedule.customerId!==input.customerId)return res.status(400).json({message:"Seçilen vade bu müşteriye ait değil."});
  if(schedule&&["PAID","CANCELLED"].includes(schedule.status))return res.status(409).json({message:"Seçilen vade zaten kapalı."});
  if(schedule&&schedule.currency!==input.currency)return res.status(400).json({message:`Bu vade ${schedule.currency} para birimiyle tahsil edilmelidir.`});
  const scheduleRemaining=schedule?Number((schedule.amount-schedule.paidAmount).toFixed(2)):0;
  if(schedule&&input.amount>scheduleRemaining)return res.status(400).json({message:`Tahsilat kalan vade tutarını aşamaz. Kalan: ${scheduleRemaining} ${schedule.currency}`});
  const result = transaction(() => {
    const inserted = db
      .prepare(
        `INSERT INTO receipts (customer_id,sale_id,payment_schedule_id,method,receipt_date,amount,currency,exchange_rate,try_amount,reference,note,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        input.customerId,
        input.saleId || schedule?.saleId || null,
        input.paymentScheduleId || null,
        input.method,
        input.receiptDate,
        input.amount,
        input.currency,
        input.exchangeRate,
        input.amount * input.exchangeRate,
        input.reference || null,
        input.note || null,
        req.user.id,
      );
    const id = Number(inserted.lastInsertRowid);
    const number = `THS-${new Date().getFullYear()}-${String(id).padStart(6, "0")}`;
    db.prepare("UPDATE receipts SET number=? WHERE id=?").run(number, id);
    postLedger({
      customerId: input.customerId,
      type:
        input.method === "CASH"
          ? "CASH_RECEIPT"
          : input.method === "CHECK"
            ? "INSTRUMENT_RECEIPT"
            : "BANK_RECEIPT",
      date: input.receiptDate,
      description: `${number} tahsilat`,
      credit: input.amount * input.exchangeRate,
      currency: input.currency,
      foreignAmount: input.amount,
      rate: input.exchangeRate,
      sourceType: "RECEIPT",
      sourceId: id,
      actorId: req.user.id,
    });
    if (input.paymentScheduleId&&schedule){const newPaid=Number((schedule.paidAmount+input.amount).toFixed(2));db.prepare("UPDATE payment_schedules SET paid_amount=?,status=CASE WHEN ?>=amount THEN 'PAID' ELSE 'PLANNED' END WHERE id=?").run(newPaid,newPaid,input.paymentScheduleId)}
    audit(
      req.user.id,
      "RECEIPT_CREATED",
      "receipt",
      id,
      null,
      { number, ...input },
      req.ip,
      req.correlationId,
    );
    return { id, number };
  });
  res.status(201).json({ ...result, message: "Tahsilat cariye işlendi." });
});

app.post(
  "/api/receipts/:id/reverse",
  allow("ADMIN", "ACCOUNTING"),
  (req, res) => {
    const receipt = db
      .prepare("SELECT * FROM receipts WHERE id=? AND status='COMPLETED'")
      .get(Number(req.params.id)) as
      | {
          id: number;
          number: string;
          customer_id: number;
          try_amount: number;
          currency: string;
          amount: number;
          exchange_rate: number;
          payment_schedule_id: number | null;
        }
      | undefined;
    if (!receipt)
      return res.status(404).json({ message: "Aktif tahsilat bulunamadı." });
    transaction(() => {
      db.prepare("UPDATE receipts SET status='REVERSED' WHERE id=?").run(
        receipt.id,
      );
      const original = db
        .prepare(
          "SELECT id FROM account_transactions WHERE source_type='RECEIPT' AND source_id=?",
        )
        .get(receipt.id) as { id: number };
      postLedger({
        customerId: receipt.customer_id,
        type: "RECEIPT_REVERSAL",
        date: new Date().toISOString().slice(0, 10),
        description: `${receipt.number} ters kayıt`,
        debit: receipt.try_amount,
        currency: receipt.currency,
        foreignAmount: receipt.amount,
        rate: receipt.exchange_rate,
        sourceType: "RECEIPT_REVERSAL",
        sourceId: receipt.id,
        actorId: req.user.id,
        reversalOfId: original.id,
      });
      if (receipt.payment_schedule_id){const schedule=db.prepare('SELECT amount,paid_amount paidAmount FROM payment_schedules WHERE id=?').get(receipt.payment_schedule_id) as {amount:number;paidAmount:number};const newPaid=Math.max(0,Number((schedule.paidAmount-receipt.amount).toFixed(2)));db.prepare("UPDATE payment_schedules SET paid_amount=?,status=CASE WHEN ?>=amount THEN 'PAID' ELSE 'PLANNED' END WHERE id=?").run(newPaid,newPaid,receipt.payment_schedule_id)}
      audit(
        req.user.id,
        "RECEIPT_REVERSED",
        "receipt",
        receipt.id,
        null,
        { reason: req.body.reason || "Ters kayıt" },
        req.ip,
        req.correlationId,
      );
    });
    res.json({ message: "Tahsilat ters kayıtla iptal edildi." });
  },
);

const reconciliationSchema = z.object({
  statementDate: z.string().date(),
  declaredBalance: z.number(),
  note: z.string().trim().max(500).optional(),
});
app.post(
  "/api/customers/:id/reconciliations",
  allow("ADMIN", "ACCOUNTING"),
  (req, res) => {
    const parsed = reconciliationSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: "Mutabakat bilgileri geçersiz." });
    const customer = db
      .prepare("SELECT balance FROM customers WHERE id=?")
      .get(Number(req.params.id)) as { balance: number } | undefined;
    if (!customer)
      return res.status(404).json({ message: "Müşteri bulunamadı." });
    const difference = Number(
      (customer.balance - parsed.data.declaredBalance).toFixed(2),
    );
    const status = difference === 0 ? "MATCHED" : "DISPUTED";
    const result = db
      .prepare(
        "INSERT INTO reconciliations (customer_id,statement_date,system_balance,declared_balance,difference,status,note,created_by) VALUES (?,?,?,?,?,?,?,?)",
      )
      .run(
        Number(req.params.id),
        parsed.data.statementDate,
        customer.balance,
        parsed.data.declaredBalance,
        difference,
        status,
        parsed.data.note || null,
        req.user.id,
      );
    audit(
      req.user.id,
      "RECONCILIATION_CREATED",
      "reconciliation",
      Number(result.lastInsertRowid),
      null,
      { ...parsed.data, difference, status },
      req.ip,
      req.correlationId,
    );
    res
      .status(201)
      .json({
        message:
          status === "MATCHED"
            ? "Mutabakat sağlandı."
            : "Mutabakat farkı kaydedildi.",
        difference,
        status,
      });
  },
);

app.post(
  "/api/exchange-rates/tcmb",
  allow("ADMIN", "ACCOUNTING"),
  async (req, res) => {
    try {
      const response = await fetch("https://www.tcmb.gov.tr/kurlar/today.xml");
      if (!response.ok) throw new Error(`TCMB ${response.status}`);
      const xml = await response.text();
      const rateDate = new Date().toISOString().slice(0, 10);
      const rates = ["USD", "EUR"].map((currency) => {
        const block = xml.match(
          new RegExp(
            `<Currency[^>]*CurrencyCode="${currency}"[\\s\\S]*?<\\/Currency>`,
          ),
        )?.[0];
        const value = block?.match(
          /<ForexSelling>([0-9.]+)<\/ForexSelling>/,
        )?.[1];
        if (!value) throw new Error(`${currency} kuru bulunamadı`);
        return { currency, rate: Number(value) };
      });
      for (const rate of rates)
        db.prepare(
          "INSERT OR REPLACE INTO exchange_rates (currency,rate_date,rate,source) VALUES (?,?,?,?)",
        ).run(rate.currency, rateDate, rate.rate, "TCMB");
      res.json({
        message: "TCMB döviz satış kurları güncellendi.",
        rateDate,
        rates,
      });
    } catch (error) {
      const latest = db
        .prepare(
          "SELECT currency,rate_date rateDate,rate,source FROM exchange_rates WHERE id IN (SELECT MAX(id) FROM exchange_rates GROUP BY currency)",
        )
        .all();
      res
        .status(503)
        .json({
          message:
            "TCMB bağlantısı kurulamadı; son başarılı kurlar döndürüldü.",
          stale: true,
          rates: latest,
          detail: error instanceof Error ? error.message : "Hata",
        });
    }
  },
);

app.get("/api/products", (_req, res) => {
  res.json(
    db
      .prepare(
        `SELECT id, code, name, unit, unit_price unitPrice, minimum_price minimumPrice,
    vat_rate vatRate, stock_quantity stockQuantity, part_category partCategory, inventory_source inventorySource,
    external_id externalId, product_group productGroup, product_subgroup productSubgroup, manufacturer_model manufacturerModel,
    manual_price manualPrice, stock_tracking stockTracking
    FROM products WHERE active=1 ORDER BY CASE WHEN product_group IS NULL THEN 1 ELSE 0 END, product_group, name`,
      )
      .all(),
  );
});

app.get("/api/configuration", (_req, res) => {
  const settings = Object.fromEntries(
    (
      db.prepare("SELECT key,value FROM system_settings").all() as {
        key: string;
        value: string;
      }[]
    ).map((x) => [x.key, x.value]),
  );
  const rates = db
    .prepare(
      "SELECT currency, rate_date rateDate, rate, source FROM exchange_rates ORDER BY rate_date DESC, CASE source WHEN 'TCMB' THEN 0 ELSE 1 END, id DESC",
    )
    .all();
  res.json({
    settings,
    rates,
    currencies: ["TRY", "USD", "EUR"],
    documentProviders: [
      "NOT_CONFIGURED",
      "LOGO",
      "MIKRO",
      "NETSIS",
      "PRIVATE_INTEGRATOR",
      "GIB_PORTAL_EXPORT",
    ],
  });
});

app.put("/api/configuration/:key", allow("ADMIN"), (req, res) => {
  const allowed: Record<string, string[]> = {
    "inventory.source": ["LOCAL", "LOGO", "MIKRO", "NETSIS", "ERP"],
    "customer.codeMode": ["AUTO", "MANUAL", "EXTERNAL"],
    "edocument.provider": [
      "NOT_CONFIGURED",
      "LOGO",
      "MIKRO",
      "NETSIS",
      "PRIVATE_INTEGRATOR",
      "GIB_PORTAL_EXPORT",
    ],
  };
  const key = String(req.params.key);
  const values = allowed[key];
  if (!values || !values.includes(req.body.value))
    return res.status(400).json({ message: "Ayar değeri geçersiz." });
  const previous = db
    .prepare("SELECT value FROM system_settings WHERE key=?")
    .get(key) as { value: string } | undefined;
  db.prepare(
    `INSERT INTO system_settings(key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`,
  ).run(key, req.body.value);
  audit(
    req.user.id,
    "CONFIGURATION_CHANGED",
    "system_setting",
    key,
    previous,
    { value: req.body.value },
    req.ip,
    req.correlationId,
  );
  res.json({ message: "Sistem ayarı güncellendi." });
});

// External adapters can populate the same product fields once the source API is defined.
const partSchema = z.object({
  code:z.string().trim().min(1).max(80),name:z.string().trim().min(1).max(200),
  partCategory:z.enum(["STANDARD","READY","SEMI_FINISHED","OTHER"]),
  unit:z.string().trim().min(1).max(20),unitPrice:z.number().nonnegative(),
  vatRate:z.number().min(0).max(100),stockQuantity:z.number().nonnegative(),
});
app.post("/api/products/parts",allow("ADMIN","SALES"),(req,res)=>{
  const parsed=partSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({message:"Parça bilgileri geçersiz."});
  const p=parsed.data;
  if(db.prepare("SELECT id FROM products WHERE code=?").get(p.code))return res.status(409).json({message:"Bu parça kodu zaten kayıtlı."});
  const id=transaction(()=>{
    const result=db.prepare("INSERT INTO products(code,name,unit,unit_price,minimum_price,vat_rate,stock_quantity,part_category,inventory_source) VALUES (?,?,?,?,0,?,?,?,'LOCAL')").run(p.code,p.name,p.unit,p.unitPrice,p.vatRate,p.stockQuantity,p.partCategory);
    audit(req.user.id,"PART_CREATED","product",Number(result.lastInsertRowid),null,p,req.ip,req.correlationId);
    return Number(result.lastInsertRowid);
  });
  res.status(201).json({id});
});

const saleSchema = z.object({
  orderKind: z.enum(["MACHINE", "SPARE_PART"]).default("MACHINE"),
  advanceAmount: z.number().min(0).default(0),
  customerId: z.number().int().positive(),
  paymentMethod: z.enum(["CASH", "TERM", "CHECK", "MIXED"]),
  paymentTermDays: z.number().int().min(0).max(365),
  downPayment: z.number().min(0),
  approvalAssigneeId: z.number().int().positive().optional(),
  currency: z.enum(["TRY", "USD", "EUR"]).default("TRY"),
  exchangeRate: z.number().positive().default(1),
  instrumentType: z.enum(["CHECK", "PROMISSORY_NOTE"]).optional(),
  instrumentCount: z.number().int().min(0).max(24).default(0),
  termInstallmentCount: z.number().int().min(1).max(24).default(1),
  firstDueDate: z.string().date().optional(),
  dueIntervalDays: z.number().int().min(1).max(365).optional(),
  note: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().positive(),
        unitPrice: z.number().positive(),
        vatRate: z.number().min(0).max(100),
      }),
    )
    .min(1),
  paymentSchedule: z.array(z.object({
    dueDate: z.string().date(),
    amount: z.number().positive(),
  })).min(1).max(24).optional(),
});

app.get("/api/sales", (_req, res) => {
  const sales = db
    .prepare(
      `SELECT s.id, s.number, s.status, s.payment_method paymentMethod,
    s.grand_total grandTotal, s.currency, s.exchange_rate exchangeRate, s.instrument_type instrumentType,
    s.instrument_count instrumentCount, s.created_at createdAt, s.order_kind orderKind, c.name customerName, c.code customerCode,
    u.name createdBy FROM sales s JOIN customers c ON c.id=s.customer_id JOIN users u ON u.id=s.created_by ORDER BY s.id DESC`,
    )
    .all();
  res.json(sales);
});

app.get("/api/approval-assignees", allow("SALES","ADMIN"), (req,res)=>res.json(db.prepare("SELECT id,name,email FROM users WHERE role='ADMIN' AND active=1 AND id<>? ORDER BY name").all(req.user.id)));

app.get("/api/sales/:id/detail", (req,res)=>{
  const id=Number(req.params.id);const sale=db.prepare(`SELECT s.id,s.number,s.status,s.note,s.order_kind orderKind,s.advance_amount advanceAmount,s.approval_assignee_id approvalAssigneeId,s.instrument_type instrumentType,s.payment_method paymentMethod,s.subtotal,s.vat_total vatTotal,s.grand_total grandTotal,s.down_payment downPayment,s.currency,s.exchange_rate exchangeRate,s.created_at createdAt,c.id customerId,c.code customerCode,c.name customerName,u.name createdBy,a.name approvalAssignee FROM sales s JOIN customers c ON c.id=s.customer_id JOIN users u ON u.id=s.created_by LEFT JOIN users a ON a.id=s.approval_assignee_id WHERE s.id=?`).get(id);
  if(!sale)return res.status(404).json({message:"Satış bulunamadı."});
  const items=db.prepare(`SELECT si.id,si.product_id productId,p.code,p.name,p.unit,si.quantity,si.unit_price unitPrice,si.vat_rate vatRate,si.line_total lineTotal FROM sale_items si JOIN products p ON p.id=si.product_id WHERE si.sale_id=?`).all(id);
  const schedule=db.prepare(`SELECT sequence_no sequenceNo,payment_type paymentType,due_date dueDate,amount,paid_amount paidAmount,currency,status FROM payment_schedules WHERE sale_id=? ORDER BY sequence_no`).all(id);
  const shipments=db.prepare(`SELECT id,number,status,planned_date plannedDate,actual_date actualDate,dispatch_number dispatchNumber FROM shipments WHERE sale_id=? ORDER BY id DESC`).all(id);
  res.json({sale,items,schedule,shipments});
});

const saveSale = (req: Request, res: Response) => {
  const editId = req.params.id ? Number(req.params.id) : undefined;
  const previous = editId ? db.prepare("SELECT * FROM sales WHERE id=?").get(editId) as {status:string;created_by:number;number:string}|undefined : undefined;
  if (editId && !previous) return res.status(404).json({message:"Sipariş bulunamadı."});
  if (previous && (previous.created_by !== req.user.id && req.user.role !== "ADMIN")) return res.status(403).json({message:"Yalnızca kendi siparişinizi düzenleyebilirsiniz."});
  if (previous && !["DRAFT","REVISION_REQUESTED"].includes(previous.status)) return res.status(409).json({message:"Yalnızca taslak veya düzeltme bekleyen sipariş düzenlenebilir."});
  const parsed = saleSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({
        message: "Satış bilgileri eksik veya geçersiz.",
        details: parsed.error.flatten(),
      });
  const input = parsed.data;
  if (input.approvalAssigneeId && !db.prepare("SELECT id FROM users WHERE id=? AND active=1 AND role='ADMIN' AND id<>?").get(input.approvalAssigneeId,req.user.id)) return res.status(400).json({message:"Geçerli bir onay yetkilisi seçin."});
  if (new Set(input.items.map(x=>x.productId)).size !== input.items.length) return res.status(400).json({message:"Aynı ürün tek satırda olmalıdır."});
  const usesInstrument = ["CHECK", "MIXED"].includes(input.paymentMethod);
  if (
    usesInstrument &&
    (!input.instrumentType ||
      input.instrumentCount < 1)
  ) {
    return res
      .status(400)
      .json({
        message:
          "Çek/senet ödemesinde evrak türü ve en az bir vade satırı zorunludur.",
      });
  }
  if (!usesInstrument && input.instrumentCount > 0)
    return res
      .status(400)
      .json({
        message: "Seçilen ödeme yöntemi çek/senet planı desteklemiyor.",
      });
  if (input.currency === "TRY" && input.exchangeRate !== 1)
    return res.status(400).json({ message: "TL işlemlerde kur 1 olmalıdır." });
  const customer = db
    .prepare("SELECT * FROM customers WHERE id=? AND active=1")
    .get(input.customerId) as Record<string, unknown> | undefined;
  if (!customer)
    return res.status(404).json({ message: "Müşteri bulunamadı." });

  const calculatedItems = input.items.map((item) => {
    const product = db
      .prepare("SELECT * FROM products WHERE id=? AND active=1")
      .get(item.productId) as
      | {
          id: number;
          unit_price: number;
          vat_rate: number;
          stock_quantity: number;
          stock_tracking: number;
          part_category: string;
        }
      | undefined;
    if (!product) throw new Error("Ürün bulunamadı.");
    if (input.orderKind === "SPARE_PART" && product.part_category === "MACHINE") throw new Error("Yedek parça siparişinde yalnızca parça seçilebilir.");
    if (input.orderKind === "MACHINE" && product.part_category !== "MACHINE") throw new Error("Ana mamul siparişinde yalnızca ana mamul seçilebilir.");
    if (product.stock_tracking && item.quantity > product.stock_quantity)
      throw new Error("Seçilen miktar kullanılabilir stoktan fazla.");
    const unitPrice = Number(item.unitPrice.toFixed(4));
    const base = Number((unitPrice * item.quantity).toFixed(2));
    const vatRate = product.part_category === "MACHINE" ? product.vat_rate : item.vatRate;
    return {
      ...item,
      unitPrice,
      vatRate,
      lineTotal: Number((base + (base * vatRate) / 100).toFixed(2)),
    };
  });
  const subtotal = calculatedItems.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );
  const grandTotal = calculatedItems.reduce(
    (sum, item) => sum + item.lineTotal,
    0,
  );
  const vatTotal = grandTotal - subtotal;
  if (input.advanceAmount * input.exchangeRate > Math.max(0, -Number(customer.balance)) + 0.01) return res.status(400).json({message:"Kullanılabilir cari avans yetersiz."});
  if (input.downPayment + input.advanceAmount > grandTotal)
    return res
      .status(400)
      .json({ message: "Peşinat ve cari avansı toplamı sipariş tutarından büyük olamaz." });
  const remainingTotal = Number((grandTotal - input.downPayment - input.advanceAmount).toFixed(2));
  if (["TERM", "CHECK", "MIXED"].includes(input.paymentMethod) && remainingTotal > 0) {
    if (!input.paymentSchedule?.length)
      return res.status(400).json({ message: "Vade planına en az bir ödeme satırı ekleyin." });
    const planTotal = Number(input.paymentSchedule.reduce((sum, row) => sum + row.amount, 0).toFixed(2));
    if (Math.abs(planTotal - remainingTotal) > 0.01)
      return res.status(400).json({ message: `Vade planı toplamı ${remainingTotal} ${input.currency} olmalıdır. Girilen: ${planTotal} ${input.currency}` });
  }

  const create = () =>
    transaction(() => {
      if (previous) {
        db.prepare("DELETE FROM payment_schedules WHERE sale_id=?").run(editId!);
        db.prepare("DELETE FROM sale_items WHERE sale_id=?").run(editId!);
        db.prepare(`UPDATE sales SET customer_id=?,payment_method=?,payment_term_days=?,subtotal=?,vat_total=?,grand_total=?,down_payment=?,note=?,currency=?,exchange_rate=?,instrument_type=?,instrument_count=?,approval_assignee_id=?,status='DRAFT' WHERE id=?`).run(input.customerId,input.paymentMethod,input.paymentTermDays,subtotal,vatTotal,grandTotal,input.downPayment,input.note??null,input.currency,input.exchangeRate,input.instrumentType??null,input.instrumentCount,input.approvalAssigneeId??null,editId!);
      }
      const result = previous ? {lastInsertRowid:editId!} : db
        .prepare(
          `INSERT INTO sales
      (customer_id, created_by, status, payment_method, payment_term_days, subtotal, vat_total, grand_total, down_payment, note,
       currency, exchange_rate, exchange_rate_date, instrument_type, instrument_count, first_due_date, due_interval_days,approval_assignee_id)
      VALUES (?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, date('now'), ?, ?, ?, ?,?)`,
        )
        .run(
          input.customerId,
          req.user.id,
          input.paymentMethod,
          input.paymentTermDays,
          subtotal,
          vatTotal,
          grandTotal,
          input.downPayment,
          input.note ?? null,
          input.currency,
          input.exchangeRate,
          input.instrumentType ?? null,
          input.instrumentCount,
          input.firstDueDate ?? null,
          input.dueIntervalDays ?? null,
          input.approvalAssigneeId ?? null,
        );
      const saleId = Number(result.lastInsertRowid);
      const number = previous?.number ?? `SAT-${new Date().getFullYear()}-${String(saleId).padStart(6, "0")}`;
      db.prepare("UPDATE sales SET order_kind=?,advance_amount=? WHERE id=?").run(input.orderKind,input.advanceAmount,saleId);
      db.prepare("UPDATE sales SET number=? WHERE id=?").run(number, saleId);
      const addItem = db.prepare(
        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, vat_rate, line_total) VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const item of calculatedItems)
        addItem.run(
          saleId,
          item.productId,
          item.quantity,
          item.unitPrice,
          item.vatRate,
          item.lineTotal,
        );
      if (input.downPayment > 0)
        db.prepare(
          `INSERT INTO payment_schedules (sale_id,sequence_no,payment_type,due_date,amount,currency,exchange_rate) VALUES (?,0,'CASH',date('now'),?,?,?)`,
        ).run(saleId, input.downPayment, input.currency, input.exchangeRate);
      if (usesInstrument && remainingTotal > 0) {
        const plan = input.paymentSchedule!;
        const addSchedule = db.prepare(
          `INSERT INTO payment_schedules (sale_id,sequence_no,payment_type,due_date,amount,currency,exchange_rate) VALUES (?,?,?,?,?,?,?)`,
        );
        for (let index = 0; index < plan.length; index++) {
          addSchedule.run(
            saleId,
            index + 1,
            input.instrumentType!,
            plan[index].dueDate,
            plan[index].amount,
            input.currency,
            input.exchangeRate,
          );
        }
      }
      if (input.paymentMethod === "TERM" && remainingTotal > 0) {
        const plan = input.paymentSchedule!;
        const addSchedule = db.prepare(
          `INSERT INTO payment_schedules (sale_id,sequence_no,payment_type,due_date,amount,currency,exchange_rate) VALUES (?,?,'BANK_TRANSFER',?,?,?,?)`,
        );
        for (let index = 0; index < plan.length; index++) {
          addSchedule.run(
            saleId,
            index + 1,
            plan[index].dueDate,
            plan[index].amount,
            input.currency,
            input.exchangeRate,
          );
        }
      }
      audit(
        req.user.id,
        previous ? "SALE_UPDATED" : "SALE_CREATED",
        "sale",
        saleId,
        previous ?? null,
        { number, ...input, subtotal, vatTotal, grandTotal },
        req.ip,
        req.correlationId,
      );
      return {
        id: saleId,
        number,
        subtotal,
        vatTotal,
        grandTotal,
        currency: input.currency,
      };
    });
  res.status(previous ? 200 : 201).json(create());
};
app.post("/api/sales", allow("SALES", "ADMIN"), saveSale);
app.put("/api/sales/:id", allow("SALES", "ADMIN"), saveSale);

app.post("/api/sales/:id/submit", allow("SALES", "ADMIN"), (req, res) => {
  const id = Number(req.params.id);
  const sale = db.prepare("SELECT * FROM sales WHERE id=?").get(id) as
    | {
        id: number;
        status: string;
        created_by: number;
        number: string;
        grand_total: number;
        approval_assignee_id:number|null;
      }
    | undefined;
  if (!sale) return res.status(404).json({ message: "Satış bulunamadı." });
  if (sale.created_by !== req.user.id && req.user.role !== "ADMIN")
    return res
      .status(403)
      .json({ message: "Yalnızca kendi satışınızı gönderebilirsiniz." });
  if (!["DRAFT", "REVISION_REQUESTED"].includes(sale.status))
    return res
      .status(409)
      .json({ message: "Bu satış mevcut durumunda onaya gönderilemez." });
  let manager = sale.approval_assignee_id?db.prepare("SELECT id FROM users WHERE id=? AND role='ADMIN' AND active=1 AND id<>?").get(sale.approval_assignee_id,req.user.id) as {id:number}|undefined:db
    .prepare(
      "SELECT id FROM users WHERE role='ADMIN' AND active=1 AND id<>? ORDER BY id LIMIT 1",
    )
    .get(req.user.id) as { id: number } | undefined;
  if (!manager)
    return res
      .status(409)
      .json({
        message:
          "İşlemi oluşturan kişiden farklı aktif bir yönetici bulunamadı.",
      });
  const delegate = db
    .prepare(
      "SELECT to_user_id id FROM delegations WHERE from_user_id=? AND active=1 AND scope='APPROVAL' AND date('now') BETWEEN start_date AND end_date ORDER BY id DESC LIMIT 1",
    )
    .get(manager.id) as { id: number } | undefined;
  if (delegate && delegate.id !== req.user.id) manager = delegate;

  transaction(() => {
    db.prepare("UPDATE sales SET status='PENDING_APPROVAL' WHERE id=?").run(id);
    const approval = db
      .prepare(
        `INSERT INTO approvals (entity_type, entity_id, requested_by, assigned_to) VALUES ('SALE', ?, ?, ?)`,
      )
      .run(id, req.user.id, manager.id);
    db.prepare(
      `INSERT INTO notifications (user_id, title, message, link) VALUES (?, ?, ?, ?)`,
    ).run(
      manager.id,
      "Yeni satış onayı",
      `${sale.number} numaralı ${sale.grand_total.toLocaleString("tr-TR")} TL satış onayınızı bekliyor.`,
      "/onaylar",
    );
    audit(
      req.user.id,
      "SALE_SUBMITTED",
      "sale",
      id,
      { status: sale.status },
      {
        status: "PENDING_APPROVAL",
        approvalId: Number(approval.lastInsertRowid),
      },
      req.ip,
      req.correlationId,
    );
  });
  res.json({ message: "Satış yönetici onayına gönderildi." });
});

app.get("/api/approvals", allow("ADMIN", "AUDITOR"), (req, res) => {
  const approvals = db
    .prepare(
      `SELECT a.id, a.status, a.reason, a.requested_at requestedAt,
    s.id saleId, s.number saleNumber, s.grand_total grandTotal, s.currency, s.exchange_rate exchangeRate, s.payment_method paymentMethod,
    c.name customerName, c.balance, c.risk_limit riskLimit, u.name requestedBy
    FROM approvals a JOIN sales s ON a.entity_type='SALE' AND s.id=a.entity_id
    JOIN customers c ON c.id=s.customer_id JOIN users u ON u.id=a.requested_by
    WHERE a.assigned_to=? ORDER BY CASE a.status WHEN 'PENDING' THEN 0 ELSE 1 END, a.id DESC`,
    )
    .all(req.user.id);
  res.json(approvals);
});

const decisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "REVISION_REQUESTED"]),
  reason: z.string().trim().max(500).optional(),
});
app.post("/api/approvals/:id/decision", allow("ADMIN"), (req, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ message: "Karar geçersiz." });
  if (parsed.data.decision !== "APPROVED" && !parsed.data.reason)
    return res
      .status(400)
      .json({ message: "Ret veya düzeltme nedeni zorunludur." });
  const approval = db
    .prepare("SELECT * FROM approvals WHERE id=?")
    .get(Number(req.params.id)) as
    | {
        id: number;
        status: string;
        entity_id: number;
        requested_by: number;
        assigned_to: number;
      }
    | undefined;
  if (!approval)
    return res.status(404).json({ message: "Onay kaydı bulunamadı." });
  if (approval.requested_by === req.user.id)
    return res
      .status(403)
      .json({
        message:
          "Kendi oluşturduğunuz işlemi onaylayamazsınız. İşlem diğer yöneticiye yönlendirilmelidir.",
      });
  if (approval.assigned_to !== req.user.id)
    return res
      .status(403)
      .json({ message: "Bu onay başka bir yöneticiye atanmış." });
  if (approval.status !== "PENDING")
    return res
      .status(409)
      .json({ message: "Bu onay daha önce sonuçlandırılmış." });

  if (parsed.data.decision === "APPROVED") {
    const credit = db.prepare("SELECT s.advance_amount amount,s.exchange_rate rate,c.balance FROM sales s JOIN customers c ON c.id=s.customer_id WHERE s.id=?").get(approval.entity_id) as {amount:number;rate:number;balance:number};
    if (credit.amount * credit.rate > Math.max(0,-credit.balance)+0.01) return res.status(409).json({message:"Cari avans bakiyesi değişti. Sipariş için düzeltme isteyin."});
  }
  const saleStatus =
    parsed.data.decision === "APPROVED"
      ? "APPROVED"
      : parsed.data.decision === "REJECTED"
        ? "REJECTED"
        : "REVISION_REQUESTED";
  transaction(() => {
    db.prepare(
      "UPDATE approvals SET status=?, reason=?, decided_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING'",
    ).run(parsed.data.decision, parsed.data.reason ?? null, approval.id);
    db.prepare(
      "UPDATE sales SET status=?, approved_at=CASE WHEN ?='APPROVED' THEN CURRENT_TIMESTAMP ELSE approved_at END WHERE id=?",
    ).run(saleStatus, saleStatus, approval.entity_id);
    if (parsed.data.decision === "APPROVED") {
      const sale = db
        .prepare(
          "SELECT customer_id,exchange_rate,currency,grand_total,down_payment,advance_amount,number,payment_method FROM sales WHERE id=?",
        )
        .get(approval.entity_id) as {
        customer_id: number;
        exchange_rate: number;
        currency: string;
        grand_total: number;
        down_payment: number;
        advance_amount: number;
        number: string;
        payment_method: string;
      };
      postLedger({
        customerId: sale.customer_id,
        type: "SALE",
        date: new Date().toISOString().slice(0, 10),
        description: `${sale.number} satış borcu`,
        debit: sale.grand_total * sale.exchange_rate,
        currency: sale.currency,
        foreignAmount: sale.grand_total,
        rate: sale.exchange_rate,
        sourceType: "SALE",
        sourceId: approval.entity_id,
        actorId: req.user.id,
      });
      if (sale.down_payment > 0)
        postLedger({
          customerId: sale.customer_id,
          type: "DOWN_PAYMENT",
          date: new Date().toISOString().slice(0, 10),
          description: `${sale.number} peşinat`,
          credit: sale.down_payment * sale.exchange_rate,
          currency: sale.currency,
          foreignAmount: sale.down_payment,
          rate: sale.exchange_rate,
          sourceType: "DOWN_PAYMENT",
          sourceId: approval.entity_id,
          actorId: req.user.id,
        });
      if (sale.payment_method === "CASH" && sale.grand_total - sale.down_payment - sale.advance_amount > 0)
        postLedger({
          customerId: sale.customer_id,
          type: "CASH_RECEIPT",
          date: new Date().toISOString().slice(0, 10),
          description: `${sale.number} peşin tahsilat`,
          credit: (sale.grand_total - sale.down_payment - sale.advance_amount) * sale.exchange_rate,
          currency: sale.currency,
          foreignAmount: sale.grand_total - sale.down_payment - sale.advance_amount,
          rate: sale.exchange_rate,
          sourceType: "CASH_SALE",
          sourceId: approval.entity_id,
          actorId: req.user.id,
        });
      const schedules = db
        .prepare(
          "SELECT * FROM payment_schedules WHERE sale_id=? AND payment_type IN ('CHECK','PROMISSORY_NOTE') AND status='PLANNED' ORDER BY sequence_no",
        )
        .all(approval.entity_id) as {
        id: number;
        payment_type: string;
        due_date: string;
        amount: number;
        currency: string;
        exchange_rate: number;
        sequence_no: number;
      }[];
      const addInstrument = db.prepare(`INSERT INTO negotiable_instruments
        (number,instrument_type,customer_id,sale_id,payment_schedule_id,due_date,amount,currency,exchange_rate,try_amount,created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
      for (const schedule of schedules) {
        const number = `EVR-${new Date().getFullYear()}-${String(approval.entity_id).padStart(6, "0")}-${String(schedule.sequence_no).padStart(2, "0")}`;
        addInstrument.run(
          number,
          schedule.payment_type,
          sale.customer_id,
          approval.entity_id,
          schedule.id,
          schedule.due_date,
          schedule.amount,
          schedule.currency,
          schedule.exchange_rate,
          schedule.amount * schedule.exchange_rate,
          approval.requested_by,
        );
        db.prepare(
          "UPDATE payment_schedules SET status='INSTRUMENT_CREATED' WHERE id=?",
        ).run(schedule.id);
      }
    }
    const title =
      parsed.data.decision === "APPROVED"
        ? "Satış onaylandı"
        : parsed.data.decision === "REJECTED"
          ? "Satış reddedildi"
          : "Satış için düzeltme istendi";
    db.prepare(
      "INSERT INTO notifications (user_id,title,message,link) VALUES (?,?,?,?)",
    ).run(
      approval.requested_by,
      title,
      parsed.data.reason ?? "İşlem yönetici tarafından onaylandı.",
      "/satislar",
    );
    audit(
      req.user.id,
      `APPROVAL_${parsed.data.decision}`,
      "approval",
      approval.id,
      { status: approval.status },
      parsed.data,
      req.ip,
      req.correlationId,
    );
  });
  res.json({ message: "Onay kararı kaydedildi." });
});

app.get(
  "/api/shipments",
  allow("ADMIN", "SALES", "SHIPPING", "ACCOUNTING", "AUDITOR"),
  (_req, res) => {
    res.json(
      db
        .prepare(
          `SELECT sh.id,sh.number,sh.status,sh.planned_date plannedDate,sh.actual_date actualDate,sh.delivery_address deliveryAddress,
    sh.vehicle_plate vehiclePlate,sh.driver_name driverName,sh.dispatch_number dispatchNumber,sh.recipient_name recipientName,
    s.id saleId,s.number saleNumber,c.name customerName,
    (SELECT COALESCE(SUM(quantity),0) FROM shipment_items WHERE shipment_id=sh.id) totalQuantity
    FROM shipments sh JOIN sales s ON s.id=sh.sale_id JOIN customers c ON c.id=sh.customer_id ORDER BY sh.planned_date,sh.id DESC`,
        )
        .all(),
    );
  },
);

app.get("/api/shipments/:id",allow("ADMIN","SALES","SHIPPING","ACCOUNTING","AUDITOR"),(req,res)=>{
  const id=Number(req.params.id);const shipment=db.prepare(`SELECT sh.id,sh.number,sh.status,sh.planned_date plannedDate,sh.actual_date actualDate,sh.delivery_address deliveryAddress,sh.vehicle_plate vehiclePlate,sh.driver_name driverName,sh.dispatch_number dispatchNumber,sh.recipient_name recipientName,sh.note,s.number saleNumber,c.name customerName FROM shipments sh JOIN sales s ON s.id=sh.sale_id JOIN customers c ON c.id=sh.customer_id WHERE sh.id=?`).get(id);
  if(!shipment)return res.status(404).json({message:"Sevkiyat bulunamadı."});
  const items=db.prepare(`SELECT p.code,p.name,p.unit,shi.quantity FROM shipment_items shi JOIN products p ON p.id=shi.product_id WHERE shi.shipment_id=?`).all(id);res.json({shipment,items});
});

app.get(
  "/api/shipment-plans",
  allow("ADMIN", "SALES", "SHIPPING"),
  (_req, res) => {
    const sales = db
      .prepare(
        `SELECT s.id,s.number,c.id customerId,c.name customerName,c.city,
    COUNT(si.id) lineCount,SUM(si.quantity) soldQuantity,
    SUM(si.quantity-COALESCE((SELECT SUM(shi.quantity) FROM shipment_items shi JOIN shipments sh ON sh.id=shi.shipment_id WHERE shi.sale_item_id=si.id AND sh.status<>'CANCELLED'),0)) remainingQuantity
    FROM sales s JOIN customers c ON c.id=s.customer_id JOIN sale_items si ON si.sale_id=s.id
    WHERE s.status IN ('APPROVED','COMPLETED') GROUP BY s.id HAVING remainingQuantity>0 ORDER BY s.id DESC`,
      )
      .all();
    res.json(sales);
  },
);

app.get(
  "/api/sales/:id/shipment-plan",
  allow("ADMIN", "SALES", "SHIPPING"),
  (req, res) => {
    const sale = db
      .prepare(
        `SELECT s.id,s.number,s.status,c.id customerId,c.name customerName,c.city FROM sales s JOIN customers c ON c.id=s.customer_id WHERE s.id=?`,
      )
      .get(Number(req.params.id));
    if (!sale) return res.status(404).json({ message: "Satış bulunamadı." });
    const items = db
      .prepare(
        `SELECT si.id saleItemId,p.id productId,p.code,p.name,p.unit,si.quantity soldQuantity,
    COALESCE((SELECT SUM(shi.quantity) FROM shipment_items shi JOIN shipments sh ON sh.id=shi.shipment_id WHERE shi.sale_item_id=si.id AND sh.status<>'CANCELLED'),0) allocatedQuantity,
    si.quantity-COALESCE((SELECT SUM(shi.quantity) FROM shipment_items shi JOIN shipments sh ON sh.id=shi.shipment_id WHERE shi.sale_item_id=si.id AND sh.status<>'CANCELLED'),0) remainingQuantity
    FROM sale_items si JOIN products p ON p.id=si.product_id WHERE si.sale_id=?`,
      )
      .all(Number(req.params.id));
    res.json({ sale, items });
  },
);

const shipmentSchema = z.object({
  saleId: z.number().int().positive(),
  plannedDate: z.string().date(),
  deliveryAddress: z.string().trim().min(3).max(300),
  vehiclePlate: z.string().trim().max(20).optional(),
  driverName: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        saleItemId: z.number().int().positive(),
        quantity: z.number().positive(),
      }),
    )
    .min(1),
});
app.post("/api/shipments", allow("ADMIN", "SHIPPING"), (req, res) => {
  const parsed = shipmentSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ message: "Sevkiyat bilgileri eksik veya geçersiz." });
  const input = parsed.data;
  const sale = db
    .prepare("SELECT id,customer_id,status FROM sales WHERE id=?")
    .get(input.saleId) as
    { id: number; customer_id: number; status: string } | undefined;
  if (!sale || !["APPROVED", "COMPLETED"].includes(sale.status))
    return res
      .status(409)
      .json({
        message: "Yalnızca onaylanmış satış için sevkiyat oluşturulabilir.",
      });
  const validated = input.items.map((item) => {
    const row = db
      .prepare(
        `SELECT si.id,si.product_id productId,si.quantity,
      COALESCE((SELECT SUM(shi.quantity) FROM shipment_items shi JOIN shipments sh ON sh.id=shi.shipment_id WHERE shi.sale_item_id=si.id AND sh.status<>'CANCELLED'),0) allocated
      FROM sale_items si WHERE si.id=? AND si.sale_id=?`,
      )
      .get(item.saleItemId, input.saleId) as
      | { id: number; productId: number; quantity: number; allocated: number }
      | undefined;
    if (!row) throw new Error("Satış ürünü bulunamadı.");
    if (item.quantity > row.quantity - row.allocated)
      throw new Error(
        `Sevk miktarı kalan miktarı aşıyor. En fazla ${row.quantity - row.allocated} sevk edilebilir.`,
      );
    return { ...item, productId: row.productId };
  });
  const result = transaction(() => {
    const inserted = db
      .prepare(
        `INSERT INTO shipments (sale_id,customer_id,planned_date,delivery_address,vehicle_plate,driver_name,note,created_by) VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(
        input.saleId,
        sale.customer_id,
        input.plannedDate,
        input.deliveryAddress,
        input.vehiclePlate || null,
        input.driverName || null,
        input.note || null,
        req.user.id,
      );
    const id = Number(inserted.lastInsertRowid);
    const number = `SVK-${new Date().getFullYear()}-${String(id).padStart(6, "0")}`;
    db.prepare("UPDATE shipments SET number=? WHERE id=?").run(number, id);
    const add = db.prepare(
      "INSERT INTO shipment_items (shipment_id,sale_item_id,product_id,quantity) VALUES (?,?,?,?)",
    );
    for (const item of validated)
      add.run(id, item.saleItemId, item.productId, item.quantity);
    audit(
      req.user.id,
      "SHIPMENT_CREATED",
      "shipment",
      id,
      null,
      { number, ...input },
      req.ip,
      req.correlationId,
    );
    return { id, number };
  });
  res.status(201).json({ ...result, message: "Sevkiyat planı oluşturuldu." });
});

const shipmentStatusSchema = z.object({
  status: z.enum([
    "PREPARING",
    "READY",
    "IN_TRANSIT",
    "PARTIALLY_DELIVERED",
    "DELIVERED",
    "CANCELLED",
  ]),
  vehiclePlate: z.string().trim().max(20).optional(),
  driverName: z.string().trim().max(120).optional(),
  dispatchNumber: z.string().trim().max(60).optional(),
  recipientName: z.string().trim().max(120).optional(),
  actualDate: z.string().date().optional(),
  note: z.string().trim().max(500).optional(),
});
app.post(
  "/api/shipments/:id/status",
  allow("ADMIN", "SHIPPING"),
  (req, res) => {
    const parsed = shipmentStatusSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: "Sevkiyat durumu geçersiz." });
    const shipment = db
      .prepare("SELECT * FROM shipments WHERE id=?")
      .get(Number(req.params.id)) as
      { id: number; status: string; number: string } | undefined;
    if (!shipment)
      return res.status(404).json({ message: "Sevkiyat bulunamadı." });
    const order = [
      "PLANNED",
      "PREPARING",
      "READY",
      "IN_TRANSIT",
      "PARTIALLY_DELIVERED",
      "DELIVERED",
    ];
    if (["DELIVERED", "CANCELLED"].includes(shipment.status))
      return res
        .status(409)
        .json({ message: "Tamamlanmış sevkiyat değiştirilemez." });
    if (
      parsed.data.status !== "CANCELLED" &&
      order.indexOf(parsed.data.status) < order.indexOf(shipment.status)
    )
      return res
        .status(409)
        .json({ message: "Sevkiyat durumu geriye alınamaz." });
    if (
      parsed.data.status === "IN_TRANSIT" &&
      !(parsed.data.vehiclePlate || parsed.data.driverName)
    )
      return res
        .status(400)
        .json({
          message:
            "Yola çıkış için araç plakası veya şoför bilgisi zorunludur.",
        });
    if (parsed.data.status === "DELIVERED" && !parsed.data.recipientName)
      return res.status(400).json({ message: "Teslim alan kişi zorunludur." });
    db.prepare(
      `UPDATE shipments SET status=?,vehicle_plate=COALESCE(?,vehicle_plate),driver_name=COALESCE(?,driver_name),dispatch_number=COALESCE(?,dispatch_number),recipient_name=COALESCE(?,recipient_name),actual_date=CASE WHEN ?='DELIVERED' THEN COALESCE(?,date('now')) ELSE actual_date END,note=COALESCE(?,note) WHERE id=?`,
    ).run(
      parsed.data.status,
      parsed.data.vehiclePlate || null,
      parsed.data.driverName || null,
      parsed.data.dispatchNumber || null,
      parsed.data.recipientName || null,
      parsed.data.status,
      parsed.data.actualDate || null,
      parsed.data.note || null,
      shipment.id,
    );
    audit(
      req.user.id,
      "SHIPMENT_STATUS_CHANGED",
      "shipment",
      shipment.id,
      { status: shipment.status },
      parsed.data,
      req.ip,
      req.correlationId,
    );
    res.json({ message: `${shipment.number} durumu güncellendi.` });
  },
);

app.get(
  "/api/instruments",
  allow("ADMIN", "ACCOUNTING", "AUDITOR"),
  (_req, res) => {
    res.json(
      db
        .prepare(
          `SELECT n.id,n.number,n.instrument_type instrumentType,n.serial_number serialNumber,n.bank_name bankName,
    n.issuer,n.issue_date issueDate,n.due_date dueDate,n.amount,
    CASE WHEN ps.currency IS NOT NULL AND n.currency<>ps.currency THEN ps.currency ELSE n.currency END currency,
    CASE WHEN ps.exchange_rate IS NOT NULL AND n.currency<>ps.currency THEN ps.exchange_rate ELSE n.exchange_rate END exchangeRate,
    CASE WHEN ps.exchange_rate IS NOT NULL AND n.currency<>ps.currency THEN ROUND(n.amount*ps.exchange_rate,2) ELSE n.try_amount END tryAmount,
    n.status,n.current_holder currentHolder,
    dm.counterparty discountCompany,dm.discount_rate discountRate,dm.fee_amount discountFee,dm.commission_amount discountCommission,dm.tax_amount discountTax,dm.net_amount discountNetAmount,dm.cash_amount discountCashAmount,dm.finance_cost discountFinanceCost,dm.movement_date discountDate,dm.pricing_method discountPricingMethod,dm.annual_rate discountAnnualRate,dm.days_to_maturity discountDays,dm.with_recourse discountWithRecourse,
    em.counterparty endorsementCompany,em.settlement_amount endorsementAmount,em.movement_date endorsementDate,em.document_reference endorsementReference,
    CAST(julianday(n.due_date)-julianday(date('now')) AS INTEGER) daysToDue,
    r.receipt_date collectionDate,r.exchange_rate collectionRate,r.try_amount collectedTryAmount,
    CASE WHEN r.id IS NULL THEN NULL ELSE ROUND(n.amount*(r.exchange_rate-n.exchange_rate),2) END exchangeDifference,
    c.name customerName,s.number saleNumber FROM negotiable_instruments n JOIN customers c ON c.id=n.customer_id
    LEFT JOIN sales s ON s.id=n.sale_id
    LEFT JOIN payment_schedules ps ON ps.id=n.payment_schedule_id
    LEFT JOIN receipts r ON r.id=(SELECT MAX(r2.id) FROM receipts r2 WHERE r2.payment_schedule_id=n.payment_schedule_id AND r2.status='COMPLETED')
    LEFT JOIN instrument_movements dm ON dm.id=(SELECT MAX(im.id) FROM instrument_movements im WHERE im.instrument_id=n.id AND im.discount_rate IS NOT NULL)
    LEFT JOIN instrument_movements em ON em.id=(SELECT MAX(im2.id) FROM instrument_movements im2 WHERE im2.instrument_id=n.id AND im2.movement_kind='ENDORSEMENT')
    ORDER BY n.due_date,n.id`,
        )
        .all(),
    );
  },
);

const instrumentIntakeSchema=z.object({
  customerId:z.number().int().positive(),amount:z.number().positive(),currency:z.enum(["TRY","USD","EUR"]),exchangeRate:z.number().positive(),
  issuer:z.string().trim().min(2).max(160),serialNumber:z.string().trim().min(1).max(80),bankName:z.string().trim().min(2).max(120),issueDate:z.string().date(),dueDate:z.string().date(),note:z.string().trim().max(500).optional()
});
function receiveCheck(input: z.infer<typeof instrumentIntakeSchema>, req: Request, batchId?: number, receivedDate = input.issueDate) {
  const duplicate = db.prepare("SELECT id FROM negotiable_instruments WHERE instrument_type='CHECK' AND lower(trim(serial_number))=lower(?) AND lower(trim(bank_name))=lower(?) AND lower(trim(issuer))=lower(?)").get(input.serialNumber,input.bankName,input.issuer);
  if(duplicate) throw new Error(`Çek zaten kayıtlı: ${input.serialNumber}`);
  if(input.currency==="TRY"&&input.exchangeRate!==1) throw new Error("TL işlemlerde kur 1 olmalıdır.");
  if(input.dueDate<input.issueDate) throw new Error("Çek vadesi düzenleme tarihinden önce olamaz.");
  const tryAmount=Number((input.amount*input.exchangeRate).toFixed(2));
  const inserted=db.prepare(`INSERT INTO negotiable_instruments (number,instrument_type,customer_id,due_date,amount,currency,exchange_rate,try_amount,status,current_holder,issuer,serial_number,bank_name,issue_date,created_by,check_advance_id) VALUES (?,'CHECK',?,?,?,?,?,?,'IN_PORTFOLIO','Çelmak',?,?,?,?,?,?)`).run(randomUUID(),input.customerId,input.dueDate,input.amount,input.currency,input.exchangeRate,tryAmount,input.issuer,input.serialNumber,input.bankName,input.issueDate,req.user.id,batchId??null);
  const id=Number(inserted.lastInsertRowid);
  const number=`EVR-${new Date().getFullYear()}-S-${String(id).padStart(6,"0")}`;
  db.prepare("UPDATE negotiable_instruments SET number=? WHERE id=?").run(number,id);
  db.prepare(`INSERT INTO instrument_movements (instrument_id,from_status,to_status,counterparty,movement_date,note,created_by) VALUES (?,'PLANNED','IN_PORTFOLIO','Çelmak',?,?,?)`).run(id,receivedDate,input.note||null,req.user.id);
  postLedger({customerId:input.customerId,type:"INSTRUMENT_RECEIVED",date:receivedDate,description:`${number} ${batchId?`BAĞ-${batchId} bağlantı avansı · `:""}çek teslim alındı`,credit:tryAmount,currency:input.currency,foreignAmount:input.amount,rate:input.exchangeRate,sourceType:"INSTRUMENT_RECEIVED",sourceId:id,actorId:req.user.id});
  audit(req.user.id,"INSTRUMENT_RECEIVED","negotiable_instrument",id,null,{number,...input,batchId,receivedDate},req.ip,req.correlationId);
  return {id,number};
}
app.post("/api/instruments/intake",allow("ADMIN","ACCOUNTING"),(req,res)=>{
  const parsed=instrumentIntakeSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({message:"Teslim alınan çek bilgileri eksik veya geçersiz."});
  const input=parsed.data;
  if(!db.prepare("SELECT id FROM customers WHERE id=? AND active=1").get(input.customerId))return res.status(404).json({message:"Müşteri bulunamadı."});
  const result=transaction(()=>receiveCheck(input,req));
  res.status(201).json({...result,message:`${result.number} portföye alındı ve müşteri carisinden düşüldü.`});
});

const checkAdvanceSchema=z.object({
  requestId:z.string().uuid(),customerId:z.number().int().positive(),
  currency:z.enum(["TRY","USD","EUR"]),exchangeRate:z.number().positive(),
  receivedDate:z.string().date(),targetAmount:z.number().positive().optional(),
  note:z.string().trim().max(500).optional(),
  checks:z.array(instrumentIntakeSchema.pick({amount:true,issuer:true,serialNumber:true,bankName:true,issueDate:true,dueDate:true})).min(1).max(100),
});
app.post("/api/receipts/check-advances",allow("ADMIN","ACCOUNTING"),(req,res)=>{
  const parsed=checkAdvanceSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({message:"Her çekin tutarı, keşidecisi, banka/seri bilgileri ve tarihleri zorunludur (en fazla 100 çek)."});
  const input=parsed.data;
  const result=transaction(()=>{
    const previous=db.prepare("SELECT id,request_hash requestHash,customer_id customerId,created_by createdBy,total_amount total FROM check_advances WHERE request_id=?").get(input.requestId) as {id:number;requestHash:string;customerId:number;createdBy:number;total:number}|undefined;
    const requestHash=createHash("sha256").update(JSON.stringify(input)).digest("hex");
    if(previous){
      if(previous.requestHash!==requestHash)throw new Error("Bu işlem anahtarıyla farklı çek bilgileri kaydedilmiş. Bağlantı geçmişini kontrol edip yeni giriş için ekranı yeniden açın.");
      if(previous.customerId!==input.customerId||previous.createdBy!==req.user.id)throw new Error("İşlem anahtarı başka bir kayda ait.");
      return {id:previous.id,total:previous.total,repeated:true};
    }
    if(!db.prepare("SELECT id FROM customers WHERE id=? AND active=1").get(input.customerId))throw new Error("Müşteri bulunamadı.");
    const total=Number(input.checks.reduce((sum,c)=>sum+c.amount,0).toFixed(2));
    const inserted=db.prepare("INSERT INTO check_advances(request_id,customer_id,target_amount,total_amount,currency,exchange_rate,received_date,note,created_by,request_hash) VALUES (?,?,?,?,?,?,?,?,?,?)").run(input.requestId,input.customerId,input.targetAmount??null,total,input.currency,input.exchangeRate,input.receivedDate,input.note??null,req.user.id,requestHash);
    const id=Number(inserted.lastInsertRowid);
    for(const check of input.checks)receiveCheck({...check,customerId:input.customerId,currency:input.currency,exchangeRate:input.exchangeRate,note:input.note},req,id,input.receivedDate);
    audit(req.user.id,"CHECK_ADVANCE_CREATED","check_advance",id,null,{...input,total},req.ip,req.correlationId);
    return {id,total,repeated:false};
  });
  res.status(result.repeated?200:201).json({...result,message:`BAĞ-${result.id} bağlantısı kaydedildi. Çek toplamı ${result.total.toLocaleString("tr-TR")} ${input.currency}. Çekler portföyde; banka tahsilatı henüz yapılmadı.`});
});
app.get("/api/receipts/check-advances",(req,res)=>{
  const customerId=Number(req.query.customerId);
  if(!Number.isInteger(customerId)||customerId<=0)return res.status(400).json({message:"Cari seçin."});
  const batches=db.prepare("SELECT id,target_amount targetAmount,total_amount totalAmount,currency,exchange_rate exchangeRate,received_date receivedDate,note FROM check_advances WHERE customer_id=? ORDER BY id DESC").all(customerId);
  res.json(batches.map(b=>({...b,checks:db.prepare("SELECT id,number,amount,bank_name bankName,serial_number serialNumber,issuer,issue_date issueDate,due_date dueDate,status FROM negotiable_instruments WHERE check_advance_id=? ORDER BY id").all(b.id)})));
});

const discountSchema = z.object({
  company: z.string().trim().min(2).max(160),
  discountRate: z.number().min(0).max(100),
  pricingMethod: z.enum(["DIRECT", "ANNUAL"]).default("DIRECT"),
  commissionAmount: z.number().min(0).default(0),
  taxAmount: z.number().min(0).default(0),
  feeAmount: z.number().min(0).default(0),
  withRecourse: z.boolean().default(true),
  transactionDate: z.string().date(),
  note: z.string().trim().max(500).optional(),
});

const endorsementSchema = z.object({
  counterpartyCustomerId: z.number().int().positive(),
  settlementAmount: z.number().positive(),
  transactionDate: z.string().date(),
  documentReference: z.string().trim().min(1).max(100),
  note: z.string().trim().max(500).optional(),
});

app.post("/api/instruments/:id/endorse", allow("ADMIN", "ACCOUNTING"), (req, res) => {
  const parsed = endorsementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Ciro bilgileri eksik veya geçersiz." });
  const instrument = db.prepare("SELECT * FROM negotiable_instruments WHERE id=?").get(Number(req.params.id)) as {id:number;number:string;status:string;amount:number;currency:string;exchange_rate:number;customer_id:number;issuer:string|null;serial_number:string|null;bank_name:string|null;instrument_type:string}|undefined;
  if (!instrument) return res.status(404).json({ message: "Ciro edilecek evrak bulunamadı." });
  if (!["IN_PORTFOLIO","GIVEN_TO_BANK"].includes(instrument.status)) return res.status(409).json({ message: "Yalnızca portföydeki veya bankadan geri alınan aktif evrak ciro edilebilir." });
  if (!instrument.issuer || !instrument.serial_number || (instrument.instrument_type === "CHECK" && !instrument.bank_name)) return res.status(409).json({ message: "Cirodan önce evrak bilgilerini tamamlayın." });
  if (parsed.data.counterpartyCustomerId === instrument.customer_id) return res.status(400).json({ message: "Çeki aldığınız cari ile ciro edeceğiniz cari aynı olamaz." });
  if (parsed.data.settlementAmount > instrument.amount) return res.status(400).json({ message: "Mahsup tutarı çekin nominal tutarını aşamaz." });
  const counterparty = db.prepare(`SELECT c.id,c.name,c.balance,EXISTS(SELECT 1 FROM customer_tags ct WHERE ct.customer_id=c.id AND ct.tag='SUPPLIER') is_supplier FROM customers c WHERE c.id=? AND c.active=1`).get(parsed.data.counterpartyCustomerId) as {id:number;name:string;balance:number;is_supplier:number}|undefined;
  if (!counterparty || !counterparty.is_supplier) return res.status(400).json({ message: "Ciro yapılacak cari aktif bir tedarikçi olmalıdır." });
  const settlementTry = Number((parsed.data.settlementAmount * instrument.exchange_rate).toFixed(2));
  if (counterparty.balance >= 0) return res.status(409).json({ message: `${counterparty.name} carisinde kapatılabilecek açık tedarikçi borcu bulunmuyor.` });
  if (settlementTry > Math.abs(counterparty.balance) + 0.01) return res.status(409).json({ message: `Mahsup tutarı açık tedarikçi borcunu aşıyor. En fazla ${Math.abs(counterparty.balance).toFixed(2)} TL kapatılabilir.` });
  transaction(() => {
    const movement = db.prepare(`INSERT INTO instrument_movements (instrument_id,from_status,to_status,counterparty,movement_date,note,created_by,movement_kind,counterparty_customer_id,settlement_amount,cash_amount,finance_cost,document_reference) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(instrument.id,instrument.status,"ENDORSED",counterparty.name,parsed.data.transactionDate,parsed.data.note||null,req.user.id,"ENDORSEMENT",counterparty.id,parsed.data.settlementAmount,0,0,parsed.data.documentReference);
    db.prepare("UPDATE negotiable_instruments SET status='ENDORSED',current_holder=? WHERE id=?").run(counterparty.name,instrument.id);
    postLedger({customerId:counterparty.id,type:"INSTRUMENT_PAYMENT",date:parsed.data.transactionDate,description:`${instrument.number} ciro ile borç kapama · ${parsed.data.documentReference}`,debit:settlementTry,currency:instrument.currency,foreignAmount:parsed.data.settlementAmount,rate:instrument.exchange_rate,sourceType:"INSTRUMENT_ENDORSE",sourceId:instrument.id,actorId:req.user.id});
    audit(req.user.id,"INSTRUMENT_ENDORSED","negotiable_instrument",instrument.id,{status:instrument.status},{...parsed.data,counterpartyName:counterparty.name,cashAmount:0,financeCost:0,movementId:Number(movement.lastInsertRowid)},req.ip,req.correlationId);
  });
  res.json({ message: `${instrument.number}, ${counterparty.name} carisine ciro edildi. ${parsed.data.settlementAmount.toFixed(2)} ${instrument.currency} borç kapatıldı; nakit ve finansman maliyeti oluşmadı.` });
});

app.post("/api/instruments/:id/discount", allow("ADMIN", "ACCOUNTING"), (req, res) => {
  const parsed = discountSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Çek kırdırma bilgileri eksik veya geçersiz." });
  const instrument = db.prepare("SELECT * FROM negotiable_instruments WHERE id=? AND instrument_type='CHECK'").get(Number(req.params.id)) as {id:number;number:string;status:string;amount:number;currency:string;due_date:string;issuer:string|null;serial_number:string|null;bank_name:string|null}|undefined;
  if (!instrument) return res.status(404).json({ message: "Kırdırılacak çek bulunamadı." });
  if (["COLLECTED","CANCELLED","ENDORSED","ASSIGNED"].includes(instrument.status)) return res.status(409).json({ message: "Tahsil edilmiş, iptal edilmiş veya devredilmiş çek kırılamaz." });
  if (!instrument.issuer || !instrument.serial_number || !instrument.bank_name) return res.status(409).json({ message: "Kırdırmadan önce keşideci, seri no ve banka bilgilerini tamamlayın." });
  const daysToMaturity=Math.max(0,Math.ceil((new Date(`${instrument.due_date}T12:00:00`).getTime()-new Date(`${parsed.data.transactionDate}T12:00:00`).getTime())/86400000));
  const discountAmount = Number((instrument.amount * parsed.data.discountRate / 100 * (parsed.data.pricingMethod==="ANNUAL"?daysToMaturity/360:1)).toFixed(2));
  const netAmount = Number((instrument.amount - discountAmount - parsed.data.commissionAmount - parsed.data.taxAmount - parsed.data.feeAmount).toFixed(2));
  if (netAmount <= 0) return res.status(400).json({ message: "Kesinti ve masraflar çek tutarından küçük olmalıdır." });
  transaction(() => {
    db.prepare(`INSERT INTO instrument_movements (instrument_id,from_status,to_status,counterparty,movement_date,discount_rate,fee_amount,commission_amount,tax_amount,net_amount,pricing_method,annual_rate,days_to_maturity,with_recourse,note,created_by,movement_kind,settlement_amount,cash_amount,finance_cost) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(instrument.id,instrument.status,"ASSIGNED",parsed.data.company,parsed.data.transactionDate,parsed.data.discountRate,parsed.data.feeAmount,parsed.data.commissionAmount,parsed.data.taxAmount,netAmount,parsed.data.pricingMethod,parsed.data.pricingMethod==="ANNUAL"?parsed.data.discountRate:null,daysToMaturity,parsed.data.withRecourse?1:0,parsed.data.note||null,req.user.id,"DISCOUNT",instrument.amount,netAmount,discountAmount+parsed.data.commissionAmount+parsed.data.taxAmount+parsed.data.feeAmount);
    db.prepare(`INSERT INTO treasury_transactions (instrument_id,transaction_type,transaction_date,currency,gross_amount,bank_amount,discount_amount,commission_amount,tax_amount,other_fee_amount,counterparty,created_by) VALUES (?,'CHECK_DISCOUNT',?,?,?,?,?,?,?,?,?,?)`).run(instrument.id,parsed.data.transactionDate,instrument.currency,instrument.amount,netAmount,discountAmount,parsed.data.commissionAmount,parsed.data.taxAmount,parsed.data.feeAmount,parsed.data.company,req.user.id);
    db.prepare("UPDATE negotiable_instruments SET status='ASSIGNED',current_holder=? WHERE id=?").run(parsed.data.company,instrument.id);
    audit(req.user.id,"INSTRUMENT_DISCOUNTED","negotiable_instrument",instrument.id,{status:instrument.status},{...parsed.data,daysToMaturity,discountAmount,netAmount},req.ip,req.correlationId);
  });
  res.json({ message: `${instrument.number} çeki ${parsed.data.company} firmasında kırdırıldı. Net tutar: ${netAmount}`, discountAmount, netAmount });
});

const instrumentDetailSchema = z.object({
  issuer: z.string().trim().min(2).max(160),
  serialNumber: z.string().trim().min(1).max(80),
  bankName: z.string().trim().max(120).optional(),
  issueDate: z.string().date(),
});
app.put("/api/instruments/:id", allow("ADMIN", "ACCOUNTING"), (req, res) => {
  const parsed = instrumentDetailSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ message: "Evrak detayları eksik veya geçersiz." });
  const instrument = db
    .prepare("SELECT * FROM negotiable_instruments WHERE id=?")
    .get(Number(req.params.id)) as
    | {
        id: number;
        instrument_type: string;
        status: string;
        issuer: string | null;
        serial_number: string | null;
        bank_name: string | null;
        issue_date: string | null;
      }
    | undefined;
  if (!instrument)
    return res.status(404).json({ message: "Kıymetli evrak bulunamadı." });
  if (
    ["COLLECTED", "CANCELLED", "ENDORSED", "ASSIGNED"].includes(
      instrument.status,
    )
  )
    return res
      .status(409)
      .json({
        message:
          "Tamamlanmış veya devredilmiş evrakın detayları değiştirilemez.",
      });
  if (instrument.instrument_type === "CHECK" && !parsed.data.bankName)
    return res
      .status(400)
      .json({ message: "Çek kaydında banka seçimi zorunludur." });
  db.prepare(
    "UPDATE negotiable_instruments SET issuer=?,serial_number=?,bank_name=?,issue_date=? WHERE id=?",
  ).run(
    parsed.data.issuer,
    parsed.data.serialNumber,
    parsed.data.bankName || null,
    parsed.data.issueDate,
    instrument.id,
  );
  audit(
    req.user.id,
    "INSTRUMENT_DETAILS_UPDATED",
    "negotiable_instrument",
    instrument.id,
    {
      issuer: instrument.issuer,
      serialNumber: instrument.serial_number,
      bankName: instrument.bank_name,
      issueDate: instrument.issue_date,
    },
    parsed.data,
    req.ip,
    req.correlationId,
  );
  res.json({ message: "Evrak detayları kaydedildi." });
});

const movementSchema = z.object({
  status: z.enum([
    "IN_PORTFOLIO",
    "GIVEN_TO_BANK",
    "COLLECTED",
    "BOUNCED",
    "PROTESTED",
    "RETURNED",
    "ENDORSED",
    "ASSIGNED",
    "CANCELLED",
  ]),
  counterparty: z.string().trim().max(160).optional(),
  movementDate: z.string().date(),
  exchangeRate: z.number().positive().optional(),
  note: z.string().trim().max(500).optional(),
});

app.post(
  "/api/instruments/:id/movements",
  allow("ADMIN", "ACCOUNTING"),
  (req, res) => {
    const parsed = movementSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ message: "Kıymetli evrak hareketi geçersiz." });
    const instrument = db
      .prepare("SELECT * FROM negotiable_instruments WHERE id=?")
      .get(Number(req.params.id)) as
      | {
          id: number;
          status: string;
          currency: string;
          exchange_rate: number;
          number: string;
          issuer: string | null;
          serial_number: string | null;
          bank_name: string | null;
          instrument_type: "CHECK" | "PROMISSORY_NOTE";
          payment_schedule_id: number | null;
          amount: number;
          customer_id: number;
          sale_id: number | null;
        }
      | undefined;
    if (!instrument)
      return res.status(404).json({ message: "Kıymetli evrak bulunamadı." });
    if (["COLLECTED", "CANCELLED"].includes(instrument.status))
      return res
        .status(409)
        .json({
          message: "Tamamlanmış evrak üzerinde yeni hareket yapılamaz.",
        });
    if (
      !instrument.issuer ||
      !instrument.serial_number ||
      (instrument.instrument_type === "CHECK" && !instrument.bank_name)
    )
      return res
        .status(409)
        .json({
          message:
            "İşlemden önce keşideci/borçlu, seri numarası ve çek için banka bilgilerini tamamlayın.",
        });
    if (
      ["ENDORSED", "ASSIGNED"].includes(parsed.data.status) &&
      !parsed.data.counterparty
    )
      return res
        .status(400)
        .json({
          message:
            "Ciro/temlik işleminde devredilen kişi veya kurum zorunludur.",
        });
    if (
      parsed.data.status === "COLLECTED" &&
      instrument.currency !== "TRY" &&
      !parsed.data.exchangeRate
    )
      return res
        .status(400)
        .json({
          message:
            "Dövizli evrak tahsilatında gerçekleşen tahsilat kuru zorunludur.",
        });
    transaction(() => {
      const wasReceived=!!db.prepare("SELECT 1 FROM account_transactions WHERE source_type='INSTRUMENT_RECEIVED' AND source_id=?").get(instrument.id);
      db.prepare(
        `INSERT INTO instrument_movements (instrument_id,from_status,to_status,counterparty,movement_date,exchange_rate,note,created_by) VALUES (?,?,?,?,?,?,?,?)`,
      ).run(
        instrument.id,
        instrument.status,
        parsed.data.status,
        parsed.data.counterparty ?? null,
        parsed.data.movementDate,
        parsed.data.exchangeRate ?? null,
        parsed.data.note ?? null,
        req.user.id,
      );
      db.prepare(
        "UPDATE negotiable_instruments SET status=?,current_holder=? WHERE id=?",
      ).run(
        parsed.data.status,
        parsed.data.counterparty ?? null,
        instrument.id,
      );
      if (parsed.data.status === "IN_PORTFOLIO" && !wasReceived) {
        postLedger({customerId:instrument.customer_id,type:"INSTRUMENT_RECEIVED",date:parsed.data.movementDate,description:`${instrument.number} çek/senet teslim alındı`,credit:instrument.amount*instrument.exchange_rate,currency:instrument.currency,foreignAmount:instrument.amount,rate:instrument.exchange_rate,sourceType:"INSTRUMENT_RECEIVED",sourceId:instrument.id,actorId:req.user.id});
        if(instrument.payment_schedule_id) db.prepare("UPDATE payment_schedules SET status='PAID',paid_amount=amount WHERE id=?").run(instrument.payment_schedule_id);
      }
      if (parsed.data.status === "COLLECTED" && instrument.payment_schedule_id)
        db.prepare("UPDATE payment_schedules SET status='PAID',paid_amount=amount WHERE id=?").run(
          instrument.payment_schedule_id,
        );
      if (parsed.data.status === "COLLECTED") {
        const collectionRate =
          parsed.data.exchangeRate || instrument.exchange_rate;
        const tryAmount = instrument.amount * collectionRate;
        db.prepare(`INSERT OR IGNORE INTO treasury_transactions (instrument_id,transaction_type,transaction_date,currency,gross_amount,bank_amount,counterparty,created_by) VALUES (?,'CHECK_COLLECTION',?,?,?,?,?,?)`).run(instrument.id,parsed.data.movementDate,instrument.currency,instrument.amount,instrument.amount,instrument.bank_name,req.user.id);
        const receiptResult = db
          .prepare(
            `INSERT INTO receipts (customer_id,sale_id,payment_schedule_id,method,receipt_date,amount,currency,exchange_rate,try_amount,reference,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            instrument.customer_id,
            instrument.sale_id,
            instrument.payment_schedule_id,
            instrument.instrument_type,
            parsed.data.movementDate,
            instrument.amount,
            instrument.currency,
            collectionRate,
            tryAmount,
            instrument.number,
            req.user.id,
          );
        const receiptId = Number(receiptResult.lastInsertRowid);
        const receiptNumber = `THS-${new Date().getFullYear()}-${String(receiptId).padStart(6, "0")}`;
        db.prepare("UPDATE receipts SET number=? WHERE id=?").run(
          receiptNumber,
          receiptId,
        );
        const exchangeDifference = Number(
          (
            instrument.amount *
            (collectionRate - instrument.exchange_rate)
          ).toFixed(2),
        );
        if (exchangeDifference !== 0)
          postLedger({
            customerId: instrument.customer_id,
            type: "EXCHANGE_DIFFERENCE",
            date: parsed.data.movementDate,
            description: `${instrument.number} kur farkı`,
            debit: exchangeDifference > 0 ? exchangeDifference : 0,
            credit: exchangeDifference < 0 ? Math.abs(exchangeDifference) : 0,
            currency: "TRY",
            foreignAmount: 0,
            rate: 1,
            sourceType: "FX_INSTRUMENT",
            sourceId: instrument.id,
            actorId: req.user.id,
          });
        if (!wasReceived) postLedger({customerId:instrument.customer_id,type:"INSTRUMENT_RECEIVED",date:parsed.data.movementDate,description:`${instrument.number} tahsil edildi`,credit:tryAmount,currency:instrument.currency,foreignAmount:instrument.amount,rate:collectionRate,sourceType:"INSTRUMENT_RECEIVED",sourceId:instrument.id,actorId:req.user.id});
        audit(
          req.user.id,
          "EXCHANGE_DIFFERENCE_CALCULATED",
          "negotiable_instrument",
          instrument.id,
          null,
          { collectionRate, exchangeDifference },
          req.ip,
          req.correlationId,
        );
      }
      if (parsed.data.status === "BOUNCED" && wasReceived) {
        postLedger({customerId:instrument.customer_id,type:"INSTRUMENT_BOUNCED",date:parsed.data.movementDate,description:`${instrument.number} karşılıksız çıktı; müşteri borcu yeniden açıldı`,debit:instrument.amount*instrument.exchange_rate,currency:instrument.currency,foreignAmount:instrument.amount,rate:instrument.exchange_rate,sourceType:"INSTRUMENT_BOUNCED",sourceId:instrument.id,actorId:req.user.id});
        const endorsement=db.prepare("SELECT counterparty_customer_id,settlement_amount FROM instrument_movements WHERE instrument_id=? AND movement_kind='ENDORSEMENT' ORDER BY id DESC LIMIT 1").get(instrument.id) as {counterparty_customer_id:number;settlement_amount:number}|undefined;
        if(endorsement?.counterparty_customer_id) postLedger({customerId:endorsement.counterparty_customer_id,type:"INSTRUMENT_PAYMENT_REVERSED",date:parsed.data.movementDate,description:`${instrument.number} karşılıksız; ciro ile kapatılan tedarikçi borcu yeniden açıldı`,credit:endorsement.settlement_amount*instrument.exchange_rate,currency:instrument.currency,foreignAmount:endorsement.settlement_amount,rate:instrument.exchange_rate,sourceType:"INSTRUMENT_ENDORSE_REVERSAL",sourceId:instrument.id,actorId:req.user.id});
        if(instrument.payment_schedule_id) db.prepare("UPDATE payment_schedules SET status='PLANNED',paid_amount=0 WHERE id=?").run(instrument.payment_schedule_id);
      }
      audit(
        req.user.id,
        "INSTRUMENT_STATUS_CHANGED",
        "negotiable_instrument",
        instrument.id,
        { status: instrument.status },
        { ...parsed.data },
        req.ip,
        req.correlationId,
      );
    });
    res.json({ message: `${instrument.number} durumu güncellendi.` });
  },
);

app.get(
  "/api/e-documents",
  allow("ADMIN", "ACCOUNTING", "SHIPPING", "AUDITOR"),
  (_req, res) => {
    res.json(
      db
        .prepare(
          `SELECT e.id,e.document_type documentType,e.source_type sourceType,e.source_id sourceId,e.provider,
    e.external_id externalId,e.uuid,e.document_number documentNumber,e.status,e.error_message errorMessage,e.created_at createdAt,
    s.number sourceNumber FROM e_documents e LEFT JOIN sales s ON e.source_type='SALE' AND s.id=e.source_id ORDER BY e.id DESC`,
        )
        .all(),
    );
  },
);

const documentSchema = z.object({
  documentType: z.enum(["E_INVOICE", "E_ARCHIVE", "E_DISPATCH"]),
  sourceType: z.enum(["SALE", "SHIPMENT"]),
  sourceId: z.number().int().positive(),
});
app.post(
  "/api/e-documents",
  allow("ADMIN", "ACCOUNTING", "SHIPPING"),
  (req, res) => {
    const parsed = documentSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: "e-Belge talebi geçersiz." });
    const provider = (
      db
        .prepare(
          "SELECT value FROM system_settings WHERE key='edocument.provider'",
        )
        .get() as { value: string }
    ).value;
    if (provider === "NOT_CONFIGURED")
      return res
        .status(409)
        .json({
          message:
            "e-Belge sağlayıcısı henüz yapılandırılmadı. Logo, Mikro, Netsis veya özel entegratör seçilmelidir.",
        });
    const result = db
      .prepare(
        `INSERT INTO e_documents (document_type,source_type,source_id,provider,status,created_by) VALUES (?,?,?,?, 'QUEUED',?)`,
      )
      .run(
        parsed.data.documentType,
        parsed.data.sourceType,
        parsed.data.sourceId,
        provider,
        req.user.id,
      );
    audit(
      req.user.id,
      "E_DOCUMENT_QUEUED",
      "e_document",
      Number(result.lastInsertRowid),
      null,
      { ...parsed.data, provider },
      req.ip,
      req.correlationId,
    );
    res.status(201).json({ message: "e-Belge sağlayıcı kuyruğuna alındı." });
  },
);

app.get("/api/audit-logs", allow("ADMIN", "AUDITOR"), (_req, res) => {
  res.json(
    db
      .prepare(
        `SELECT l.id, l.action, l.entity_type entityType, l.entity_id entityId,
    l.ip_address ipAddress, l.correlation_id correlationId, l.created_at createdAt, u.name actor
    FROM audit_logs l LEFT JOIN users u ON u.id=l.actor_id ORDER BY l.id DESC LIMIT 100`,
      )
      .all(),
  );
});

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  void _next;
  const message = error instanceof Error ? error.message : "Beklenmeyen hata";
  console.error(req.correlationId, error);
  res.status(400).json({ message, correlationId: req.correlationId });
});

const port = Number(process.argv[2] || process.env.PORT || 3001);
app.listen(port, "0.0.0.0", () =>
  console.log(`Çelmak API 0.0.0.0:${port} adresinde çalışıyor.`),
);
