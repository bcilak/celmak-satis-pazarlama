import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  Bell,
  Boxes,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  FileClock,
  FileText,
  Landmark,
  LayoutDashboard,
  Menu,
  PackageCheck,
  Plus,
  ScrollText,
  Search,
  ShieldCheck,
  ShoppingCart,
  Users,
  X,
} from "lucide-react";
import { api } from "./api";
import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import {
  money,
  roleLabels,
  statusLabels,
  type Approval,
  type Customer,
  type EDocument,
  type Instrument,
  type Product,
  type Sale,
  type User,
} from "./types";

function Login({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("selin@celmak.com");
  const [password, setPassword] = useState("Celmak!2026");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          code: code || undefined,
          deviceName: navigator.platform || "Web tarayıcı",
        }),
      });
      onSuccess();
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      if (message.includes("doğrulama") || message.includes("Doğrulama"))
        setNeedsCode(true);
    } finally {
      setBusy(false);
    }
  };
  const passkey = async () => {
    setBusy(true);
    setError("");
    try {
      const options = await api<
        Parameters<typeof startAuthentication>[0]["optionsJSON"]
      >("/auth/passkey/options", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      const response = await startAuthentication({ optionsJSON: options });
      await api("/auth/passkey/verify", {
        method: "POST",
        body: JSON.stringify(response),
      });
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="login-page">
      <section className="login-brand">
        <div className="brand-mark">Ç</div>
        <h1>
          Satışın her adımı
          <br />
          tek ve güvenli yerde.
        </h1>
        <p>Müşteriden tahsilata, onaydan sevkiyata kadar bütün operasyon.</p>
        <div>
          <ShieldCheck />
          <span>
            <b>Güvenli oturum</b>
            <small>İşlemleriniz denetim kaydında korunur.</small>
          </span>
        </div>
      </section>
      <form className="login-card" onSubmit={submit}>
        <span className="eyebrow">ÇELMAK SATIŞ YÖNETİMİ</span>
        <h2>Hesabınıza giriş yapın</h2>
        <p>Kişisel kullanıcı bilgilerinizle devam edin.</p>
        {error && <div className="error-box">{error}</div>}
        <label className="field">
          <span>E-posta</span>
          <input
            type="email"
            autoComplete="username webauthn"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Parola</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {needsCode && (
          <label className="field">
            <span>6 haneli doğrulama kodu</span>
            <input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </label>
        )}
        <button className="primary-btn full" disabled={busy}>
          {busy ? "Giriş yapılıyor…" : "Giriş yap"}
          <ChevronRight />
        </button>
        <button type="button" className="passkey-btn" onClick={passkey}>
          Passkey ile giriş
        </button>
        <small className="demo-note">
          İlk geliştirme parolası: Celmak!2026
        </small>
      </form>
    </main>
  );
}

function App() {
  const [session, setSession] = useState<{
    currentUser: User;
    users: User[];
  } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const loadSession = useCallback(
    () =>
      api<{ currentUser: User; users: User[] }>("/session")
        .then(setSession)
        .catch(() => setSession(null))
        .finally(() => setAuthChecked(true)),
    [],
  );
  useEffect(() => {
    loadSession();
  }, [loadSession]);
  if (!authChecked) return <div className="loading">Çelmak hazırlanıyor…</div>;
  if (!session) return <Login onSuccess={loadSession} />;
  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    setSession(null);
  };
  const can=(permission:string)=>session.currentUser.role==="ADMIN"||Boolean(session.currentUser.permissions?.includes(permission));
  const menu=[
    ["DASHBOARD","/","Ana Sayfa",<LayoutDashboard/>],
    ["CUSTOMERS","/musteriler","Müşteriler",<Users/>],
    ["SALES","/satislar","Satışlar",<ShoppingCart/>],
    ["INSTRUMENTS","/kiymetli-evrak","Kıymetli Evrak",<Landmark/>],
    ["RECEIPTS","/tahsilatlar","Cari ve Tahsilat",<CircleDollarSign/>],
    ["APPROVALS","/onaylar","Onaylar",<ClipboardCheck/>],
    ["SHIPMENTS","/sevkiyatlar","Sevkiyatlar",<PackageCheck/>],
    ["EDOCUMENTS","/e-belgeler","e-Belgeler",<FileText/>],
    ["AUDIT","/loglar","Denetim Kayıtları",<ShieldCheck/>],
    ["SECURITY","/guvenlik","Hesap Güvenliği",<ShieldCheck/>],
    ["USER_MANAGEMENT","/kullanici-yetkileri","Kullanıcı Yetkileri",<Users/>],
  ] as const;
  const guard=(permission:string,element:ReactNode)=>can(permission)?element:<Empty title="Erişim yok" text="Bu ekran yöneticiniz tarafından hesabınıza açılmamış."/>;
  return (
    <div className="app-shell">
      <aside className={mobileOpen ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark">Ç</div>
          <div>
            <b>ÇELMAK</b>
            <span>Satış Yönetimi</span>
          </div>
        </div>
        <nav>
          {menu.filter(([permission])=>can(permission)).map(([permission,to,label,icon])=><SideLink key={permission} to={to} icon={icon} label={label} badge={permission==="APPROVALS"&&session.currentUser.role==="ADMIN"?"!":undefined} close={()=>setMobileOpen(false)}/>)}
        </nav>
        <div className="sidebar-foot">
          <ShieldCheck />
          <span>
            Güvenli oturum
            <br />
            <small>Tüm işlemler kayıt altında</small>
          </span>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <Menu />
          </button>
          <div className="top-search">
            <Search />
            <span>Müşteri, satış veya ürün ara…</span>
            <kbd>⌘ K</kbd>
          </div>
          <div className="top-actions">
            <button className="icon-btn">
              <Bell />
            </button>
            <div className="user-select">
              <div className="avatar">
                {session.currentUser.name
                  .split(" ")
                  .map((x) => x[0])
                  .join("")
                  .slice(0, 2)}
              </div>
              <span>
                <b>{session.currentUser.name}</b>
                <small>{roleLabels[session.currentUser.role]}</small>
              </span>
              <button className="logout-btn" onClick={logout}>
                Çıkış
              </button>
            </div>
          </div>
        </header>
        <div className="page">
          <Routes>
            <Route
              path="/"
              element={guard("DASHBOARD",<Dashboard user={session.currentUser} />)}
            />
            <Route path="/musteriler" element={guard("CUSTOMERS",<Customers />)} />
            <Route path="/musteriler/yeni" element={guard("CUSTOMERS",<NewCustomer />)} />
            <Route path="/musteriler/:id" element={guard("CUSTOMERS",<CustomerDetail />)} />
            <Route
              path="/satislar"
              element={guard("SALES",<Sales user={session.currentUser} />)}
            />
            <Route path="/satislar/yeni" element={guard("SALES",<NewSale />)} />
            <Route
              path="/onaylar"
              element={guard("APPROVALS",<Approvals user={session.currentUser} />)}
            />
            <Route
              path="/kiymetli-evrak"
              element={guard("INSTRUMENTS",<Instruments user={session.currentUser} />)}
            />
            <Route
              path="/tahsilatlar"
              element={guard("RECEIPTS",<Receipts user={session.currentUser} />)}
            />
            <Route
              path="/sevkiyatlar"
              element={guard("SHIPMENTS",<Shipments user={session.currentUser} />)}
            />
            <Route path="/sevkiyatlar/yeni" element={guard("SHIPMENTS",<NewShipment />)} />
            <Route
              path="/e-belgeler"
              element={guard("EDOCUMENTS",<EDocuments user={session.currentUser} />)}
            />
            <Route
              path="/loglar"
              element={guard("AUDIT",<AuditLogs user={session.currentUser} />)}
            />
            <Route path="/guvenlik" element={guard("SECURITY",<SecuritySettings />)} />
            <Route path="/kullanici-yetkileri" element={guard("USER_MANAGEMENT",<UserPermissions currentUser={session.currentUser}/>)} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function SideLink({
  to,
  icon,
  label,
  badge,
  close,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  badge?: string;
  close: () => void;
}) {
  return (
    <NavLink to={to} end={to === "/"} onClick={close}>
      {icon}
      <span>{label}</span>
      {badge && <em>{badge}</em>}
    </NavLink>
  );
}

function PageHead({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function Dashboard({ user }: { user: User }) {
  type DashboardData = {
    totals: {
      receivables: number;
      pendingApprovals: number;
      pendingSales: number;
      approvedSales: number;
    };
    recent: Sale[];
    notifications: {
      id: number;
      title: string;
      message: string;
      created_at: string;
    }[];
  };
  const [data, setData] = useState<DashboardData | null>(null);
  useEffect(() => {
    api<DashboardData>("/dashboard").then(setData);
  }, []);
  if (!data)
    return (
      <div className="skeleton-grid">
        <i />
        <i />
        <i />
        <i />
      </div>
    );
  return (
    <>
      <PageHead
        eyebrow="24 Ağustos 2026 · Pazartesi"
        title={`Günaydın, ${user.name.split(" ")[0]}`}
        description="Bugünün satış, tahsilat ve onay gündemi burada."
        action={
          <NavLink className="primary-btn" to="/satislar/yeni">
            <Plus />
            Yeni satış
          </NavLink>
        }
      />
      <div className="metric-grid">
        <Metric
          icon={<CircleDollarSign />}
          tone="green"
          label="Toplam müşteri alacağı"
          value={money(data.totals.receivables)}
          note="Aktif müşteriler"
        />
        <Metric
          icon={<ClipboardCheck />}
          tone="amber"
          label="Onay bekleyen"
          value={String(data.totals.pendingApprovals)}
          note="Yönetici işlemi"
        />
        <Metric
          icon={<FileClock />}
          tone="blue"
          label="Bekleyen satış"
          value={String(data.totals.pendingSales)}
          note="İşlem sırasındaki"
        />
        <Metric
          icon={<CheckCircle2 />}
          tone="violet"
          label="Onaylı satış hacmi"
          value={money(data.totals.approvedSales)}
          note="Toplam"
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <PanelTitle title="Son satışlar" link="/satislar" />
          <SaleTable sales={data.recent} />
        </section>
        <section className="panel">
          <PanelTitle title="Bildirimler" />
          <div className="notifications">
            {data.notifications.length ? (
              data.notifications.map((n) => (
                <div className="notification" key={n.id}>
                  <span>
                    <Bell />
                  </span>
                  <div>
                    <b>{n.title}</b>
                    <p>{n.message}</p>
                    <small>{formatDate(n.created_at)}</small>
                  </div>
                </div>
              ))
            ) : (
              <EmptyInline text="Yeni bildiriminiz bulunmuyor." />
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function Metric({
  icon,
  tone,
  label,
  value,
  note,
}: {
  icon: ReactNode;
  tone: string;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="metric">
      <span className={`metric-icon ${tone}`}>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{note}</p>
      </div>
    </div>
  );
}
function PanelTitle({ title, link }: { title: string; link?: string }) {
  return (
    <div className="panel-title">
      <h2>{title}</h2>
      {link && (
        <NavLink to={link}>
          Tümünü gör <ChevronRight />
        </NavLink>
      )}
    </div>
  );
}

function Customers() {
  const [items, setItems] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  useEffect(() => {
    api<Customer[]>("/customers").then(setItems);
  }, []);
  const shown = items.filter((x) =>
    (x.name + x.code + x.city)
      .toLocaleLowerCase("tr")
      .includes(query.toLocaleLowerCase("tr")),
  );
  return (
    <>
      <PageHead
        eyebrow="CARİ YÖNETİMİ"
        title="Müşteriler"
        description="Müşteri bakiyeleri, risk limitleri ve iletişim bilgileri."
        action={
          <NavLink className="primary-btn" to="/musteriler/yeni">
            <Plus />
            Yeni müşteri
          </NavLink>
        }
      />
      <section className="panel">
        <div className="toolbar">
          <label className="search-input">
            <Search />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Müşteri ara…"
            />
          </label>
          <span>{shown.length} müşteri</span>
        </div>
        <div className="customer-grid">
          {shown.map((c) => (
            <article className="customer-card" key={c.id}>
              <div className="customer-top">
                <span className="company-avatar">
                  {c.name.slice(0, 2).toUpperCase()}
                </span>
                <span
                  className={c.balance > c.riskLimit ? "risk danger" : "risk"}
                >
                  {c.balance > c.riskLimit ? "Limit aşıldı" : "Risk normal"}
                </span>
              </div>
              <h3>{c.name}</h3>
              <p>
                {c.code} · {c.city}
              </p>
              <div className="customer-finance">
                <div>
                  <small>Güncel bakiye</small>
                  <strong>{money(c.balance)}</strong>
                </div>
                <div>
                  <small>Risk limiti</small>
                  <strong>{money(c.riskLimit)}</strong>
                </div>
              </div>
              <NavLink className="text-btn" to={`/musteriler/${c.id}`}>
                Müşteri detayını aç <ChevronRight />
              </NavLink>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function NewCustomer() {
  const navigate = useNavigate();
  const [source, setSource] = useState("AUTO");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api("/customers", {
        method: "POST",
        body: JSON.stringify({
          ...values,
          codeSource: source,
          paymentTermDays: Number(values.paymentTermDays),
          riskLimit: Number(values.riskLimit),
        }),
      });
      navigate("/musteriler");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit}>
      <PageHead
        eyebrow="YENİ CARİ KART"
        title="Yeni müşteri"
        description="Müşteri kodunu otomatik oluşturun veya mevcut ERP kodunu koruyun."
      />
      {error && <div className="error-box">{error}</div>}
      <section className="panel customer-form">
        <div className="form-block">
          <h2>Temel bilgiler</h2>
          <div className="form-grid">
            <label className="field wide">
              <span>Firma / unvan *</span>
              <input required name="name" placeholder="Firma adını yazın" />
            </label>
            <label className="field">
              <span>Vergi numarası</span>
              <input name="taxNumber" maxLength={11} />
            </label>
            <label className="field">
              <span>Şehir</span>
              <input name="city" />
            </label>
            <label className="field">
              <span>Telefon</span>
              <input name="phone" />
            </label>
            <label className="field">
              <span>E-posta</span>
              <input name="email" type="email" />
            </label>
          </div>
        </div>
        <div className="form-block">
          <h2>Müşteri kodu</h2>
          <div className="choice-grid code-source">
            {[
              ["AUTO", "Otomatik Çelmak kodu"],
              ["MANUAL", "Mevcut kodu elle gir"],
              ["EXTERNAL", "ERP / muhasebe kodu"],
            ].map(([value, label]) => (
              <label className={source === value ? "selected" : ""} key={value}>
                <input
                  type="radio"
                  checked={source === value}
                  onChange={() => setSource(value)}
                />
                <span>{label}</span>
                <CheckCircle2 />
              </label>
            ))}
          </div>
          {source !== "AUTO" && (
            <div className="form-grid integration-fields">
              <label className="field">
                <span>Müşteri kodu *</span>
                <input required name="code" placeholder="Örn. 120.01.001" />
              </label>
              {source === "EXTERNAL" && (
                <>
                  <label className="field">
                    <span>Kaynak sistem *</span>
                    <select required name="externalSystem">
                      <option value="">Seçin…</option>
                      <option>LOGO</option>
                      <option>MIKRO</option>
                      <option>NETSIS</option>
                      <option>ERP</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Harici kayıt no *</span>
                    <input required name="externalId" />
                  </label>
                </>
              )}
            </div>
          )}{" "}
          {source === "AUTO" && (
            <p className="info-note">
              Kod kayıt sırasında otomatik üretilecek. Entegrasyon için ayrıca
              değişmeyen iç kimlik saklanır.
            </p>
          )}
        </div>
        <div className="form-block">
          <h2>Ticari koşullar</h2>
          <div className="form-grid">
            <label className="field">
              <span>Varsayılan vade</span>
              <select name="paymentTermDays" defaultValue="30">
                <option value="0">Peşin</option>
                <option value="15">15 gün</option>
                <option value="30">30 gün</option>
                <option value="45">45 gün</option>
                <option value="60">60 gün</option>
                <option value="90">90 gün</option>
              </select>
            </label>
            <label className="field">
              <span>Risk limiti</span>
              <input name="riskLimit" type="number" min="0" defaultValue="0" />
            </label>
          </div>
        </div>
        <div className="form-footer">
          <button
            type="button"
            className="reject-btn"
            onClick={() => navigate("/musteriler")}
          >
            Vazgeç
          </button>
          <button className="primary-btn" disabled={busy}>
            {busy ? "Kaydediliyor…" : "Müşteriyi oluştur"}
            <ChevronRight />
          </button>
        </div>
      </section>
    </form>
  );
}

function CustomerDetail() {
  type Detail = {
    customer: Customer & { taxNumber?: string; createdAt: string };
    stats: {
      approvedSales: number;
      salesTryTotal: number;
      openInstruments: number;
      openShipments: number;
    };
    sales: Sale[];
    schedules: {
      id: number;
      saleNumber: string;
      sequenceNo: number;
      paymentType: string;
      dueDate: string;
      amount: number;
      currency: string;
      exchangeRate: number;
      status: string;
    }[];
    instruments: {
      id: number;
      number: string;
      instrumentType: string;
      dueDate: string;
      amount: number;
      currency: string;
      status: string;
      currentHolder?: string;
    }[];
    shipments: {
      id: number;
      number: string;
      status: string;
      plannedDate: string;
      actualDate?: string;
      saleNumber: string;
      totalQuantity: number;
    }[];
  };
  type Ledger = {
    transactions: {
      id:number;transactionType:string;transactionDate:string;description:string;debit:number;credit:number;currency:string;foreignAmount:number;exchangeRate:number;runningBalance:number;createdBy?:string
    }[];
  };
  const { id } = useParams();
  const [data, setData] = useState<Detail | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [tab, setTab] = useState("overview");
  useEffect(() => {
    Promise.all([api<Detail>(`/customers/${id}`),api<Ledger>(`/customers/${id}/ledger`)]).then(([detail,account])=>{setData(detail);setLedger(account)});
  }, [id]);
  if (!data || !ledger) return <div className="loading">Müşteri hazırlanıyor…</div>;
  const c = data.customer;
  const today=new Date().toISOString().slice(0,10);
  const openSchedules=data.schedules.filter(x=>!["PAID","CANCELLED"].includes(x.status));
  const overdueSchedules=openSchedules.filter(x=>x.dueDate<today);
  const nextSchedule=openSchedules.find(x=>x.dueDate>=today);
  const openTry=openSchedules.reduce((sum,x)=>sum+x.amount*x.exchangeRate,0);
  const overdueTry=overdueSchedules.reduce((sum,x)=>sum+x.amount*x.exchangeRate,0);
  const lastReceipt=ledger.transactions.find(x=>x.credit>0 && !["EXCHANGE_DIFFERENCE"].includes(x.transactionType));
  return (
    <>
      <PageHead
        eyebrow={`${c.code} · ${c.codeSource === "EXTERNAL" ? c.externalSystem || "ERP" : "ÇELMAK"}`}
        title={c.name}
        description={`${c.city || "Şehir belirtilmedi"} · ${c.phone || "Telefon belirtilmedi"}`}
        action={
          <div className="head-actions">
            <NavLink className="mini-btn" to="/kiymetli-evrak">
              Kıymetli evrak
            </NavLink>
            <NavLink className="primary-btn" to="/satislar/yeni">
              <Plus />
              Yeni satış
            </NavLink>
          </div>
        }
      />
      <section className="customer-finance-hero">
        <div className={`debt-answer ${c.balance>0?"has-debt":"clear"}`}>
          <small>MÜŞTERİNİN BUGÜNKÜ BORCU</small>
          <strong>{money(Math.max(0,c.balance))}</strong>
          <p>{c.balance>0?(c.riskLimit&&c.balance>c.riskLimit?`Risk limiti ${money(c.balance-c.riskLimit)} aşılmış.`:`Risk limitinin %${c.riskLimit?Math.round(c.balance/c.riskLimit*100):0}'i kullanılıyor.`):"Bu müşterinin ödenmemiş cari borcu bulunmuyor."}</p>
        </div>
        <div className="finance-facts">
          <div className={overdueSchedules.length?"danger":""}><small>Gecikmiş ödeme</small><b>{money(overdueTry)}</b><span>{overdueSchedules.length?`${overdueSchedules.length} vadenin süresi geçti`:"Geciken ödeme yok"}</span></div>
          <div><small>Sıradaki ödeme</small><b>{nextSchedule?money(nextSchedule.amount,nextSchedule.currency):"—"}</b><span>{nextSchedule?dateOnly(nextSchedule.dueDate):"Planlanmış ödeme yok"}</span></div>
          <div><small>Son tahsilat</small><b>{lastReceipt?money(lastReceipt.credit):"—"}</b><span>{lastReceipt?dateOnly(lastReceipt.transactionDate):"Henüz tahsilat yok"}</span></div>
          <div><small>Açık ödeme planı</small><b>{money(openTry)}</b><span>{openSchedules.length} ödeme / çek / senet</span></div>
        </div>
      </section>
      <div className="detail-tabs">
        {[
          ["overview", "Borç özeti"],
          ["sales", "Satışlar"],
          ["payments", "Vadeler ve tahsilatlar"],
          ["shipments", "Sevkiyatlar"],
        ].map(([value, label]) => (
          <button
            className={tab === value ? "active" : ""}
            onClick={() => setTab(value)}
            key={value}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "overview" && (
        <div className="customer-overview-grid">
          <section className="panel debt-explanation">
            <PanelTitle title="Borç nasıl oluştu?" />
            <div className="debt-equation">
              <span><small>Toplam borçlandırma</small><b>{money(ledger.transactions.reduce((s,x)=>s+x.debit,0))}</b></span>
              <i>−</i>
              <span><small>Toplam tahsilat</small><b>{money(ledger.transactions.reduce((s,x)=>s+x.credit,0))}</b></span>
              <i>=</i>
              <span className="result"><small>Kalan borç</small><b>{money(c.balance)}</b></span>
            </div>
            <p>Satışlar müşteriyi borçlandırır; nakit, havale, çek ve senet tahsilatları borcu azaltır.</p>
          </section>
          <section className="panel customer-mini-info">
            <PanelTitle title="Müşteri bilgileri" />
            <p><span>Vergi no</span><b>{c.taxNumber || "—"}</b></p>
            <p><span>Telefon</span><b>{c.phone || "—"}</b></p>
            <p><span>E-posta</span><b>{c.email || "—"}</b></p>
            <p><span>Varsayılan vade</span><b>{c.paymentTermDays} gün</b></p>
          </section>
          <section className="panel account-story">
            <PanelTitle title="En son ne oldu?" />
            <div className="account-events">
              {ledger.transactions.slice(0,8).map(x=><div key={x.id} className={x.debit>0?"debit":"credit"}>
                <span className="event-sign">{x.debit>0?"+":"−"}</span>
                <span><b>{x.description}</b><small>{dateOnly(x.transactionDate)} · {x.createdBy||"Sistem"}</small></span>
                <strong>{x.debit>0?"Borçlandı":"Ödedi"}<em>{money(x.debit||x.credit)}</em></strong>
              </div>)}
              {!ledger.transactions.length&&<EmptyInline text="Henüz finansal hareket bulunmuyor."/>}
            </div>
          </section>
        </div>
      )}
      {tab === "sales" && (
        <section className="panel">
          <SaleTable sales={data.sales} />
        </section>
      )}
      {tab === "payments" && (
        <div className="detail-grid">
          <section className="panel">
            <PanelTitle title="Ne zaman ne ödenecek?" />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Satış</th>
                    <th>Vade</th>
                    <th>Tür</th>
                    <th>Tutar</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {data.schedules.map((x) => (
                    <tr key={x.id} className={!["PAID","CANCELLED"].includes(x.status)&&x.dueDate<today?"overdue-row":""}>
                      <td>{x.saleNumber}</td>
                      <td><b>{dateOnly(x.dueDate)}</b>{!["PAID","CANCELLED"].includes(x.status)&&x.dueDate<today&&<small className="danger-text">Vadesi geçti</small>}</td>
                      <td>{paymentTypeLabel(x.paymentType)}</td>
                      <td>{money(x.amount, x.currency)}</td>
                      <td>
                        <Status value={x.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <PanelTitle title="Çek ve senetler" />
            <div className="compact-list">
              {data.instruments.map((x) => (
                <div key={x.id}>
                  <span>
                    <b>{x.number}</b>
                    <small>
                      {x.instrumentType === "CHECK" ? "Çek" : "Senet"} ·{" "}
                      {dateOnly(x.dueDate)}
                    </small>
                  </span>
                  <strong>{money(x.amount, x.currency)}</strong>
                  <Status value={x.status} />
                </div>
              ))}
              {!data.instruments.length && (
                <EmptyInline text="Kıymetli evrak yok." />
              )}
            </div>
          </section>
          <section className="panel payments-history">
            <PanelTitle title="Alınan ödemeler" />
            <div className="table-wrap"><table><thead><tr><th>Tarih</th><th>Açıklama</th><th>Ödeme türü</th><th>Alınan tutar</th></tr></thead><tbody>
              {ledger.transactions.filter(x=>x.credit>0&&x.transactionType!=="EXCHANGE_DIFFERENCE").map(x=><tr key={x.id}><td>{dateOnly(x.transactionDate)}</td><td><b>{x.description}</b><small>{x.createdBy||"Sistem"}</small></td><td>{transactionTypeLabel(x.transactionType)}</td><td className="paid-amount">− {money(x.credit)}</td></tr>)}
              {!ledger.transactions.some(x=>x.credit>0&&x.transactionType!=="EXCHANGE_DIFFERENCE")&&<tr><td colSpan={4}><EmptyInline text="Henüz alınmış ödeme bulunmuyor."/></td></tr>}
            </tbody></table></div>
          </section>
        </div>
      )}
      {tab === "shipments" && (
        <section className="panel">
          <div className="panel-title">
            <h2>Sevkiyat geçmişi</h2>
            <NavLink className="primary-btn small" to="/sevkiyatlar/yeni">
              <Plus />
              Sevkiyat oluştur
            </NavLink>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sevkiyat</th>
                  <th>Satış</th>
                  <th>Planlanan tarih</th>
                  <th>Miktar</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {data.shipments.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <b>{x.number}</b>
                    </td>
                    <td>{x.saleNumber}</td>
                    <td>{dateOnly(x.plannedDate)}</td>
                    <td>{x.totalQuantity}</td>
                    <td>
                      <Status value={x.status} />
                    </td>
                  </tr>
                ))}
                {!data.shipments.length && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyInline text="Henüz sevkiyat yok." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function Sales({ user }: { user: User }) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [message, setMessage] = useState("");
  const load = () => api<Sale[]>("/sales").then(setSales);
  useEffect(() => {
    load();
  }, []);
  const submit = async (id: number) => {
    try {
      const r = await api<{ message: string }>(`/sales/${id}/submit`, {
        method: "POST",
      });
      setMessage(r.message);
      load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  return (
    <>
      <PageHead
        eyebrow="SATIŞ YÖNETİMİ"
        title="Satışlar"
        description="Taslak, onay bekleyen ve tamamlanan satışları takip edin."
        action={
          (user.role === "SALES" || user.role === "ADMIN") && (
            <NavLink className="primary-btn" to="/satislar/yeni">
              <Plus />
              Yeni satış
            </NavLink>
          )
        }
      />
      {message && <Toast text={message} close={() => setMessage("")} />}
      <section className="panel">
        <SaleTable
          sales={sales}
          action={
            user.role === "SALES" || user.role === "ADMIN" ? submit : undefined
          }
        />
      </section>
    </>
  );
}

function SaleTable({
  sales,
  action,
}: {
  sales: Sale[];
  action?: (id: number) => void;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Satış</th>
            <th>Müşteri</th>
            <th>Tutar</th>
            <th>Oluşturan</th>
            <th>Durum</th>
            {action && <th />}
          </tr>
        </thead>
        <tbody>
          {sales.length ? (
            sales.map((s) => (
              <tr key={s.id}>
                <td>
                  <b>{s.number}</b>
                  <small>{formatDate(s.createdAt)}</small>
                </td>
                <td>{s.customerName}</td>
                <td className="amount">
                  {money(s.grandTotal, s.currency || "TRY")}
                  {s.instrumentCount > 0 && (
                    <small>{s.instrumentCount} evrak</small>
                  )}
                </td>
                <td>{s.createdBy}</td>
                <td>
                  <Status value={s.status} />
                </td>
                {action && (
                  <td>
                    {["DRAFT", "REVISION_REQUESTED"].includes(s.status) && (
                      <button className="mini-btn" onClick={() => action(s.id)}>
                        Onaya gönder
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6}>
                <EmptyInline text="Henüz satış kaydı yok." />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function NewSale() {
  type Config = {
    rates: {
      currency: string;
      rate: number;
      rateDate: string;
      source: string;
    }[];
  };
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [config, setConfig] = useState<Config>({ rates: [] });
  const [customerId, setCustomerId] = useState(0);
  const [lines, setLines] = useState<{ productId: number; quantity: number }[]>(
    [],
  );
  const [payment, setPayment] = useState("TERM");
  const [down, setDown] = useState(0);
  const [currency, setCurrency] = useState("TRY");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [instrumentType, setInstrumentType] = useState("CHECK");
  const [instrumentCount, setInstrumentCount] = useState(1);
  const [termInstallmentCount, setTermInstallmentCount] = useState(1);
  const [firstDueDate, setFirstDueDate] = useState(addDaysToToday(30));
  const [dueIntervalDays, setDueIntervalDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      api<Customer[]>("/customers"),
      api<Product[]>("/products"),
      api<Config>("/configuration"),
    ]).then(([c, p, conf]) => {
      setCustomers(c);
      setProducts(p);
      setConfig(conf);
    });
  }, []);
  const customer = customers.find((c) => c.id === customerId);
  const detail = lines
    .map((l) => ({
      ...l,
      product: products.find((p) => p.id === l.productId)!,
    }))
    .filter((x) => x.product);
  const convertedPrice = (product: Product) =>
    currency === "TRY" ? product.unitPrice : product.unitPrice / exchangeRate;
  const subtotal = detail.reduce(
    (s, l) => s + convertedPrice(l.product) * l.quantity,
    0,
  );
  const total = detail.reduce(
    (s, l) =>
      s +
      convertedPrice(l.product) * l.quantity * (1 + l.product.vatRate / 100),
    0,
  );
  const addProduct = (id: number) =>
    setLines((v) => {
      const found = v.find((x) => x.productId === id);
      return found
        ? v.map((x) =>
            x.productId === id ? { ...x, quantity: x.quantity + 1 } : x,
          )
        : [...v, { productId: id, quantity: 1 }];
    });
  const changeCurrency = (value: string) => {
    setCurrency(value);
    setExchangeRate(
      value === "TRY"
        ? 1
        : config.rates.find((r) => r.currency === value)?.rate || 1,
    );
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/sales", {
        method: "POST",
        body: JSON.stringify({
          customerId,
          paymentMethod: payment,
          paymentTermDays: customer?.paymentTermDays || 30,
          downPayment: down,
          currency,
          exchangeRate,
          termInstallmentCount,
          instrumentType: ["CHECK", "MIXED"].includes(payment)
            ? instrumentType
            : undefined,
          instrumentCount: ["CHECK", "MIXED"].includes(payment)
            ? instrumentCount
            : 0,
          firstDueDate: ["CHECK", "MIXED", "TERM"].includes(payment)
            ? firstDueDate
            : undefined,
          dueIntervalDays: ["CHECK", "MIXED", "TERM"].includes(payment)
            ? dueIntervalDays
            : undefined,
          note: "",
          items: lines,
        }),
      });
      navigate("/satislar");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save}>
      <PageHead
        eyebrow="YENİ İŞLEM"
        title="Yeni satış oluştur"
        description="Müşteriyi ve ürünleri seçin; fiyat, KDV ve vade otomatik hesaplansın."
      />
      <div className="stepper">
        <span className="active">
          1 <b>Müşteri</b>
        </span>
        <i />
        <span className={customerId ? "active" : ""}>
          2 <b>Ürünler</b>
        </span>
        <i />
        <span className={lines.length ? "active" : ""}>
          3 <b>Ödeme</b>
        </span>
      </div>
      {error && <div className="error-box">{error}</div>}
      <div className="form-layout">
        <div className="form-main">
          <section className="panel form-section">
            <div className="section-number">1</div>
            <div className="section-content">
              <h2>Müşteri seçin</h2>
              <p>Bakiye, vade ve risk bilgileri otomatik getirilecek.</p>
              <label className="field">
                <span>Müşteri</span>
                <select
                  required
                  value={customerId}
                  onChange={(e) => setCustomerId(Number(e.target.value))}
                >
                  <option value="">Müşteri seçin…</option>
                  {customers.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.code} · {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {customer && (
                <div className="customer-summary">
                  <div>
                    <small>Güncel bakiye</small>
                    <b>{money(customer.balance)}</b>
                  </div>
                  <div>
                    <small>Risk limiti</small>
                    <b>{money(customer.riskLimit)}</b>
                  </div>
                  <div>
                    <small>Varsayılan vade</small>
                    <b>{customer.paymentTermDays} gün</b>
                  </div>
                </div>
              )}
            </div>
          </section>
          <section className="panel form-section">
            <div className="section-number">2</div>
            <div className="section-content">
              <h2>Ürünleri ekleyin</h2>
              <p>
                Ürün kartındaki TL baz fiyat, seçilen işlem kuruyla otomatik
                dönüştürülür.
              </p>
              <div className="product-picker">
                {products.map((p) => (
                  <button
                    type="button"
                    onClick={() => addProduct(p.id)}
                    key={p.id}
                  >
                    <span>
                      <b>{p.name}</b>
                      <small>
                        {p.code} · Stok {p.stockQuantity}
                      </small>
                    </span>
                    <strong>
                      {money(convertedPrice(p), currency)}
                      <Plus />
                    </strong>
                  </button>
                ))}
              </div>
              {detail.length > 0 && (
                <div className="selected-lines">
                  {detail.map((l) => (
                    <div key={l.productId}>
                      <span>
                        <b>{l.product.name}</b>
                        <small>
                          {money(convertedPrice(l.product), currency)} · %
                          {l.product.vatRate} KDV
                        </small>
                      </span>
                      <label>
                        <button
                          type="button"
                          onClick={() =>
                            setLines((v) =>
                              v.map((x) =>
                                x.productId === l.productId
                                  ? {
                                      ...x,
                                      quantity: Math.max(1, x.quantity - 1),
                                    }
                                  : x,
                              ),
                            )
                          }
                        >
                          −
                        </button>
                        <input
                          type="number"
                          value={l.quantity}
                          min="1"
                          max={l.product.stockQuantity}
                          onChange={(e) =>
                            setLines((v) =>
                              v.map((x) =>
                                x.productId === l.productId
                                  ? { ...x, quantity: Number(e.target.value) }
                                  : x,
                              ),
                            )
                          }
                        />
                        <button
                          type="button"
                          onClick={() => addProduct(l.productId)}
                        >
                          +
                        </button>
                      </label>
                      <strong>
                        {money(
                          convertedPrice(l.product) *
                            l.quantity *
                            (1 + l.product.vatRate / 100),
                          currency,
                        )}
                      </strong>
                      <button
                        type="button"
                        className="remove"
                        onClick={() =>
                          setLines((v) =>
                            v.filter((x) => x.productId !== l.productId),
                          )
                        }
                      >
                        <X />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
          <section className="panel form-section">
            <div className="section-number">3</div>
            <div className="section-content">
              <h2>Ödeme ve döviz planı</h2>
              <p>
                Para birimini ve tahsilat şeklini seçin; vadeler otomatik
                oluşsun.
              </p>
              <div className="currency-row">
                <label className="field">
                  <span>Para birimi</span>
                  <select
                    value={currency}
                    onChange={(e) => changeCurrency(e.target.value)}
                  >
                    <option>TRY</option>
                    <option>USD</option>
                    <option>EUR</option>
                  </select>
                </label>
                <label className="field">
                  <span>İşlem kuru</span>
                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    readOnly={currency === "TRY"}
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(Number(e.target.value))}
                  />
                </label>
              </div>
              <div className="choice-grid">
                {[
                  ["CASH", "Tamamı peşin"],
                  ["TERM", `${customer?.paymentTermDays || 30} gün vadeli`],
                  ["CHECK", "Kıymetli evrak"],
                  ["MIXED", "Peşinat + evrak"],
                ].map(([v, l]) => (
                  <label className={payment === v ? "selected" : ""} key={v}>
                    <input
                      type="radio"
                      name="payment"
                      value={v}
                      checked={payment === v}
                      onChange={() => setPayment(v)}
                    />
                    <span>{l}</span>
                    <CheckCircle2 />
                  </label>
                ))}
              </div>
              {payment === "TERM" && (
                <>
                  <div className="instrument-plan">
                    <label className="field">
                      <span>Taksit adedi</span>
                      <input
                        type="number"
                        min="1"
                        max="24"
                        value={termInstallmentCount}
                        onChange={(e) =>
                          setTermInstallmentCount(Number(e.target.value))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>İlk vade</span>
                      <input
                        type="date"
                        value={firstDueDate}
                        onChange={(e) => setFirstDueDate(e.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Vade aralığı</span>
                      <select
                        value={dueIntervalDays}
                        onChange={(e) =>
                          setDueIntervalDays(Number(e.target.value))
                        }
                      >
                        <option value="15">15 gün</option>
                        <option value="30">30 gün</option>
                        <option value="45">45 gün</option>
                        <option value="60">60 gün</option>
                        <option value="90">90 gün</option>
                      </select>
                    </label>
                  </div>
                  <PaymentPreview
                    count={termInstallmentCount}
                    firstDate={firstDueDate}
                    interval={dueIntervalDays}
                    total={total - down}
                    currency={currency}
                  />
                </>
              )}
              {payment === "MIXED" && (
                <label className="field compact">
                  <span>Peşinat tutarı</span>
                  <input
                    type="number"
                    min="0"
                    max={total}
                    value={down}
                    onChange={(e) => setDown(Number(e.target.value))}
                  />
                </label>
              )}
              {["CHECK", "MIXED"].includes(payment) && (
                <div className="instrument-plan">
                  <label className="field">
                    <span>Evrak türü</span>
                    <select
                      value={instrumentType}
                      onChange={(e) => setInstrumentType(e.target.value)}
                    >
                      <option value="CHECK">Çek</option>
                      <option value="PROMISSORY_NOTE">Senet</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Kaç adet?</span>
                    <input
                      type="number"
                      min="1"
                      max="24"
                      value={instrumentCount}
                      onChange={(e) =>
                        setInstrumentCount(Number(e.target.value))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>İlk vade</span>
                    <input
                      type="date"
                      value={firstDueDate}
                      onChange={(e) => setFirstDueDate(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Vade aralığı</span>
                    <select
                      value={dueIntervalDays}
                      onChange={(e) =>
                        setDueIntervalDays(Number(e.target.value))
                      }
                    >
                      <option value="15">15 gün</option>
                      <option value="30">30 gün</option>
                      <option value="45">45 gün</option>
                      <option value="60">60 gün</option>
                      <option value="90">90 gün</option>
                    </select>
                  </label>
                </div>
              )}{" "}
              {["CHECK", "MIXED"].includes(payment) && (
                <PaymentPreview
                  count={instrumentCount}
                  firstDate={firstDueDate}
                  interval={dueIntervalDays}
                  total={total - down}
                  currency={currency}
                />
              )}
            </div>
          </section>
        </div>
        <aside className="summary-card">
          <span className="eyebrow">SATIŞ ÖZETİ</span>
          <h3>{customer?.name || "Müşteri seçilmedi"}</h3>
          <div>
            <span>Ara toplam</span>
            <b>{money(subtotal, currency)}</b>
          </div>
          <div>
            <span>KDV</span>
            <b>{money(total - subtotal, currency)}</b>
          </div>
          <div className="total">
            <span>Genel toplam</span>
            <b>{money(total, currency)}</b>
          </div>
          <div>
            <span>Peşinat</span>
            <b>− {money(down, currency)}</b>
          </div>
          <div>
            <span>Vadeli kalan</span>
            <b>{money(total - down, currency)}</b>
          </div>
          {currency !== "TRY" && (
            <div>
              <span>TL karşılığı</span>
              <b>{money(total * exchangeRate)}</b>
            </div>
          )}
          <button
            className="primary-btn full"
            disabled={busy || !customerId || !lines.length}
          >
            {busy ? "Kaydediliyor…" : "Taslağı oluştur"}
            <ChevronRight />
          </button>
          <small>
            Kaydettikten sonra satışlar ekranından yönetici onayına
            gönderebilirsiniz.
          </small>
        </aside>
      </div>
    </form>
  );
}

function PaymentPreview({
  count,
  firstDate,
  interval,
  total,
  currency,
}: {
  count: number;
  firstDate: string;
  interval: number;
  total: number;
  currency: string;
}) {
  const safeCount = Math.max(1, count);
  const base = Math.floor((total / safeCount) * 100) / 100;
  return (
    <div className="payment-preview">
      <b>Otomatik vade planı</b>
      {Array.from({ length: safeCount }, (_, index) => {
        const amount = index === safeCount - 1 ? total - base * index : base;
        return (
          <span key={index}>
            <i>{index + 1}</i>
            <time>{addDaysToDate(firstDate, interval * index)}</time>
            <strong>{money(amount, currency)}</strong>
          </span>
        );
      })}
    </div>
  );
}

function addDaysToToday(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
function addDaysToDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(date);
}

function Approvals({ user }: { user: User }) {
  const [items, setItems] = useState<Approval[]>([]);
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState<Record<number, string>>({});
  const load = useCallback(() => {
    if (user.role === "ADMIN" || user.role === "AUDITOR")
      api<Approval[]>("/approvals").then(setItems);
  }, [user.role]);
  useEffect(() => {
    load();
  }, [load]);
  const decide = async (id: number, decision: string) => {
    try {
      await api(`/approvals/${id}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, reason: reason[id] }),
      });
      setMessage("Onay kararı kaydedildi.");
      load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  if (user.role !== "ADMIN" && user.role !== "AUDITOR")
    return (
      <Empty
        title="Onay Merkezi"
        text="Bu ekran yalnızca yönetici ve denetçi rollerine açıktır."
      />
    );
  return (
    <>
      <PageHead
        eyebrow="KONTROL MERKEZİ"
        title="Onaylar"
        description="Risk, tutar ve müşteri durumunu inceleyerek karar verin."
      />
      {message && <Toast text={message} close={() => setMessage("")} />}
      <div className="approval-list">
        {items.filter((x) => x.status === "PENDING").length ? (
          items
            .filter((x) => x.status === "PENDING")
            .map((a) => (
              <article className="approval-card" key={a.id}>
                <div className="approval-main">
                  <div className="approval-head">
                    <span className="doc-icon">
                      <ScrollText />
                    </span>
                    <div>
                      <small>{a.saleNumber}</small>
                      <h3>{a.customerName}</h3>
                      <p>
                        {a.requestedBy} tarafından gönderildi ·{" "}
                        {formatDate(a.requestedAt)}
                      </p>
                    </div>
                    <strong>{money(a.grandTotal, a.currency || "TRY")}</strong>
                  </div>
                  <div className="risk-bar">
                    <span>
                      <b>Mevcut bakiye</b>
                      {money(a.balance)}
                    </span>
                    <ChevronRight />
                    <span>
                      <b>Satış sonrası TL risk</b>
                      {money(a.balance + a.grandTotal)}
                    </span>
                    <span
                      className={
                        a.balance + a.grandTotal > a.riskLimit
                          ? "danger-text"
                          : ""
                      }
                    >
                      <b>Risk limiti</b>
                      {money(a.riskLimit)}
                    </span>
                  </div>
                </div>
                <div className="approval-actions">
                  <input
                    placeholder="Ret/düzeltme nedeni…"
                    value={reason[a.id] || ""}
                    onChange={(e) =>
                      setReason({ ...reason, [a.id]: e.target.value })
                    }
                  />
                  {user.role === "ADMIN" && (
                    <div>
                      <button
                        className="reject-btn"
                        onClick={() => decide(a.id, "REJECTED")}
                      >
                        Reddet
                      </button>
                      <button
                        className="revise-btn"
                        onClick={() => decide(a.id, "REVISION_REQUESTED")}
                      >
                        Düzeltme iste
                      </button>
                      <button
                        className="approve-btn"
                        onClick={() => decide(a.id, "APPROVED")}
                      >
                        <CheckCircle2 />
                        Onayla
                      </button>
                    </div>
                  )}
                </div>
              </article>
            ))
        ) : (
          <EmptyInline text="Bekleyen onay bulunmuyor." />
        )}
      </div>
    </>
  );
}

type Shipment = {
  id: number;
  number: string;
  status: string;
  plannedDate: string;
  actualDate?: string;
  deliveryAddress: string;
  vehiclePlate?: string;
  driverName?: string;
  dispatchNumber?: string;
  recipientName?: string;
  saleId: number;
  saleNumber: string;
  customerName: string;
  totalQuantity: number;
};

function Receipts({ user }: { user: User }) {
  type Ledger = {
    customer: {
      id: number;
      code: string;
      name: string;
      balance: number;
      riskLimit: number;
    };
    transactions: {
      id: number;
      transactionType: string;
      transactionDate: string;
      description: string;
      debit: number;
      credit: number;
      currency: string;
      foreignAmount: number;
      exchangeRate: number;
      sourceType: string;
      sourceId: number;
      runningBalance: number;
      createdBy: string;
    }[];
    reconciliations: {
      id: number;
      statementDate: string;
      systemBalance: number;
      declaredBalance: number;
      difference: number;
      status: string;
    }[];
    schedules:{id:number;saleId:number;saleNumber:string;sequenceNo:number;paymentType:string;dueDate:string;amount:number;paidAmount:number;remainingAmount:number;currency:string;exchangeRate:number;status:string;instrumentId?:number;instrumentNumber?:string;instrumentStatus?:string;issuer?:string;serialNumber?:string;bankName?:string}[];
  };
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState(0);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [message, setMessage] = useState("");
  const [currency, setCurrency] = useState("TRY");
  const [rate, setRate] = useState(1);
  const [receiptMode,setReceiptMode]=useState<"SCHEDULE"|"INSTRUMENT"|"GENERAL">("SCHEDULE");
  const [scheduleId,setScheduleId]=useState(0);
  const [receiptAmount,setReceiptAmount]=useState("");
  useEffect(() => {
    api<Customer[]>("/customers").then(setCustomers);
  }, []);
  const load = useCallback(() => {
    if (customerId)
      api<Ledger>(`/customers/${customerId}/ledger`).then(setLedger);
  }, [customerId]);
  useEffect(() => {
    load();
  }, [load]);
  const chooseSchedule=(id:number)=>{setScheduleId(id);const selected=ledger?.schedules.find(x=>x.id===id);if(selected){setReceiptMode(["CHECK","PROMISSORY_NOTE"].includes(selected.paymentType)?"INSTRUMENT":"SCHEDULE");setCurrency(selected.currency);setRate(selected.currency==="TRY"?1:selected.exchangeRate);setReceiptAmount(String(selected.remainingAmount))}};
  const receipt = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const selected=ledger?.schedules.find(x=>x.id===scheduleId);
      const result = receiptMode==="INSTRUMENT"&&selected?.instrumentId?await api<{message:string}>(`/instruments/${selected.instrumentId}/movements`,{method:"POST",body:JSON.stringify({status:"COLLECTED",movementDate:values.receiptDate,exchangeRate:currency==="TRY"?1:rate})}):await api<{ message: string }>("/receipts", {
        method: "POST",
        body: JSON.stringify({
          customerId,
          paymentScheduleId:receiptMode==="SCHEDULE"?scheduleId:undefined,
          method: values.method,
          receiptDate: values.receiptDate,
          amount: Number(receiptAmount),
          currency,
          exchangeRate: rate,
          reference: values.reference,
          note: values.note,
        }),
      });
      setMessage(result.message);
      load();
      e.currentTarget.reset();
      setScheduleId(0);setReceiptAmount("");
    } catch (err) {
      setMessage((err as Error).message);
    }
  };
  const reconcile = async () => {
    if (!ledger) return;
    const raw = prompt(
      "Müşterinin bildirdiği bakiye nedir?",
      String(ledger.customer.balance),
    );
    if (raw === null) return;
    try {
      const result = await api<{ message: string }>(
        `/customers/${customerId}/reconciliations`,
        {
          method: "POST",
          body: JSON.stringify({
            statementDate: new Date().toISOString().slice(0, 10),
            declaredBalance: Number(raw),
          }),
        },
      );
      setMessage(result.message);
      load();
    } catch (err) {
      setMessage((err as Error).message);
    }
  };
  const tcmb = async () => {
    try {
      const result = await api<{
        message: string;
        rates: { currency: string; rate: number }[];
      }>("/exchange-rates/tcmb", { method: "POST" });
      setMessage(result.message);
      const selected = result.rates.find((x) => x.currency === currency);
      if (selected) setRate(selected.rate);
    } catch (err) {
      setMessage((err as Error).message);
    }
  };
  const selectedSchedule=ledger?.schedules.find(x=>x.id===scheduleId);
  const instrumentIncomplete=receiptMode==="INSTRUMENT"&&selectedSchedule&&(!selectedSchedule.instrumentId||!selectedSchedule.issuer||!selectedSchedule.serialNumber||(selectedSchedule.paymentType==="CHECK"&&!selectedSchedule.bankName));
  return (
    <>
      <PageHead
        eyebrow="FİNANS"
        title="Cari hesap ve tahsilat"
        description="Müşteri ekstresini inceleyin; nakit veya banka tahsilatını doğrudan cariye işleyin."
        action={
          ["ADMIN", "ACCOUNTING"].includes(user.role) && (
            <button className="mini-btn" onClick={tcmb}>
              TCMB kurlarını güncelle
            </button>
          )
        }
      />
      {message && <Toast text={message} close={() => setMessage("")} />}
      <section className="panel ledger-selector">
        <label className="field">
          <span>Müşteri</span>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(Number(e.target.value))}
          >
            <option value="">Müşteri seçin…</option>
            {customers.map((c) => (
              <option value={c.id} key={c.id}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
        </label>
        {ledger && (
          <>
            <div>
              <small>Güncel bakiye</small>
              <strong>{money(ledger.customer.balance)}</strong>
            </div>
            <button className="mini-btn" onClick={reconcile}>
              Mutabakat yap
            </button>
          </>
        )}
      </section>
      {ledger&&<section className="due-picker panel"><div className="due-picker-head"><div><span className="eyebrow">AÇIK VADELER</span><h2>Hangi ödemeyi tahsil ediyorsunuz?</h2><p>Normal taksit, çek ve senetlerin tamamı burada görünür. Vadesi gelmemiş evrak da erken tahsil edilebilir.</p></div><button className={receiptMode==="GENERAL"?"mini-btn active":"mini-btn"} onClick={()=>{setReceiptMode("GENERAL");setScheduleId(0);setReceiptAmount("")}}>Vadeden bağımsız ödeme</button></div><div className="due-options">{ledger.schedules.map(x=>{const overdue=x.dueDate<new Date().toISOString().slice(0,10);const instrument=["CHECK","PROMISSORY_NOTE"].includes(x.paymentType);return <button key={x.id} className={`${scheduleId===x.id&&receiptMode!=="GENERAL"?"selected":""} ${overdue?"overdue":""}`} onClick={()=>chooseSchedule(x.id)}><span><b>{x.saleNumber} · {paymentTypeLabel(x.paymentType)}</b><small>{overdue?"Vadesi geçti":x.dueDate>new Date().toISOString().slice(0,10)&&instrument?"Erken tahsil edilebilir":"Vade"} · {dateOnly(x.dueDate)}</small>{instrument&&<small>{x.instrumentNumber||"Evrak hazırlanıyor"}</small>}</span><strong>{money(x.remainingAmount,x.currency)}<small>{x.paidAmount>0?`${money(x.paidAmount,x.currency)} ödendi`:instrument?"Evrak tutarı":"Kalan taksit"}</small></strong></button>})}{!ledger.schedules.length&&<EmptyInline text="Bu müşterinin açık taksit, çek veya senedi bulunmuyor. Serbest tahsilat kullanabilirsiniz."/>}</div></section>}
      {ledger && (
        <div className="detail-grid ledger-layout">
          <section className="panel">
            <PanelTitle title="Cari ekstre" />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tarih / açıklama</th>
                    <th>Borç</th>
                    <th>Alacak</th>
                    <th>Bakiye</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.transactions.map((x) => (
                    <tr key={x.id}>
                      <td>
                        <b>{x.description}</b>
                        <small>
                          {dateOnly(x.transactionDate)} ·{" "}
                          {x.createdBy || "Sistem"}
                        </small>
                      </td>
                      <td>{x.debit ? money(x.debit) : "—"}</td>
                      <td>{x.credit ? money(x.credit) : "—"}</td>
                      <td className="amount">{money(x.runningBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {["ADMIN", "ACCOUNTING"].includes(user.role) && (
            <form className="panel receipt-form" onSubmit={receipt}>
              <PanelTitle title={receiptMode==="INSTRUMENT"?"Çek / senet tahsil et":receiptMode==="SCHEDULE"?"Seçili vadeyi tahsil et":"Vadeden bağımsız tahsilat"} />
              {receiptMode!=="GENERAL"?<div className="receipt-context">{selectedSchedule?<><small>{receiptMode==="INSTRUMENT"?"TAHSİL EDİLEN EVRAK":"TAHSİL EDİLEN VADE"}</small><b>{selectedSchedule.saleNumber} · {dateOnly(selectedSchedule.dueDate)}</b><span>Kalan: {money(selectedSchedule.remainingAmount,selectedSchedule.currency)}</span>{instrumentIncomplete&&<><span className="danger-text">Tahsilattan önce keşideci/borçlu, seri no ve banka bilgisi tamamlanmalıdır.</span><NavLink className="mini-btn" to="/kiymetli-evrak">Kıymetli Evrakta tamamla</NavLink></>}</>:<p>Yukarıdaki açık vadelerden birini seçin.</p>}</div>:<div className="receipt-context general"><b>Genel cari ödemesi</b><span>Bu ödeme belirli bir taksiti kapatmaz; yalnızca toplam müşteri borcundan düşer.</span></div>}
              {receiptMode!=="INSTRUMENT"&&<label className="field">
                <span>Yöntem</span>
                <select name="method">
                  <option value="BANK_TRANSFER">Havale / EFT</option>
                  <option value="CASH">Nakit</option>
                </select>
              </label>}
              <div className="currency-row">
                <label className="field">
                  <span>Para birimi</span>
                  <select
                    value={currency}
                    disabled={receiptMode!=="GENERAL"&&!!scheduleId}
                    onChange={(e) => {
                      setCurrency(e.target.value);
                      setRate(e.target.value === "TRY" ? 1 : rate);
                    }}
                  >
                    <option>TRY</option>
                    <option>USD</option>
                    <option>EUR</option>
                  </select>
                </label>
                <label className="field">
                  <span>Tahsilat kuru</span>
                  <input
                    type="number"
                    step="0.0001"
                    value={rate}
                    readOnly={currency === "TRY"}
                    onChange={(e) => setRate(Number(e.target.value))}
                  />
                </label>
              </div>
              <label className="field">
                <span>Tutar</span>
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    readOnly={receiptMode==="INSTRUMENT"}
                    max={receiptMode==="SCHEDULE"&&scheduleId?ledger.schedules.find(x=>x.id===scheduleId)?.remainingAmount:undefined}
                    value={receiptAmount}
                    onChange={e=>setReceiptAmount(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Tahsilat tarihi</span>
                <input
                  required
                  name="receiptDate"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                />
              </label>
              <label className="field">
                <span>Dekont / referans</span>
                <input name="reference" />
              </label>
              <label className="field">
                <span>Not</span>
                <input name="note" />
              </label>
              <button className="primary-btn full" disabled={!receiptAmount||(receiptMode!=="GENERAL"&&!scheduleId)||!!instrumentIncomplete}>
                {receiptMode==="INSTRUMENT"?"Evrakı tahsil et":receiptMode==="SCHEDULE"?"Seçili vadeye tahsilat işle":"Genel tahsilatı cariye işle"}
              </button>
            </form>
          )}
        </div>
      )}
    </>
  );
}

function Shipments({ user }: { user: User }) {
  const [items, setItems] = useState<Shipment[]>([]);
  const [message, setMessage] = useState("");
  const [states, setStates] = useState<Record<number, string>>({});
  const [extras, setExtras] = useState<
    Record<
      number,
      {
        vehiclePlate: string;
        driverName: string;
        recipientName: string;
        dispatchNumber: string;
      }
    >
  >({});
  const load = useCallback(
    () => api<Shipment[]>("/shipments").then(setItems),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);
  const change = async (item: Shipment) => {
    const status = states[item.id];
    if (!status) return setMessage("Yeni sevkiyat durumunu seçin.");
    const extra = extras[item.id] || {
      vehiclePlate: "",
      driverName: "",
      recipientName: "",
      dispatchNumber: "",
    };
    try {
      await api(`/shipments/${item.id}/status`, {
        method: "POST",
        body: JSON.stringify({
          status,
          ...extra,
          actualDate:
            status === "DELIVERED"
              ? new Date().toISOString().slice(0, 10)
              : undefined,
        }),
      });
      setMessage("Sevkiyat durumu güncellendi.");
      load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  const open = items.filter(
    (x) => !["DELIVERED", "CANCELLED"].includes(x.status),
  );
  const delivered = items.filter((x) => x.status === "DELIVERED");
  return (
    <>
      <PageHead
        eyebrow="OPERASYON"
        title="Sevkiyatlar"
        description="Onaylı satışlardan planlanan, yoldaki ve tamamlanan sevkiyatları takip edin."
        action={
          ["ADMIN", "SHIPPING"].includes(user.role) && (
            <NavLink className="primary-btn" to="/sevkiyatlar/yeni">
              <Plus />
              Yeni sevkiyat
            </NavLink>
          )
        }
      />
      {message && <Toast text={message} close={() => setMessage("")} />}
      <div className="metric-grid shipment-metrics">
        <Metric
          icon={<PackageCheck />}
          tone="amber"
          label="Açık sevkiyat"
          value={String(open.length)}
          note="Hazırlanan ve yoldaki"
        />
        <Metric
          icon={<CheckCircle2 />}
          tone="green"
          label="Teslim edilen"
          value={String(delivered.length)}
          note="Tamamlanan teslimat"
        />
        <Metric
          icon={<Boxes />}
          tone="blue"
          label="Toplam planlanan adet"
          value={String(open.reduce((s, x) => s + x.totalQuantity, 0))}
          note="Açık sevkiyatlarda"
        />
      </div>
      <div className="shipment-list">
        {items.map((item) => {
          const extra = extras[item.id] || {
            vehiclePlate: item.vehiclePlate || "",
            driverName: item.driverName || "",
            recipientName: item.recipientName || "",
            dispatchNumber: item.dispatchNumber || "",
          };
          return (
            <article className="shipment-card" key={item.id}>
              <div className="shipment-card-top">
                <span className="doc-icon">
                  <PackageCheck />
                </span>
                <div>
                  <small>
                    {item.number} · {item.saleNumber}
                  </small>
                  <h3>{item.customerName}</h3>
                  <p>{item.deliveryAddress}</p>
                </div>
                <div>
                  <b>{dateOnly(item.plannedDate)}</b>
                  <Status value={item.status} />
                </div>
              </div>
              <div className="shipment-facts">
                <span>
                  <small>Toplam miktar</small>
                  <b>{item.totalQuantity}</b>
                </span>
                <span>
                  <small>Araç</small>
                  <b>{item.vehiclePlate || "Atanmadı"}</b>
                </span>
                <span>
                  <small>Şoför</small>
                  <b>{item.driverName || "Atanmadı"}</b>
                </span>
                <span>
                  <small>İrsaliye</small>
                  <b>{item.dispatchNumber || "Bekliyor"}</b>
                </span>
              </div>
              {["ADMIN", "SHIPPING"].includes(user.role) &&
                !["DELIVERED", "CANCELLED"].includes(item.status) && (
                  <div className="shipment-actions">
                    <select
                      value={states[item.id] || ""}
                      onChange={(e) =>
                        setStates({ ...states, [item.id]: e.target.value })
                      }
                    >
                      <option value="">Sonraki durum…</option>
                      <option value="PREPARING">Hazırlanıyor</option>
                      <option value="READY">Sevke hazır</option>
                      <option value="IN_TRANSIT">Yola çıktı</option>
                      <option value="PARTIALLY_DELIVERED">Kısmi teslim</option>
                      <option value="DELIVERED">Teslim edildi</option>
                      <option value="CANCELLED">İptal</option>
                    </select>
                    {states[item.id] === "IN_TRANSIT" && (
                      <>
                        <input
                          placeholder="Araç plakası"
                          value={extra.vehiclePlate}
                          onChange={(e) =>
                            setExtras({
                              ...extras,
                              [item.id]: {
                                ...extra,
                                vehiclePlate: e.target.value,
                              },
                            })
                          }
                        />
                        <input
                          placeholder="Şoför"
                          value={extra.driverName}
                          onChange={(e) =>
                            setExtras({
                              ...extras,
                              [item.id]: {
                                ...extra,
                                driverName: e.target.value,
                              },
                            })
                          }
                        />
                        <input
                          placeholder="İrsaliye no"
                          value={extra.dispatchNumber}
                          onChange={(e) =>
                            setExtras({
                              ...extras,
                              [item.id]: {
                                ...extra,
                                dispatchNumber: e.target.value,
                              },
                            })
                          }
                        />
                      </>
                    )}
                    {states[item.id] === "DELIVERED" && (
                      <input
                        placeholder="Teslim alan kişi"
                        value={extra.recipientName}
                        onChange={(e) =>
                          setExtras({
                            ...extras,
                            [item.id]: {
                              ...extra,
                              recipientName: e.target.value,
                            },
                          })
                        }
                      />
                    )}
                    <button className="mini-btn" onClick={() => change(item)}>
                      Durumu güncelle
                    </button>
                  </div>
                )}
            </article>
          );
        })}
        {!items.length && (
          <section className="panel">
            <EmptyInline text="Henüz sevkiyat oluşturulmadı." />
          </section>
        )}
      </div>
    </>
  );
}

function NewShipment() {
  type Plan = {
    id: number;
    number: string;
    customerName: string;
    city: string;
    remainingQuantity: number;
  };
  type PlanDetail = {
    sale: {
      id: number;
      number: string;
      customerId: number;
      customerName: string;
      city: string;
    };
    items: {
      saleItemId: number;
      productId: number;
      code: string;
      name: string;
      unit: string;
      soldQuantity: number;
      allocatedQuantity: number;
      remainingQuantity: number;
    }[];
  };
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [saleId, setSaleId] = useState(0);
  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Plan[]>("/shipment-plans").then(setPlans);
  }, []);
  useEffect(() => {
    if (saleId)
      api<PlanDetail>(`/sales/${saleId}/shipment-plan`).then((data) => {
        setDetail(data);
        setQuantities(
          Object.fromEntries(
            data.items
              .filter((x) => x.remainingQuantity > 0)
              .map((x) => [x.saleItemId, x.remainingQuantity]),
          ),
        );
      });
  }, [saleId]);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!detail) return;
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api("/shipments", {
        method: "POST",
        body: JSON.stringify({
          saleId,
          plannedDate: values.plannedDate,
          deliveryAddress: values.deliveryAddress,
          vehiclePlate: values.vehiclePlate || undefined,
          driverName: values.driverName || undefined,
          note: values.note || undefined,
          items: detail.items
            .filter((x) => (quantities[x.saleItemId] || 0) > 0)
            .map((x) => ({
              saleItemId: x.saleItemId,
              quantity: quantities[x.saleItemId],
            })),
        }),
      });
      navigate("/sevkiyatlar");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit}>
      <PageHead
        eyebrow="YENİ OPERASYON"
        title="Sevkiyat oluştur"
        description="Onaylı satışı seçin; sistem yalnızca sevk edilmemiş miktarları getirsin."
      />
      {error && <div className="error-box">{error}</div>}
      <div className="form-layout">
        <div className="form-main">
          <section className="panel form-section">
            <div className="section-number">1</div>
            <div className="section-content">
              <h2>Onaylı satış</h2>
              <p>Sevki bekleyen satışlar listelenir.</p>
              <label className="field">
                <span>Satış seçin</span>
                <select
                  required
                  value={saleId}
                  onChange={(e) => setSaleId(Number(e.target.value))}
                >
                  <option value="">Satış seçin…</option>
                  {plans.map((x) => (
                    <option value={x.id} key={x.id}>
                      {x.number} · {x.customerName} · {x.remainingQuantity}{" "}
                      kalan
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
          {detail && (
            <>
              <section className="panel form-section">
                <div className="section-number">2</div>
                <div className="section-content">
                  <h2>Sevk edilecek ürünler</h2>
                  <p>
                    Kalanların tamamı seçildi; parçalı sevkiyat için miktarı
                    azaltabilirsiniz.
                  </p>
                  <div className="shipping-lines">
                    <div className="shipping-head">
                      <span>Ürün</span>
                      <span>Satılan</span>
                      <span>Önceki</span>
                      <span>Kalan</span>
                      <span>Bu sevkiyat</span>
                    </div>
                    {detail.items.map((x) => (
                      <div key={x.saleItemId}>
                        <span>
                          <b>{x.name}</b>
                          <small>
                            {x.code} · {x.unit}
                          </small>
                        </span>
                        <span>{x.soldQuantity}</span>
                        <span>{x.allocatedQuantity}</span>
                        <span>
                          <b>{x.remainingQuantity}</b>
                        </span>
                        <input
                          type="number"
                          min="0"
                          max={x.remainingQuantity}
                          value={quantities[x.saleItemId] || 0}
                          onChange={(e) =>
                            setQuantities({
                              ...quantities,
                              [x.saleItemId]: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
              <section className="panel form-section">
                <div className="section-number">3</div>
                <div className="section-content">
                  <h2>Plan ve teslimat</h2>
                  <p>Tarih ve adres zorunlu; araç daha sonra atanabilir.</p>
                  <div className="form-grid">
                    <label className="field">
                      <span>Planlanan tarih</span>
                      <input
                        required
                        name="plannedDate"
                        type="date"
                        defaultValue={addDaysToToday(1)}
                      />
                    </label>
                    <label className="field">
                      <span>Teslimat adresi</span>
                      <input
                        required
                        name="deliveryAddress"
                        defaultValue={detail.sale.city}
                      />
                    </label>
                    <label className="field">
                      <span>Araç plakası</span>
                      <input name="vehiclePlate" />
                    </label>
                    <label className="field">
                      <span>Şoför</span>
                      <input name="driverName" />
                    </label>
                    <label className="field wide">
                      <span>Not</span>
                      <input name="note" />
                    </label>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
        <aside className="summary-card">
          <span className="eyebrow">SEVKİYAT ÖZETİ</span>
          <h3>{detail?.sale.customerName || "Satış seçilmedi"}</h3>
          <div>
            <span>Satış</span>
            <b>{detail?.sale.number || "—"}</b>
          </div>
          <div className="total">
            <span>Toplam sevk</span>
            <b>{Object.values(quantities).reduce((s, x) => s + x, 0)} adet</b>
          </div>
          <button
            className="primary-btn full"
            disabled={
              busy || !detail || Object.values(quantities).every((x) => x <= 0)
            }
          >
            {busy ? "Oluşturuluyor…" : "Sevkiyatı oluştur"}
            <ChevronRight />
          </button>
          <small>
            Satış miktarından fazla sevkiyat sunucu tarafından engellenir.
          </small>
        </aside>
      </div>
    </form>
  );
}

function Instruments({ user }: { user: User }) {
  type Detail = {
    issuer: string;
    serialNumber: string;
    bankName: string;
    issueDate: string;
  };
  type Collection = { date: string; rate: number };
  type Config = { rates: { currency: string; rate: number }[] };
  const [items, setItems] = useState<Instrument[]>([]);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("ACTION");
  const [openId,setOpenId]=useState<number|null>(null);
  const [states, setStates] = useState<Record<number, string>>({});
  const [counterparties, setCounterparties] = useState<Record<number, string>>(
    {},
  );
  const [details, setDetails] = useState<Record<number, Detail>>({});
  const [collections, setCollections] = useState<Record<number, Collection>>(
    {},
  );
  const allowed = ["ADMIN", "ACCOUNTING", "AUDITOR"].includes(user.role);
  const load = useCallback(() => {
    if (allowed)
      Promise.all([
        api<Instrument[]>("/instruments"),
        api<Config>("/configuration"),
      ]).then(([rows, config]) => {
        setItems(rows);
        setDetails(
          Object.fromEntries(
            rows.map((x) => [
              x.id,
              {
                issuer: x.issuer || "",
                serialNumber: x.serialNumber || "",
                bankName: x.bankName || "",
                issueDate: x.issueDate || new Date().toISOString().slice(0, 10),
              },
            ]),
          ),
        );
        setCollections((current) =>
          Object.fromEntries(
            rows.map((x) => [
              x.id,
              current[x.id] || {
                date: new Date().toISOString().slice(0, 10),
                rate:
                  x.currency === "TRY"
                    ? 1
                    : config.rates.find((r) => r.currency === x.currency)
                        ?.rate || x.exchangeRate,
              },
            ]),
          ),
        );
      });
  }, [allowed]);
  useEffect(() => {
    load();
  }, [load]);
  const saveDetail = async (item: Instrument) => {
    try {
      await api(`/instruments/${item.id}`, {
        method: "PUT",
        body: JSON.stringify(details[item.id]),
      });
      setMessage("Evrak bilgileri tamamlandı.");
      load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  const move = async (item: Instrument, forcedStatus?: string) => {
    const status = forcedStatus || states[item.id];
    if (!status) return setMessage("Yeni durum seçin.");
    const collection = collections[item.id];
    try {
      await api(`/instruments/${item.id}/movements`, {
        method: "POST",
        body: JSON.stringify({
          status,
          counterparty: counterparties[item.id] || undefined,
          movementDate:
            status === "COLLECTED"
              ? collection.date
              : new Date().toISOString().slice(0, 10),
          exchangeRate:
            status === "COLLECTED"
              ? item.currency === "TRY"
                ? 1
                : collection.rate
              : undefined,
        }),
      });
      setMessage(
        status === "COLLECTED"
          ? "Tahsilat kuru ve kur farkıyla birlikte kaydedildi."
          : "Kıymetli evrak hareketi kaydedildi.",
      );
      load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  const shown = items.filter(
    (x) =>
      filter === "ALL" ||
      (filter === "ACTION" && !["COLLECTED","CANCELLED","ENDORSED","ASSIGNED"].includes(x.status) && (x.daysToDue<=7 || !x.issuer || !x.serialNumber || (x.instrumentType==="CHECK"&&!x.bankName))) ||
      (filter === "DUE" &&
        x.daysToDue === 0 &&
        !["COLLECTED", "CANCELLED"].includes(x.status)) ||
      (filter === "OVERDUE" &&
        x.daysToDue < 0 &&
        !["COLLECTED", "CANCELLED"].includes(x.status)) ||
      (filter === "UPCOMING" &&
        x.daysToDue > 0 &&
        !["COLLECTED", "CANCELLED"].includes(x.status)) ||
      (filter === "COLLECTED" && x.status === "COLLECTED"),
  );
  if (!allowed)
    return (
      <Empty
        title="Kıymetli Evrak"
        text="Bu ekran muhasebe, yönetici ve denetçi rollerine açıktır."
      />
    );
  return (
    <>
      <PageHead
        eyebrow="ÇEK VE SENET"
        title="Kıymetli evrak"
        description="Önce işlem isteyen evrakları görün; ayrıntıları yalnızca gerektiğinde açın."
      />
      {message && <Toast text={message} close={() => setMessage("")} />}
      <div className="instrument-stats">
        <Metric
          icon={<FileClock />}
          tone="amber"
          label="Bugün vadesi gelen"
          value={String(
            items.filter(
              (x) =>
                x.daysToDue === 0 &&
                !["COLLECTED", "CANCELLED"].includes(x.status),
            ).length,
          )}
          note="Tahsilat bekliyor"
        />
        <Metric
          icon={<CircleDollarSign />}
          tone="green"
          label="Açık portföy"
          value={money(
            items
              .filter((x) => !["COLLECTED", "CANCELLED"].includes(x.status))
              .reduce((s, x) => s + x.tryAmount, 0),
          )}
          note="TL karşılığı"
        />
        <Metric
          icon={<FileClock />}
          tone="violet"
          label="Geciken"
          value={String(
            items.filter(
              (x) =>
                x.daysToDue < 0 &&
                !["COLLECTED", "CANCELLED"].includes(x.status),
            ).length,
          )}
          note="İşlem gerekiyor"
        />
      </div>
      <div className="filter-tabs">
        {[
          ["ACTION", "İşlem gerekenler"],
          ["DUE", "Bugün"],
          ["OVERDUE", "Geciken"],
          ["UPCOMING", "Yaklaşan"],
          ["COLLECTED", "Tahsil edilen"],
          ["ALL", "Tümü"],
        ].map(([v, l]) => (
          <button
            className={filter === v ? "active" : ""}
            onClick={() => setFilter(v)}
            key={v}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="instrument-list">
        {shown.map((item) => {
          const detail = details[item.id] || {
            issuer: "",
            serialNumber: "",
            bankName: "",
            issueDate: "",
          };
          const incomplete =
            !item.issuer ||
            !item.serialNumber ||
            (item.instrumentType === "CHECK" && !item.bankName);
          const expanded=openId===item.id;
          return (
            <article
              className={`instrument-card ${item.daysToDue < 0 ? "overdue" : ""}`}
              key={item.id}
            >
              <div className="instrument-card-head">
                <span className="doc-icon">
                  <Landmark />
                </span>
                <div>
                  <small>
                    {item.number} · {item.saleNumber}
                  </small>
                  <h3>{item.customerName}</h3>
                  <p>
                    <span className={`currency-badge ${item.currency.toLowerCase()}`}>{item.currency}</span>
                    {item.instrumentType === "CHECK" ? "Çek" : "Senet"} · <b>{money(item.amount, item.currency)}</b>
                    {item.currency!=="TRY"&&<small className="try-equivalent">TL karşılığı {money(item.tryAmount)}</small>}
                  </p>
                </div>
                <div className="due-box">
                  <small>
                    {item.daysToDue < 0
                      ? `${Math.abs(item.daysToDue)} gün gecikti`
                      : item.daysToDue === 0
                        ? "Bugün vadeli"
                        : `${item.daysToDue} gün kaldı`}
                  </small>
                  <strong>
                    {new Intl.DateTimeFormat("tr-TR", {
                      dateStyle: "medium",
                    }).format(new Date(item.dueDate + "T12:00:00"))}
                  </strong>
                  <Status value={item.status} />
                  <button className="instrument-toggle" onClick={()=>setOpenId(expanded?null:item.id)}>{expanded?"Kapat":item.status==="COLLECTED"?"Detayı gör":"İşlem yap"}</button>
                </div>
              </div>
              {!expanded&&incomplete&&<div className="instrument-warning">Evrak bilgileri eksik · işlem için tamamlayın</div>}
              {incomplete && expanded && (
                <div className="detail-editor">
                  <b>Evrak bilgilerini tamamlayın</b>
                  <div>
                    <input
                      placeholder={
                        item.instrumentType === "CHECK" ? "Keşideci" : "Borçlu"
                      }
                      value={detail.issuer}
                      onChange={(e) =>
                        setDetails({
                          ...details,
                          [item.id]: { ...detail, issuer: e.target.value },
                        })
                      }
                    />
                    <input
                      placeholder="Seri / evrak no"
                      value={detail.serialNumber}
                      onChange={(e) =>
                        setDetails({
                          ...details,
                          [item.id]: {
                            ...detail,
                            serialNumber: e.target.value,
                          },
                        })
                      }
                    />
                    {item.instrumentType === "CHECK" && (
                      <input
                        placeholder="Banka"
                        value={detail.bankName}
                        onChange={(e) =>
                          setDetails({
                            ...details,
                            [item.id]: { ...detail, bankName: e.target.value },
                          })
                        }
                      />
                    )}
                    <input
                      type="date"
                      value={detail.issueDate}
                      onChange={(e) =>
                        setDetails({
                          ...details,
                          [item.id]: { ...detail, issueDate: e.target.value },
                        })
                      }
                    />
                    {user.role !== "AUDITOR" && (
                      <button
                        className="mini-btn"
                        onClick={() => saveDetail(item)}
                      >
                        Bilgileri kaydet
                      </button>
                    )}
                  </div>
                </div>
              )}
              {!incomplete && expanded && (
                <div className="instrument-info">
                  <span>
                    <small>
                      {item.instrumentType === "CHECK" ? "Keşideci" : "Borçlu"}
                    </small>
                    <b>{item.issuer}</b>
                  </span>
                  <span>
                    <small>Seri no</small>
                    <b>{item.serialNumber}</b>
                  </span>
                  {item.bankName && (
                    <span>
                      <small>Banka</small>
                      <b>{item.bankName}</b>
                    </span>
                  )}
                  {item.currentHolder && (
                    <span>
                      <small>Güncel hamil</small>
                      <b>{item.currentHolder}</b>
                    </span>
                  )}
                </div>
              )}{" "}
              {expanded && item.status === "COLLECTED" && item.collectionRate && (
                <div className="collection-summary">
                  <span><small>Kayıt / satış kuru</small><b>{item.currency === "TRY" ? "1,0000" : item.exchangeRate.toLocaleString("tr-TR", { minimumFractionDigits: 4 })}</b></span>
                  <span><small>Tahsilat tarihi</small><b>{dateOnly(item.collectionDate!)}</b></span>
                  <span><small>Tahsilat kuru</small><b>{item.collectionRate.toLocaleString("tr-TR", { minimumFractionDigits: 4 })}</b></span>
                  <span><small>Tahsil edilen TL</small><b>{money(item.collectedTryAmount || 0)}</b></span>
                  <span className={(item.exchangeDifference || 0) < 0 ? "negative" : "positive"}><small>Kur farkı</small><b>{money(item.exchangeDifference || 0)}</b></span>
                </div>
              )}
              {expanded && !incomplete && user.role !== "AUDITOR" &&
                !["COLLECTED", "CANCELLED", "ENDORSED", "ASSIGNED"].includes(
                  item.status,
                ) && (
                  <>
                  <div className="collection-editor">
                    <b>Tahsilat bilgisi</b>
                    <label><small>Gerçekleşen tarih</small><input type="date" value={collections[item.id]?.date || ""} onChange={(e) => setCollections({...collections,[item.id]:{...collections[item.id],date:e.target.value}})} /></label>
                    <label><small>{item.currency === "TRY" ? "Kur" : `${item.currency} tahsilat kuru`}</small><input type="number" min="0.0001" step="0.0001" readOnly={item.currency === "TRY"} value={collections[item.id]?.rate || ""} onChange={(e) => setCollections({...collections,[item.id]:{...collections[item.id],rate:Number(e.target.value)}})} /></label>
                    <span><small>Tahsilat TL karşılığı</small><b>{money(item.amount * (collections[item.id]?.rate || item.exchangeRate))}</b></span>
                    <button className="collect-btn" disabled={!collections[item.id]?.date || !collections[item.id]?.rate} onClick={() => move(item, "COLLECTED")}><CheckCircle2 />Tahsilatı kaydet</button>
                  </div>
                  <div className="instrument-actions">
                    <select
                      value={states[item.id] || ""}
                      onChange={(e) =>
                        setStates({ ...states, [item.id]: e.target.value })
                      }
                    >
                      <option value="">Diğer işlem…</option>
                      <option value="IN_PORTFOLIO">Portföye al</option>
                      <option value="GIVEN_TO_BANK">Bankaya verildi</option>
                      <option value="ENDORSED">Ciro edildi</option>
                      <option value="ASSIGNED">Temlik edildi</option>
                      <option value="BOUNCED">Karşılıksız</option>
                      <option value="PROTESTED">Protestolu</option>
                      <option value="RETURNED">İade</option>
                    </select>
                    {["ENDORSED", "ASSIGNED"].includes(states[item.id]) && (
                      <input
                        placeholder="Devredilen kişi/kurum"
                        value={counterparties[item.id] || ""}
                        onChange={(e) =>
                          setCounterparties({
                            ...counterparties,
                            [item.id]: e.target.value,
                          })
                        }
                      />
                    )}
                    <button className="mini-btn" onClick={() => move(item)}>
                      Uygula
                    </button>
                  </div>
                  </>
                )}
            </article>
          );
        })}
        {!shown.length && (
          <section className="panel">
            <EmptyInline text="Bu filtrede kıymetli evrak bulunmuyor." />
          </section>
        )}
      </div>
    </>
  );
}

function EDocuments({ user }: { user: User }) {
  type Config = {
    settings: Record<string, string>;
    documentProviders: string[];
  };
  const [items, setItems] = useState<EDocument[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [message, setMessage] = useState("");
  const [sourceId, setSourceId] = useState(0);
  const [documentType, setDocumentType] = useState("E_INVOICE");
  const allowed = ["ADMIN", "ACCOUNTING", "SHIPPING", "AUDITOR"].includes(
    user.role,
  );
  const load = useCallback(() => {
    if (allowed)
      Promise.all([
        api<EDocument[]>("/e-documents"),
        api<Config>("/configuration"),
        api<Sale[]>("/sales"),
      ]).then(([docs, c, s]) => {
        setItems(docs);
        setConfig(c);
        setSales(
          s.filter((x) => x.status === "APPROVED" || x.status === "COMPLETED"),
        );
      });
  }, [allowed]);
  useEffect(() => {
    load();
  }, [load]);
  const setProvider = async (value: string) => {
    try {
      const result = await api<{ message: string }>(
        "/configuration/edocument.provider",
        { method: "PUT", body: JSON.stringify({ value }) },
      );
      setMessage(result.message);
      load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  const createDocument = async () => {
    if (!sourceId) return setMessage("Onaylanmış bir satış seçin.");
    try {
      const result = await api<{ message: string }>("/e-documents", {
        method: "POST",
        body: JSON.stringify({ documentType, sourceType: "SALE", sourceId }),
      });
      setMessage(result.message);
      load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  if (!allowed)
    return (
      <Empty
        title="e-Belgeler"
        text="Bu ekran yönetici, muhasebe, sevkiyat ve denetçi rollerine açıktır."
      />
    );
  return (
    <>
      <PageHead
        eyebrow="GİB / ERP ENTEGRASYONU"
        title="e-Belgeler"
        description="e-Fatura, e-Arşiv ve e-İrsaliye taleplerini sağlayıcı durumlarıyla izleyin."
      />
      {message && <Toast text={message} close={() => setMessage("")} />}
      <section className="provider-card">
        <div>
          <FileText />
          <span>
            <b>Belge sağlayıcısı</b>
            <small>Resmî belge numarası seçilen kaynak sistemden döner.</small>
          </span>
        </div>
        <select
          disabled={user.role !== "ADMIN"}
          value={config?.settings["edocument.provider"] || "NOT_CONFIGURED"}
          onChange={(e) => setProvider(e.target.value)}
        >
          {(config?.documentProviders || []).map((p) => (
            <option value={p} key={p}>
              {providerLabel(p)}
            </option>
          ))}
        </select>
      </section>
      {user.role !== "AUDITOR" && (
        <section className="document-create">
          <label className="field">
            <span>Onaylı satış</span>
            <select
              value={sourceId}
              onChange={(e) => setSourceId(Number(e.target.value))}
            >
              <option value="">Satış seçin…</option>
              {sales.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.number} · {s.customerName} ·{" "}
                  {money(s.grandTotal, s.currency)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Belge türü</span>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
            >
              <option value="E_INVOICE">e-Fatura</option>
              <option value="E_ARCHIVE">e-Arşiv Fatura</option>
              <option value="E_DISPATCH">e-İrsaliye</option>
            </select>
          </label>
          <button className="primary-btn" onClick={createDocument}>
            <Plus />
            Belge talebi oluştur
          </button>
        </section>
      )}
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Belge türü</th>
                <th>Kaynak</th>
                <th>Sağlayıcı</th>
                <th>Belge no / UUID</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id}>
                  <td>
                    <b>{documentTypeLabel(d.documentType)}</b>
                    <small>{formatDate(d.createdAt)}</small>
                  </td>
                  <td>{d.sourceNumber || `${d.sourceType} #${d.sourceId}`}</td>
                  <td>{providerLabel(d.provider)}</td>
                  <td>
                    {d.documentNumber || "—"}
                    <small>{d.uuid || "Sağlayıcı cevabı bekleniyor"}</small>
                  </td>
                  <td>
                    <Status value={d.status} />
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr>
                  <td colSpan={5}>
                    <EmptyInline text="Henüz e-Belge talebi bulunmuyor." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function UserPermissions({currentUser}:{currentUser:User}){
  type ManagedUser=User&{active:boolean;permissions:string[]};
  type Response={permissions:string[];users:ManagedUser[]};
  const labels:Record<string,{title:string;description:string}>={DASHBOARD:{title:"Ana Sayfa",description:"Günlük özet ve bildirimler"},CUSTOMERS:{title:"Müşteriler",description:"Müşteri listesi ve detayları"},SALES:{title:"Satışlar",description:"Satış listesi ve yeni satış"},INSTRUMENTS:{title:"Kıymetli Evrak",description:"Çek ve senet işlemleri"},RECEIPTS:{title:"Cari ve Tahsilat",description:"Cari ekstre, vadeler ve tahsilat"},APPROVALS:{title:"Onaylar",description:"Onay, ret ve düzeltme kararları"},SHIPMENTS:{title:"Sevkiyatlar",description:"Sevkiyat planlama ve teslimat"},EDOCUMENTS:{title:"e-Belgeler",description:"e-Fatura, e-Arşiv ve e-İrsaliye"},AUDIT:{title:"Denetim Kayıtları",description:"Değiştirilemez işlem geçmişi"},SECURITY:{title:"Hesap Güvenliği",description:"2FA, passkey ve cihazlar"},USER_MANAGEMENT:{title:"Kullanıcı Yetkileri",description:"Kullanıcı ekran erişimlerini yönetme"}};
  const [data,setData]=useState<Response|null>(null);const [selectedId,setSelectedId]=useState(0);const [draft,setDraft]=useState<string[]>([]);const [message,setMessage]=useState("");
  const load=useCallback(()=>api<Response>("/admin/users").then(result=>{setData(result);const id=selectedId||result.users.find(x=>x.role!=="ADMIN")?.id||result.users[0]?.id||0;setSelectedId(id);setDraft(result.users.find(x=>x.id===id)?.permissions||[])}),[selectedId]);
  useEffect(()=>{if(currentUser.role==="ADMIN")load()},[currentUser.role,load]);
  if(currentUser.role!=="ADMIN")return <Empty title="Kullanıcı Yetkileri" text="Bu ekran yalnızca yöneticilere açıktır."/>;
  if(!data)return <div className="loading">Yetkiler hazırlanıyor…</div>;
  const selected=data.users.find(x=>x.id===selectedId);const isAdmin=selected?.role==="ADMIN";
  const selectUser=(id:number)=>{setSelectedId(id);setDraft(data.users.find(x=>x.id===id)?.permissions||[]);setMessage("")};
  const toggle=(key:string)=>setDraft(draft.includes(key)?draft.filter(x=>x!==key):[...draft,key]);
  const save=async()=>{if(!selected)return;try{const result=await api<{message:string}>(`/admin/users/${selected.id}/permissions`,{method:"PUT",body:JSON.stringify({permissions:draft})});setMessage(result.message);const users=data.users.map(x=>x.id===selected.id?{...x,permissions:draft}:x);setData({...data,users})}catch(e){setMessage((e as Error).message)}};
  return <><PageHead eyebrow="YÖNETİM" title="Kullanıcı yetkileri" description="Kullanıcının sol menüde göreceği ve erişebileceği modülleri belirleyin."/>{message&&<Toast text={message} close={()=>setMessage("")}/>}<div className="permission-layout"><section className="panel permission-users"><PanelTitle title="Kullanıcılar"/><div>{data.users.map(user=><button className={selectedId===user.id?"selected":""} onClick={()=>selectUser(user.id)} key={user.id}><span className="avatar">{user.name.split(" ").map(x=>x[0]).join("").slice(0,2)}</span><span><b>{user.name}</b><small>{roleLabels[user.role]} · {user.email}</small></span><em>{user.permissions.length} ekran</em></button>)}</div></section><section className="panel permission-editor"><div className="permission-head"><div><span className="eyebrow">ERİŞİM AYARLARI</span><h2>{selected?.name}</h2><p>{isAdmin?"Yönetici hesapları güvenlik nedeniyle bütün ekranlara erişir.":"İşaretlenen ekranlar kullanıcının sol menüsünde görünür."}</p></div><button className="primary-btn" disabled={isAdmin} onClick={save}>Yetkileri kaydet</button></div><div className="permission-grid">{data.permissions.map(key=>{const meta=labels[key]||{title:key,description:""};const checked=isAdmin||draft.includes(key);return <label className={checked?"checked":""} key={key}><input type="checkbox" checked={checked} disabled={isAdmin} onChange={()=>toggle(key)}/><span><b>{meta.title}</b><small>{meta.description}</small></span><CheckCircle2/></label>})}</div><div className="permission-note"><ShieldCheck/><span><b>Sunucu koruması etkin</b><small>Menüde gizlenen bir ekrana adres yazarak veya doğrudan API isteğiyle erişilemez. Rolün izin vermediği işlem, ekran seçilmiş olsa bile açılamaz.</small></span></div></section></div></>
}

function SecuritySettings() {
  type Device = {
    id: number;
    deviceName: string;
    ipAddress: string;
    userAgent: string;
    lastSeenAt: string;
    expiresAt: string;
  };
  const [devices, setDevices] = useState<Device[]>([]);
  const [message, setMessage] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const load = useCallback(
    () => api<Device[]>("/auth/devices").then(setDevices),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);
  const setup2fa = async () => {
    try {
      const result = await api<{ secret: string }>("/auth/2fa/setup", {
        method: "POST",
      });
      setSecret(result.secret);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  const enable2fa = async () => {
    try {
      const result = await api<{ message: string }>("/auth/2fa/enable", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setMessage(result.message);
      setSecret("");
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  const registerPasskey = async () => {
    try {
      const options = await api<
        Parameters<typeof startRegistration>[0]["optionsJSON"]
      >("/auth/passkey/register/options", { method: "POST" });
      const response = await startRegistration({ optionsJSON: options });
      const result = await api<{ message: string }>(
        "/auth/passkey/register/verify",
        {
          method: "POST",
          body: JSON.stringify({ ...response, deviceName: navigator.platform }),
        },
      );
      setMessage(result.message);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  const revoke = async (id: number) => {
    await api(`/auth/devices/${id}`, { method: "DELETE" });
    setMessage("Cihaz oturumu kapatıldı.");
    load();
  };
  return (
    <>
      <PageHead
        eyebrow="HESAP"
        title="Güvenlik ve cihazlar"
        description="İki aşamalı doğrulama, passkey ve açık oturumlarınızı yönetin."
      />
      {message && <Toast text={message} close={() => setMessage("")} />}
      <div className="security-grid">
        <section className="panel security-card">
          <ShieldCheck />
          <h2>İki aşamalı doğrulama</h2>
          <p>
            Authenticator uygulamasındaki tek kullanımlık kodla hesabınızı
            koruyun.
          </p>
          {!secret ? (
            <button className="primary-btn" onClick={setup2fa}>
              Kurulumu başlat
            </button>
          ) : (
            <>
              <div className="secret-box">
                <small>Authenticator uygulamasına girilecek anahtar</small>
                <code>{secret}</code>
              </div>
              <label className="field">
                <span>6 haneli doğrulama kodu</span>
                <input
                  value={code}
                  maxLength={6}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
              </label>
              <button className="primary-btn" onClick={enable2fa}>
                Doğrula ve etkinleştir
              </button>
            </>
          )}
        </section>
        <section className="panel security-card">
          <Landmark />
          <h2>Passkey</h2>
          <p>
            Windows Hello, parmak izi veya cihaz PIN'iyle parolasız giriş yapın.
          </p>
          <button className="primary-btn" onClick={registerPasskey}>
            Bu cihazda passkey oluştur
          </button>
          <small>
            Canlı ortamda HTTPS ve kurumsal alan adına bağlı çalışır.
          </small>
        </section>
      </div>
      <section className="panel">
        <PanelTitle title="Açık cihaz oturumları" />
        <div className="device-list">
          {devices.map((d) => (
            <div key={d.id}>
              <div className="avatar">
                <ShieldCheck />
              </div>
              <span>
                <b>{d.deviceName}</b>
                <small>
                  {d.ipAddress} · Son kullanım {formatDate(d.lastSeenAt)}
                </small>
              </span>
              <button className="reject-btn" onClick={() => revoke(d.id)}>
                Oturumu kapat
              </button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function AuditLogs({ user }: { user: User }) {
  type AuditLog = {
    id: number;
    action: string;
    entityType: string;
    entityId: string;
    ipAddress: string;
    correlationId: string;
    createdAt: string;
    actor: string | null;
  };
  const [logs, setLogs] = useState<AuditLog[]>([]);
  useEffect(() => {
    if (["ADMIN", "AUDITOR"].includes(user.role))
      api<AuditLog[]>("/audit-logs").then(setLogs);
  }, [user.role]);
  if (!["ADMIN", "AUDITOR"].includes(user.role))
    return (
      <Empty
        title="Denetim Kayıtları"
        text="Bu ekran yalnızca yetkili yönetici ve denetçilere açıktır."
      />
    );
  return (
    <>
      <PageHead
        eyebrow="GÜVENLİK"
        title="Denetim kayıtları"
        description="Kim, neyi, ne zaman yaptı? Değiştirilemez işlem geçmişi."
      />
      <section className="panel">
        <div className="audit-list">
          {logs.map((l) => (
            <div key={l.id}>
              <span className="audit-dot" />
              <div>
                <b>{actionLabel(l.action)}</b>
                <p>
                  {l.actor || "Sistem"} · {l.entityType} #{l.entityId}
                </p>
              </div>
              <code>{l.correlationId.slice(0, 8)}</code>
              <time>{formatDate(l.createdAt)}</time>
            </div>
          ))}
          {!logs.length && <EmptyInline text="Henüz denetim kaydı yok." />}
        </div>
      </section>
    </>
  );
}

function Status({ value }: { value: string }) {
  return (
    <span className={`status ${value.toLowerCase()}`}>
      <i />
      {statusLabels[value] || value}
    </span>
  );
}
function Toast({ text, close }: { text: string; close: () => void }) {
  return (
    <div className="toast">
      <CheckCircle2 />
      <span>{text}</span>
      <button onClick={close}>
        <X />
      </button>
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <>
      <PageHead title={title} description={text} />
      <section className="panel empty">
        <Boxes />
        <h2>Bu bölüm hazırlanıyor</h2>
        <p>{text}</p>
      </section>
    </>
  );
}
function EmptyInline({ text }: { text: string }) {
  return (
    <div className="empty-inline">
      <Boxes />
      <span>{text}</span>
    </div>
  );
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value.replace(" ", "T") + "Z"));
}
function actionLabel(v: string) {
  return (
    (
      {
        SALE_CREATED: "Satış oluşturuldu",
        SALE_SUBMITTED: "Satış onaya gönderildi",
        APPROVAL_APPROVED: "Satış onaylandı",
        APPROVAL_REJECTED: "Satış reddedildi",
        APPROVAL_REVISION_REQUESTED: "Düzeltme istendi",
        ACCESS_DENIED: "Yetkisiz erişim engellendi",
      } as Record<string, string>
    )[v] || v
  );
}
function providerLabel(v: string) {
  return (
    (
      {
        NOT_CONFIGURED: "Yapılandırılmadı",
        LOGO: "Logo",
        MIKRO: "Mikro",
        NETSIS: "Netsis",
        PRIVATE_INTEGRATOR: "Özel entegratör",
        GIB_PORTAL_EXPORT: "GİB Portal dışa aktarım",
      } as Record<string, string>
    )[v] || v
  );
}
function documentTypeLabel(v: string) {
  return (
    (
      {
        E_INVOICE: "e-Fatura",
        E_ARCHIVE: "e-Arşiv Fatura",
        E_DISPATCH: "e-İrsaliye",
      } as Record<string, string>
    )[v] || v
  );
}
function paymentTypeLabel(v: string) {
  return (
    (
      {
        CASH: "Peşin",
        BANK_TRANSFER: "Havale/EFT",
        CHECK: "Çek",
        PROMISSORY_NOTE: "Senet",
      } as Record<string, string>
    )[v] || v
  );
}
function transactionTypeLabel(v:string){return ({CASH_RECEIPT:"Nakit",BANK_RECEIPT:"Havale / EFT",INSTRUMENT_RECEIPT:"Çek / senet",DOWN_PAYMENT:"Peşinat",RECEIPT_REVERSAL:"Ters kayıt"} as Record<string,string>)[v]||"Tahsilat"}
function dateOnly(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(
    new Date(`${value}T12:00:00`),
  );
}

export default App;
