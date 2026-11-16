import { useState, type FormEvent } from "react";
import { Copy, Eye, EyeOff, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import { api } from "./api";
import { roleLabels, type Role, type User } from "./types";

/** Okunması kolay, karıştırılmayan karakterlerle (0/O, 1/l yok) güçlü geçici parola üretir. */
function generatePassword(length = 12) {
  const sets = ["ABCDEFGHJKLMNPRSTUVYZ", "abcdefghjkmnprstuvyz", "23456789", "!#%+=?"];
  const all = sets.join("");
  const random = (max: number) => {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] % max;
  };
  const chars = sets.map((set) => set[random(set.length)]);
  while (chars.length < length) chars.push(all[random(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function PasswordField({ label, value, onChange, generator, autoComplete = "new-password" }: { label: string; value: string; onChange: (v: string) => void; generator?: boolean; autoComplete?: string }) {
  const [visible, setVisible] = useState(Boolean(generator));
  const [copied, setCopied] = useState(false);
  return (
    <label className="field password-field">
      <span>{label}</span>
      <span className="password-input">
        <input required minLength={autoComplete === "current-password" ? 1 : 10} type={visible ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" title={visible ? "Gizle" : "Göster"} aria-label={visible ? "Parolayı gizle" : "Parolayı göster"} onClick={() => setVisible(!visible)}>{visible ? <EyeOff /> : <Eye />}</button>
        {generator && <button type="button" title="Yeni parola oluştur" aria-label="Yeni parola oluştur" onClick={() => { onChange(generatePassword()); setVisible(true); setCopied(false); }}><RefreshCw /></button>}
        {generator && value && <button type="button" title="Kopyala" aria-label="Parolayı kopyala" onClick={() => navigator.clipboard?.writeText(value).then(() => setCopied(true)).catch(() => undefined)}><Copy /></button>}
      </span>
      {generator && <small>{copied ? "Kopyalandı. Kullanıcıya güvenli bir yoldan iletin." : "En az 10 karakter. Kullanıcı ilk girişte kendi parolasını belirleyecek."}</small>}
    </label>
  );
}

type ManagedUser = User & { active: boolean };

/** Yeni kullanıcı oluşturma veya mevcut kullanıcının bilgilerini düzenleme. */
export function UserForm({ initial, currentUserId, onSaved, onCancel }: { initial?: ManagedUser; currentUserId: number; onSaved: (message: string, id?: number) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [role, setRole] = useState<Role>(initial?.role || "SALES");
  const [active, setActive] = useState(initial?.active ?? true);
  const [password, setPassword] = useState(() => (initial ? "" : generatePassword()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const self = initial?.id === currentUserId;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = initial
        ? await api<{ message: string }>(`/admin/users/${initial.id}`, { method: "PUT", body: JSON.stringify({ name, email, role, active }) })
        : await api<{ message: string; id: number }>("/admin/users", { method: "POST", body: JSON.stringify({ name, email, role, password }) });
      onSaved(result.message, "id" in result ? (result as { id: number }).id : initial?.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="user-form" onSubmit={submit}>
      <h3>{initial ? "Kullanıcı bilgilerini düzenle" : "Yeni kullanıcı"}</h3>
      {error && <div className="error-box">{error}</div>}
      <div className="form-grid">
        <label className="field"><span>Ad soyad *</span><input required minLength={3} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" /></label>
        <label className="field"><span>E-posta (giriş adı) *</span><input required type="email" maxLength={160} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></label>
        <label className="field">
          <span>Rol *</span>
          <select value={role} disabled={self} onChange={(e) => setRole(e.target.value as Role)}>
            {(Object.keys(roleLabels) as Role[]).map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}
          </select>
          {self && <small>Kendi rolünüzü değiştiremezsiniz.</small>}
          {initial && !self && role !== initial.role && <small className="warn-text">Rol değişince özel ekran yetkileri sıfırlanır; yeni rolün varsayılan ekranları açılır.</small>}
        </label>
        {initial ? (
          <label className="field">
            <span>Durum</span>
            <select value={active ? "1" : "0"} disabled={self} onChange={(e) => setActive(e.target.value === "1")}>
              <option value="1">Aktif — giriş yapabilir</option>
              <option value="0">Pasif — giriş yapamaz</option>
            </select>
            {!active && initial.active && <small className="warn-text">Kaydedince açık oturumları kapatılır. Geçmiş kayıtlarında adı görünmeye devam eder.</small>}
          </label>
        ) : (
          <PasswordField label="Geçici parola *" value={password} onChange={setPassword} generator />
        )}
      </div>
      {initial && email.trim().toLowerCase() !== initial.email.toLowerCase() && <p className="info-note">E-posta değişince kullanıcı yeni adresiyle giriş yapar; açık oturumları kapatılır.</p>}
      <div className="head-actions">
        <button type="button" className="mini-btn" onClick={onCancel} disabled={busy}>Vazgeç</button>
        <button className="primary-btn" disabled={busy}>{busy ? "Kaydediliyor…" : initial ? "Bilgileri kaydet" : "Kullanıcıyı oluştur"}</button>
      </div>
    </form>
  );
}

/** Yöneticinin bir kullanıcıya geçici parola vermesi (parolasını unutan kullanıcı için). */
export function TemporaryPasswordForm({ user, onDone, onCancel }: { user: ManagedUser; onDone: (message: string) => void; onCancel: () => void }) {
  const [password, setPassword] = useState(generatePassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ message: string }>(`/admin/users/${user.id}/password`, { method: "POST", body: JSON.stringify({ password }) });
      onDone(result.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="user-form" onSubmit={submit}>
      <h3>{user.name} için geçici parola</h3>
      <p className="info-note">Kullanıcının açık oturumları kapanır. Bu parolayla girdiğinde kendi parolasını belirlemesi istenir. Parolayı kaydetmeden önce kopyalayın; sonra tekrar gösterilmez.</p>
      {error && <div className="error-box">{error}</div>}
      <div className="form-grid"><PasswordField label="Geçici parola" value={password} onChange={setPassword} generator /></div>
      <div className="head-actions">
        <button type="button" className="mini-btn" onClick={onCancel} disabled={busy}>Vazgeç</button>
        <button className="primary-btn" disabled={busy}>{busy ? "Kaydediliyor…" : "Geçici parolayı kaydet"}</button>
      </div>
    </form>
  );
}

/** Kullanıcının kendi parolasını değiştirmesi. */
export function PasswordChangeForm({ onDone }: { onDone: (message: string) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mismatch = repeat.length > 0 && next !== repeat;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== repeat) return setError("Yeni parolalar birbiriyle aynı değil.");
    setBusy(true);
    setError("");
    try {
      const result = await api<{ message: string }>("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      setCurrent("");
      setNext("");
      setRepeat("");
      onDone(result.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="password-change" onSubmit={submit}>
      {error && <div className="error-box" role="alert">{error}</div>}
      <PasswordField label="Mevcut parola" value={current} onChange={setCurrent} autoComplete="current-password" />
      <PasswordField label="Yeni parola (en az 10 karakter)" value={next} onChange={setNext} />
      <PasswordField label="Yeni parola (tekrar)" value={repeat} onChange={setRepeat} />
      {mismatch && <small className="danger-text">Yeni parolalar aynı değil.</small>}
      <button className="primary-btn" disabled={busy || next.length < 10 || mismatch || !current}><KeyRound /> {busy ? "Değiştiriliyor…" : "Parolayı değiştir"}</button>
    </form>
  );
}

/** Geçici parolayla giren kullanıcı, kendi parolasını belirlemeden sisteme giremez. */
export function ForcedPasswordChange({ user, onDone, onLogout }: { user: User; onDone: () => void; onLogout: () => void }) {
  return (
    <div className="forced-password">
      <section className="panel">
        <ShieldCheck />
        <h1>Kendi parolanızı belirleyin</h1>
        <p>Merhaba {user.name}. Hesabınız yöneticiniz tarafından geçici bir parolayla açıldı. Devam etmek için yalnızca sizin bileceğiniz yeni bir parola belirleyin.</p>
        <PasswordChangeForm onDone={onDone} />
        <button type="button" className="text-btn" onClick={onLogout}>Çıkış yap</button>
      </section>
    </div>
  );
}
