import {
  Fragment,
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
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
import { CheckAdvanceForm, CheckAdvanceHistory } from "./CheckAdvances";
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
          Siparişin her adımı
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
        <span className="eyebrow">ÇELMAK SİPARİŞ YÖNETİMİ</span>
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
    ["CUSTOMERS","/musteriler","Cariler",<Users/>],
    ["SALES","/satislar","Siparişler",<ShoppingCart/>],
    ["SALES","/yedek-parcalar","Yedek Parçalar",<Boxes/>],
    ["INSTRUMENTS","/kiymetli-evrak","Çek ve Senetler",<Landmark/>],
    ["RECEIPTS","/tahsilatlar","Tahsilatlar",<CircleDollarSign/>],
    ["RECEIPTS","/avanslar","Avanslar",<CircleDollarSign/>],
    ["APPROVALS","/onaylar","Onaylar",<ClipboardCheck/>],
    ["SHIPMENTS","/sevkiyatlar","Sevkiyatlar",<PackageCheck/>],
    ["EDOCUMENTS","/e-belgeler","e-Belgeler",<FileText/>],
    ["AUDIT","/loglar","İşlem Geçmişi",<ShieldCheck/>],
    ["SECURITY","/guvenlik","Güvenlik",<ShieldCheck/>],
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
            <span>Sipariş Yönetimi</span>
          </div>
        </div>
        <nav>
          {menu.filter(([permission])=>can(permission)).map(([permission,to,label,icon])=><SideLink key={permission} to={to} icon={icon} label={label} close={()=>setMobileOpen(false)}/>)}
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
          <div className="top-context"><b>Çelmak çalışma alanı</b><span>Yapmak istediğiniz işlemi sol menüden seçin.</span></div>
          <div className="top-actions">
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
            <Route path="/musteriler/:id" element={guard("CUSTOMERS",<CustomerDetail user={session.currentUser} />)} />
            <Route
              path="/satislar"
              element={guard("SALES",<Sales user={session.currentUser} />)}
            />
            <Route path="/satislar/yeni" element={guard("SALES",<NewSale key="new" />)} />
            <Route path="/satislar/:id/duzenle" element={guard("SALES",<NewSale key="edit" />)} />
            <Route path="/yedek-parcalar" element={guard("SALES",<SpareParts user={session.currentUser} />)} />
            <Route path="/yedek-parcalar/yeni" element={guard("SALES",<NewSale key="spare" spare />)} />
            <Route path="/onaylar/siparis/:id" element={guard("APPROVALS",<SaleDetail />)} />
            <Route path="/satislar/:id" element={guard("SALES",<SaleDetail />)} />
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
              element={guard("RECEIPTS",<Receipts key="receipts" user={session.currentUser} />)}
            />
            <Route
              path="/sevkiyatlar"
              element={guard("SHIPMENTS",<Shipments user={session.currentUser} />)}
            />
            <Route path="/avanslar" element={guard("RECEIPTS",<Receipts key="advances" user={session.currentUser} advanceOnly />)} />
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

function ScreenGuide({title,steps,note}:{title:string;steps:string[];note?:string}){
  return <section className="screen-guide"><div><span className="eyebrow">BU EKRANDA NE YAPACAĞIM?</span><h2>{title}</h2>{note&&<p>{note}</p>}</div><ol>{steps.map((step,index)=><li key={step}><i>{index+1}</i><span>{step}</span></li>)}</ol></section>
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
        eyebrow={new Intl.DateTimeFormat("tr-TR",{dateStyle:"full"}).format(new Date())}
        title={`Günaydın, ${user.name.split(" ")[0]}`}
        description="Bugünün sipariş, tahsilat ve onay gündemi burada."
        action={
          <NavLink className="primary-btn" to="/satislar/yeni">
            <Plus />
            Yeni sipariş
          </NavLink>
        }
      />
      <ScreenGuide title="Bugün nereden başlamalısınız?" steps={["Onay bekleyen iş varsa Onaylar ekranını kontrol edin.","Vadesi gelen ödemeler için Tahsilatlar veya Çek ve Senetler ekranına gidin.","Yeni sipariş için Yeni sipariş düğmesini kullanın."]} note="Aşağıdaki kartlar yalnızca özet verir; işlemi ilgili ekranda tamamlarsınız."/>
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
          label="Bekleyen sipariş"
          value={String(data.totals.pendingSales)}
          note="İşlem sırasındaki"
        />
        <Metric
          icon={<CheckCircle2 />}
          tone="violet"
          label="Onaylı sipariş hacmi"
          value={money(data.totals.approvedSales)}
          note="Toplam"
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <PanelTitle title="Son siparişler" link="/satislar" />
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
        title="Cariler"
        description="Müşteri, bayi ve tedarikçi carileri; bakiye, risk ve iletişim bilgileri."
        action={
          <NavLink className="primary-btn" to="/musteriler/yeni">
            <Plus />
            Yeni cari
          </NavLink>
        }
      />
      <ScreenGuide title="Müşteri ve tedarikçi hesaplarını buradan bulun." steps={["Arama alanına firma adı veya cari kodu yazın.","Kartta bakiye ve risk durumunu kontrol edin.","Sipariş, ödeme ve sevkiyat geçmişi için Cari detayını açın."]}/>
      <section className="panel">
        <div className="toolbar">
          <label className="search-input">
            <Search />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari ara…"
            />
          </label>
          <span>{shown.length} cari</span>
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
                  {(c.tags||"").split(",").includes("CUSTOMER")?(c.balance > c.riskLimit ? "Limit aşıldı" : "Risk normal"):"Tedarikçi hesabı"}
                </span>
              </div>
              <h3>{c.name}</h3>
              <div className="account-tags">{(c.tags||"CUSTOMER").split(",").map(tag=><span key={tag}>{({CUSTOMER:"Müşteri",SUPPLIER:"Tedarikçi",DEALER:"Bayi"} as Record<string,string>)[tag]||tag}</span>)}</div>
              <p>
                {c.code} · {c.city}
              </p>
              <div className="customer-finance">
                <div>
                  <small>{c.balance>0?"Bizim alacağımız":c.balance<0?"Bizim borcumuz":"Bakiye kapalı"}</small>
                  <strong>{money(Math.abs(c.balance))}</strong>
                </div>
                <div>
                  <small>{(c.tags||"").split(",").includes("CUSTOMER")?"Risk limiti":"Hesap türü"}</small>
                  <strong>{(c.tags||"").split(",").includes("CUSTOMER")?money(c.riskLimit):"Tedarikçi"}</strong>
                </div>
              </div>
              <NavLink className="text-btn" to={`/musteriler/${c.id}`}>
                Cari detayını aç <ChevronRight />
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
  const [tags,setTags]=useState(["CUSTOMER"]);
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
          tags,
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
        title="Yeni cari"
        description="Bir cari aynı anda müşteri, bayi ve tedarikçi olarak işaretlenebilir."
      />
      <ScreenGuide title="Firma hesabını üç bölümde oluşturun." steps={["Firma ve iletişim bilgilerini yazın.","Firmanın müşteri, bayi veya tedarikçi rollerini seçin.","Cari kodu, varsayılan vade ve risk limitini belirleyip kaydedin."]} note="Aynı firma hem müşteriniz hem tedarikçinizse iki türü birlikte işaretleyebilirsiniz."/>
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
        <div className="form-block"><h2>Cari türleri</h2><p className="info-note">Aynı firmaya birden fazla rol verebilirsiniz.</p><div className="tag-picker">{[["CUSTOMER","Müşteri"],["DEALER","Bayi"],["SUPPLIER","Tedarikçi"]].map(([value,label])=><label key={value} className={tags.includes(value)?"selected":""}><input type="checkbox" checked={tags.includes(value)} onChange={e=>setTags(e.target.checked?[...tags,value]:tags.length>1?tags.filter(x=>x!==value):tags)}/><span>{label}</span></label>)}</div></div>
        <div className="form-block">
          <h2>Cari kodu</h2>
          <div className="choice-grid code-source">
            {[
              ["AUTO", "Otomatik cari kodu"],
              ["MANUAL", "Cari kodunu elle gir"],
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
                <span>Cari kodu *</span>
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
            {busy ? "Kaydediliyor…" : "Cariyi oluştur"}
            <ChevronRight />
          </button>
        </div>
      </section>
    </form>
  );
}

function CustomerDetail({user}:{user:User}) {
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
  const [openShipment,setOpenShipment]=useState<number|null>(null);
  const [shipmentDetail,setShipmentDetail]=useState<{shipment:{deliveryAddress:string;vehiclePlate?:string;driverName?:string;dispatchNumber?:string;recipientName?:string;actualDate?:string;note?:string};items:{code:string;name:string;unit:string;quantity:number}[]}|null>(null);
  const showShipment=async(shipmentId:number)=>{if(openShipment===shipmentId){setOpenShipment(null);return}setOpenShipment(shipmentId);setShipmentDetail(await api(`/shipments/${shipmentId}`));};
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
            <NavLink className="primary-btn" to={`/satislar/yeni?customerId=${c.id}`}>
              <Plus />
              Yeni sipariş
            </NavLink>
          </div>
        }
      />
      <ScreenGuide title="Bu carinin bütün hareketlerini tek yerde görün." steps={["Üstte güncel borç ve gecikmiş ödemeyi kontrol edin.","Sekmelerden sipariş, vade veya sevkiyat geçmişini açın.","Yeni işlem için sağ üstteki sipariş veya kıymetli evrak düğmesini kullanın."]}/>
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
      <section className="panel advance-panel">
        <div><span className="eyebrow">BAĞLANTI AVANSI</span><h2>Avans ve siparişten düşme</h2><p>Önceden alınan ödeme cariye işlenir. Mevcut borçlardan sonra kalan tutarı makine veya yedek parça siparişinde kullanabilirsiniz.</p></div>
        <div className="advance-balance"><span>Kullanılabilir cari avansı</span><strong>{money(Math.max(0,-c.balance))}</strong><small>Net cari alacak bakiyesi · TL</small></div>
        <div className="head-actions">{user.permissions?.includes("RECEIPTS")&&<NavLink className="primary-btn" to={`/avanslar?customerId=${c.id}`}><Plus/>Avans gir / hareketleri gör</NavLink>}{user.permissions?.includes("SALES")&&<><NavLink className="mini-btn" to={`/satislar/yeni?customerId=${c.id}`}>Makine siparişinde kullan</NavLink><NavLink className="mini-btn" to={`/yedek-parcalar/yeni?customerId=${c.id}`}>Parça siparişinde kullan</NavLink></>}</div>
        <small>Avans düşümü sipariş formundaki “Cari avansından kullanılacak tutar” alanından yapılır; sipariş onaylandığında bakiyeye yansır. Avans girişini muhasebe veya yönetici yapabilir.</small>
      </section>
      <div className="detail-tabs">
        {[
          ["overview", "Borç özeti"],
          ["sales", "Siparişler"],
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
            <p>Siparişler müşteriyi borçlandırır; nakit, havale, çek ve senet tahsilatları borcu azaltır.</p>
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
                    <th>Sipariş</th>
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
                  <th>Sipariş</th>
                  <th>Planlanan tarih</th>
                  <th>Miktar</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {data.shipments.map((x) => (
                  <Fragment key={x.id}><tr className="clickable-row" onClick={()=>showShipment(x.id)}>
                    <td>
                      <b>{x.number}</b>
                    </td>
                    <td>{x.saleNumber}</td>
                    <td>{dateOnly(x.plannedDate)}</td>
                    <td>{x.totalQuantity}</td>
                    <td><Status value={x.status} /> <button className="mini-btn">{openShipment===x.id?"Kapat":"Detayı gör"}</button></td>
                  </tr>
                  {openShipment===x.id&&<tr className="shipment-detail-row"><td colSpan={5}>{shipmentDetail?<div className="shipment-detail-box"><div><span><small>Teslimat adresi</small><b>{shipmentDetail.shipment.deliveryAddress}</b></span><span><small>Araç / şoför</small><b>{shipmentDetail.shipment.vehiclePlate||"Atanmadı"} · {shipmentDetail.shipment.driverName||"Atanmadı"}</b></span><span><small>İrsaliye</small><b>{shipmentDetail.shipment.dispatchNumber||"Henüz düzenlenmedi"}</b></span><span><small>Teslim alan</small><b>{shipmentDetail.shipment.recipientName||"Henüz teslim edilmedi"}</b></span></div><table><thead><tr><th>Ürün</th><th>Sevk miktarı</th></tr></thead><tbody>{shipmentDetail.items.map(item=><tr key={item.code}><td><b>{item.name}</b><small>{item.code}</small></td><td>{item.quantity} {item.unit}</td></tr>)}</tbody></table></div>:"Yükleniyor…"}</td></tr>}
                  </Fragment>
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
        eyebrow="SİPARİŞ YÖNETİMİ"
        title="Siparişler"
        description="Taslak, onay bekleyen ve tamamlanan siparişleri takip edin."
        action={
          (user.role === "SALES" || user.role === "ADMIN") && (
            <NavLink className="primary-btn" to="/satislar/yeni">
              <Plus />
              Yeni sipariş
            </NavLink>
          )
        }
      />
      <ScreenGuide title="Siparişin hangi aşamada olduğunu kontrol edin." steps={["Sipariş numarasına tıklayarak ürün ve ödeme detayını açın.","Taslak sipariş hazırsa Onaya gönder düğmesine basın.","Onaylanan sipariş için sevkiyat ve tahsilat ekranlarından devam edin."]}/>
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
            <th>Sipariş</th>
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
                  <NavLink className="sale-detail-link" to={`/satislar/${s.id}`}>{s.number}</NavLink>
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
                      <><NavLink className="mini-btn" to={`/satislar/${s.id}/duzenle`}>Düzenle</NavLink><button className="mini-btn" onClick={() => action(s.id)}>
                        Onaya gönder
                      </button></>
                    )}
                  </td>
                )}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6}>
                <EmptyInline text="Henüz sipariş kaydı yok." />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SaleDetail(){
  type Detail={sale:{id:number;number:string;status:string;paymentMethod:string;subtotal:number;vatTotal:number;grandTotal:number;downPayment:number;advanceAmount:number;note?:string;currency:string;exchangeRate:number;createdAt:string;customerId:number;customerCode:string;customerName:string;createdBy:string;approvalAssignee?:string};items:{id:number;code:string;name:string;unit:string;quantity:number;unitPrice:number;vatRate:number;lineTotal:number}[];schedule:{sequenceNo:number;paymentType:string;dueDate:string;amount:number;paidAmount:number;currency:string;status:string}[];shipments:{id:number;number:string;status:string;plannedDate:string;actualDate?:string;dispatchNumber?:string}[]};
  const{id}=useParams();const[data,setData]=useState<Detail|null>(null);useEffect(()=>{api<Detail>(`/sales/${id}/detail`).then(setData)},[id]);if(!data)return <div className="loading">Sipariş detayı hazırlanıyor…</div>;const s=data.sale;
  return <><PageHead eyebrow={`${s.customerCode} · ${s.number}`} title={s.customerName} description={`${formatDate(s.createdAt)} tarihinde ${s.createdBy} tarafından oluşturuldu.`}/><div className="sale-detail-grid"><section className="panel"><PanelTitle title="Satılan ürünler"/><div className="table-wrap"><table><thead><tr><th>Ürün</th><th>Miktar</th><th>Birim fiyat</th><th>KDV</th><th>Satır toplamı</th></tr></thead><tbody>{data.items.map(x=><tr key={x.id}><td><b>{x.name}</b><small>{x.code}</small></td><td>{x.quantity} {x.unit}</td><td>{money(x.unitPrice,s.currency)}</td><td>%{x.vatRate}</td><td className="amount">{money(x.lineTotal,s.currency)}</td></tr>)}</tbody></table></div></section><aside className="panel sale-financial-summary"><PanelTitle title="Finansal özet"/><p><span>Ara toplam</span><b>{money(s.subtotal,s.currency)}</b></p><p><span>KDV</span><b>{money(s.vatTotal,s.currency)}</b></p><p className="grand"><span>Genel toplam</span><b>{money(s.grandTotal,s.currency)}</b></p><p><span>Yeni peşinat</span><b>{money(s.downPayment,s.currency)}</b></p><p><span>Cari avansından mahsup</span><b>{money(s.advanceAmount,s.currency)}</b></p><p><span>Sipariş notu</span><b>{s.note||"—"}</b></p><p><span>Ödeme şekli</span><b>{paymentTypeLabel(s.paymentMethod)}</b></p><p><span>Onay yetkilisi</span><b>{s.approvalAssignee||"Belirlenmedi"}</b></p><Status value={s.status}/></aside></div><section className="panel sale-schedule"><PanelTitle title="Ödeme ve vade planı"/><div className="compact-list">{data.schedule.map(x=><div key={x.sequenceNo}><span><b>{x.sequenceNo}. ödeme · {paymentTypeLabel(x.paymentType)}</b><small>{dateOnly(x.dueDate)}</small></span><strong>{money(x.amount,x.currency)}<small>{x.paidAmount?`${money(x.paidAmount,x.currency)} ödendi`:"Ödeme bekleniyor"}</small></strong><Status value={x.status}/></div>)}</div></section></>;
}

function CatalogPager({page,total,pageSize,onChange}:{page:number;total:number;pageSize:number;onChange:(page:number)=>void}) {
  const pages=Math.max(1,Math.ceil(total/pageSize));
  return <nav className="catalog-pager" aria-label="Ürün sayfaları"><span>{total?`${(page-1)*pageSize+1}–${Math.min(page*pageSize,total)} / ${total} ürün`:"0 ürün"}</span><div><button type="button" className="mini-btn" disabled={page<=1} onClick={()=>onChange(page-1)}>Önceki</button><b aria-live="polite">{page} / {pages}</b><button type="button" className="mini-btn" disabled={page>=pages} onClick={()=>onChange(page+1)}>Sonraki</button></div></nav>;
}

const partCategoryLabels:Record<string,string>={STANDARD:"Standart parça",READY:"Hazır parça",SEMI_FINISHED:"Yarı mamul",OTHER:"Diğer parça"};
function SpareParts({user}:{user:User}) {
  const [products,setProducts]=useState<Product[]>([]);
  const [orders,setOrders]=useState<Sale[]>([]);
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(1);
  const [category,setCategory]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [showForm,setShowForm]=useState(false);
  const [part,setPart]=useState({code:"",name:"",partCategory:"STANDARD",unit:"Adet",unitPrice:0,vatRate:20,stockQuantity:0});
  const load=useCallback(()=>Promise.all([api<Product[]>("/products"),api<Sale[]>("/sales")]).then(([p,s])=>{setProducts(p.filter(x=>x.partCategory!=="MACHINE"));setOrders(s.filter(x=>x.orderKind==="SPARE_PART"));}),[]);
  useEffect(()=>{load().catch(e=>setError(e.message));},[load]);
  const filteredProducts=products.filter(p=>(!category||p.partCategory===category)&&`${p.code} ${p.name}`.toLocaleLowerCase("tr").includes(search.trim().toLocaleLowerCase("tr")));
  const currentPage=Math.min(page,Math.max(1,Math.ceil(filteredProducts.length/10)));
  const visibleProducts=filteredProducts.slice((currentPage-1)*10,currentPage*10);
  const canWrite=["SALES","ADMIN"].includes(user.role);
  const submit=async(id:number)=>{try{await api(`/sales/${id}/submit`,{method:"POST"});await load();}catch(e){setError((e as Error).message);}};
  const save=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError("");try{await api("/products/parts",{method:"POST",body:JSON.stringify(part)});setShowForm(false);setPart({...part,code:"",name:""});await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  return <><PageHead eyebrow="PARÇA VE SİPARİŞ" title="Yedek Parçalar" description="Cari siparişlerini oluşturun, onaya gönderin ve sevkiyat akışında takip edin." action={canWrite?<NavLink className="primary-btn" to="/yedek-parcalar/yeni"><Plus/>Yeni parça siparişi</NavLink>:undefined}/>
    <div className="receipt-context general"><b>Parça kaynağı: yerel kayıt</b><span>Harici API bağlantısı henüz kurulmadı. Standart parça, hazır parça ve yarı mamul kayıtları daha sonra kaynak sistem ile eşleştirilebilir.</span></div>
    {error&&<div className="error-box">{error}</div>}
    <section className="panel"><PanelTitle title="Parça kataloğu"/>
      <div className="form-grid"><label className="field"><span>Parça ara</span><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Kod veya ad"/></label><label className="field"><span>Tür</span><select value={category} onChange={e=>{setCategory(e.target.value);setPage(1);}}><option value="">Tüm parçalar</option>{Object.entries(partCategoryLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>{canWrite&&<button className="mini-btn" onClick={()=>setShowForm(!showForm)}>Yerel parça ekle</button>}</div>
      {showForm&&<form onSubmit={save} className="form-grid">{(["code","name","unit"] as const).map(k=><label className="field" key={k}><span>{{code:"Parça kodu",name:"Parça adı",unit:"Birim"}[k]}</span><input required value={part[k]} onChange={e=>setPart({...part,[k]:e.target.value})}/></label>)}<label className="field"><span>Parça türü</span><select value={part.partCategory} onChange={e=>setPart({...part,partCategory:e.target.value})}>{Object.entries(partCategoryLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>{(["unitPrice","vatRate","stockQuantity"] as const).map(k=><label className="field" key={k}><span>{{unitPrice:"Birim fiyat (TL)",vatRate:"KDV (%)",stockQuantity:"Stok miktarı"}[k]}</span><input required type="number" min="0" max={k==="vatRate"?100:undefined} step="0.01" value={part[k]} onChange={e=>setPart({...part,[k]:Number(e.target.value)})}/></label>)}<button className="primary-btn" disabled={busy}>{busy?"Kaydediliyor…":"Parçayı kaydet"}</button></form>}
      <div className="table-wrap"><table><thead><tr><th>Kod / Parça</th><th>Tür</th><th>Stok</th><th>Birim fiyat</th></tr></thead><tbody>{visibleProducts.map(p=><tr key={p.id}><td><b>{p.name}</b><small>{p.code}</small></td><td>{partCategoryLabels[p.partCategory]}</td><td>{p.stockQuantity} {p.unit}</td><td>{money(p.unitPrice)}</td></tr>)}{!filteredProducts.length&&<tr><td colSpan={4}>{products.length?"Aramanıza uygun parça bulunamadı.":"Henüz parça kaydı yok."}</td></tr>}</tbody></table></div>
      <CatalogPager page={currentPage} total={filteredProducts.length} pageSize={10} onChange={setPage}/>
    </section><section className="panel"><PanelTitle title="Carilerin yedek parça siparişleri"/><SaleTable sales={orders} action={canWrite?submit:undefined}/></section></>;
}

function NewSale({spare=false}:{spare?:boolean}) {
  const {id:editId}=useParams();
  const [productSearch,setProductSearch]=useState("");
  const [productPage,setProductPage]=useState(1);
  const [productGroup,setProductGroup]=useState("");
  const [productSubgroup,setProductSubgroup]=useState("");
  const [searchParams]=useSearchParams();
  const [orderKind,setOrderKind]=useState(spare?"SPARE_PART":"MACHINE");
  const [advanceAmount,setAdvanceAmount]=useState(0);
  const [note,setNote]=useState("");
  type Assignee={id:number;name:string;email:string};
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
  const [assignees,setAssignees]=useState<Assignee[]>([]);
  const [approvalAssigneeId,setApprovalAssigneeId]=useState(0);
  const [customerId, setCustomerId] = useState(()=>Number(searchParams.get("customerId"))||0);
  const [lines, setLines] = useState<
    { productId: number; quantity: number; unitPrice: number; vatRate: number }[]
  >([]);
  const [payment, setPayment] = useState("TERM");
  const [down, setDown] = useState(0);
  const [currency, setCurrency] = useState("TRY");
  const [exchangeRate, setExchangeRate] = useState(1);
  const [instrumentType, setInstrumentType] = useState("CHECK");
  const [instrumentCount, setInstrumentCount] = useState(1);
  const [termInstallmentCount, setTermInstallmentCount] = useState(1);
  const [paymentSchedule, setPaymentSchedule] = useState([
    { dueDate: addDaysToToday(30), amount: 0 },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      api<Customer[]>("/customers"),
      api<Product[]>("/products"),
      api<Config>("/configuration"),
      api<Assignee[]>("/approval-assignees"),
    ]).then(([c, p, conf, approvers]) => {
      setCustomers(c);
      setProducts(p);
      setConfig(conf);
      setAssignees(approvers);setApprovalAssigneeId(approvers[0]?.id||0);
      if(editId) return api<{sale:{customerId:number;status:string;paymentMethod:string;downPayment:number;advanceAmount:number;currency:string;exchangeRate:number;approvalAssigneeId:number;instrumentType:string;orderKind:string;note:string};items:{productId:number;quantity:number;unitPrice:number;vatRate:number}[];schedule:{sequenceNo:number;dueDate:string;amount:number}[]}>(`/sales/${editId}/detail`).then(d=>{
        if(!["DRAFT","REVISION_REQUESTED"].includes(d.sale.status)) throw new Error("Bu sipariş düzenlenemez.");
        setCustomerId(d.sale.customerId);setPayment(d.sale.paymentMethod);setDown(d.sale.downPayment);setAdvanceAmount(d.sale.advanceAmount);setCurrency(d.sale.currency);setExchangeRate(d.sale.exchangeRate);setApprovalAssigneeId(d.sale.approvalAssigneeId||approvers[0]?.id||0);setInstrumentType(d.sale.instrumentType||"CHECK");setOrderKind(d.sale.orderKind);setNote(d.sale.note||"");setLines(d.items.map(({productId,quantity,unitPrice,vatRate})=>({productId,quantity,unitPrice,vatRate})));
        const plan=d.schedule.filter(x=>x.sequenceNo>0).map(({dueDate,amount})=>({dueDate,amount}));setPaymentSchedule(plan.length?plan:[{dueDate:addDaysToToday(30),amount:0}]);setInstrumentCount(plan.length||1);setTermInstallmentCount(plan.length||1);
      });
    }).catch(e=>setError(e.message));
  }, [editId]);
  const machineGroups=Array.from(new Set(products.filter(p=>p.partCategory==="MACHINE"&&p.productGroup).map(p=>p.productGroup!)));
  const activeProductGroup=productGroup||machineGroups[0]||"";
  const machineSubgroups=Array.from(new Set(products.filter(p=>p.partCategory==="MACHINE"&&p.productGroup===activeProductGroup&&p.productSubgroup).map(p=>p.productSubgroup!)));
  const activeProductSubgroup=productSubgroup&&machineSubgroups.includes(productSubgroup)?productSubgroup:machineSubgroups[0]||"";
  const normalizedProductSearch=productSearch.trim().toLocaleLowerCase("tr");
  const matchingProducts=products.filter(p=>{
    const correctKind=orderKind==="SPARE_PART"?p.partCategory!=="MACHINE":p.partCategory==="MACHINE";
    const correctGroup=orderKind==="SPARE_PART"||Boolean(normalizedProductSearch)||p.productGroup===activeProductGroup;
    const correctSubgroup=orderKind==="SPARE_PART"||Boolean(normalizedProductSearch)||!activeProductSubgroup||p.productSubgroup===activeProductSubgroup;
    const searchable=`${p.code} ${p.manufacturerModel||""} ${p.productGroup||""} ${p.productSubgroup||""} ${p.name}`.toLocaleLowerCase("tr");
    return correctKind&&correctGroup&&correctSubgroup&&searchable.includes(normalizedProductSearch);
  });
  const pickerPage=Math.min(productPage,Math.max(1,Math.ceil(matchingProducts.length/8)));
  const pickerProducts=matchingProducts.slice((pickerPage-1)*8,pickerPage*8);
  const customer = customers.find((c) => c.id === customerId);
  const detail = lines
    .map((l) => ({
      ...l,
      product: products.find((p) => p.id === l.productId)!,
    }))
    .filter((x) => x.product);
  const convertedPrice = (product: Product) =>
    currency === "TRY" ? product.unitPrice : product.unitPrice / exchangeRate;
  const subtotal = detail.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const total = detail.reduce(
    (s, l) =>
      s + Number((Number((l.unitPrice * l.quantity).toFixed(2)) * (1 + l.vatRate / 100)).toFixed(2)),
    0,
  );
  const availableAdvance = Math.max(0, -(customer?.balance || 0));
  const maxAdvance = exchangeRate > 0 ? Math.max(0, Math.min(Number((total-down).toFixed(2)), Math.floor(availableAdvance/exchangeRate*100)/100)) : 0;
  const remainingPayment = Number((total-down-advanceAmount).toFixed(2));
  const fullyFromAdvance = total > 0 && down === 0 && remainingPayment === 0 && advanceAmount > 0;
  const invalidAdvance = advanceAmount < 0 || advanceAmount > maxAdvance;
  const changeAdvance = (value: number) => {
    setAdvanceAmount(value);
    // Preserve custom multi-row plans; a single installment can track the remaining payment directly.
    setPaymentSchedule(rows => rows.length === 1 ? [{...rows[0],amount:Math.max(0,Number((total-down-value).toFixed(2)))}] : rows);
  };
  const addProduct = (id: number) => {
    const selectedProduct = products.find((p) => p.id === id)!;
    if (!lines.length) {
      const initialPrice = selectedProduct.manualPrice ? 0 : convertedPrice(selectedProduct);
      setPaymentSchedule((current) => [{
        ...current[0],
        amount: Number((initialPrice * (1 + selectedProduct.vatRate / 100)).toFixed(2)),
      }]);
    }
    setLines((v) => {
      const found = v.find((x) => x.productId === id);
      return found
        ? v.map((x) =>
            x.productId === id ? { ...x, quantity: x.quantity + 1 } : x,
          )
        : [
            ...v,
            {
              productId: id,
              quantity: 1,
              unitPrice: selectedProduct.manualPrice ? 0 : Number(convertedPrice(selectedProduct).toFixed(4)),
              vatRate: selectedProduct.vatRate,
            },
          ];
    });
  };
  const changeCurrency = (value: string) => {
    setCurrency(value);
    setExchangeRate(
      value === "TRY"
        ? 1
        : config.rates.find((r) => r.currency === value)?.rate || 1,
    );
  };
  const rebuildSchedule = (count: number) => {
    const safeCount = Math.max(1, Math.min(24, count));
    const remaining = Math.max(0, total - down - advanceAmount);
    const base = Math.floor((remaining / safeCount) * 100) / 100;
    setPaymentSchedule(
      Array.from({ length: safeCount }, (_, index) => ({
        dueDate:
          paymentSchedule[index]?.dueDate || addDaysToToday(30 * (index + 1)),
        amount:
          index === safeCount - 1
            ? Number((remaining - base * index).toFixed(2))
            : base,
      })),
    );
  };
  const planTotal = paymentSchedule.reduce((sum, row) => sum + row.amount, 0);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api(editId ? `/sales/${editId}` : "/sales", {
        method: editId ? "PUT" : "POST",
        body: JSON.stringify({
          customerId,
          orderKind,
          advanceAmount,
          paymentMethod: fullyFromAdvance ? "TERM" : payment,
          paymentTermDays: customer?.paymentTermDays || 30,
          downPayment: down,
          currency,
          exchangeRate,
          approvalAssigneeId:approvalAssigneeId||undefined,
          termInstallmentCount,
          instrumentType: !fullyFromAdvance && ["CHECK", "MIXED"].includes(payment)
            ? instrumentType
            : undefined,
          instrumentCount: !fullyFromAdvance && ["CHECK", "MIXED"].includes(payment)
            ? instrumentCount
            : 0,
          paymentSchedule: total-down-advanceAmount>0.01 && ["CHECK", "MIXED", "TERM"].includes(payment)
            ? paymentSchedule
            : undefined,
          note,
          items: lines,
        }),
      });
      navigate(orderKind==="SPARE_PART"?"/yedek-parcalar":"/satislar");
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
        title={editId ? "Sipariş formunu düzenle" : orderKind==="SPARE_PART" ? "Yedek parça siparişi oluştur" : "Ana mamul siparişi oluştur"}
        description="Müşteriyi ve ürünleri seçin; sipariş fiyatını ve esnek vade planını belirleyin."
      />
      <ScreenGuide title="Siparişi müşteri, ürün ve ödeme sırasıyla hazırlayın." steps={["Müşteriyi seçip bakiye ve risk bilgisini kontrol edin.","Ürünleri ekleyin; miktar, birim fiyat ve KDV oranını doğrulayın.","Peşinat ile vade planını düzenleyip doğru yetkiliye gönderilecek taslağı oluşturun."]} note="Peşinat toplam sipariş tutarını aşamaz. Her vade tarihi ve tutarı gerektiğinde ayrı ayrı değiştirilebilir."/>
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
              <h2>Sipariş türü ve ürün seçimi</h2>
              <div className="choice-grid" role="group" aria-label="Sipariş türü">
                {([["MACHINE","Ana mamul"],["SPARE_PART","Yedek parça"]] as const).map(([kind,label])=><label key={kind} className={orderKind===kind?"selected":""}><input type="radio" name="orderKind" value={kind} checked={orderKind===kind} disabled={lines.length>0&&orderKind!==kind} onChange={()=>{setOrderKind(kind);setProductSearch("");setProductGroup("");setProductSubgroup("");setProductPage(1);setAdvanceAmount(0);setDown(0);setPaymentSchedule([{dueDate:addDaysToToday(30),amount:0}]);setInstrumentCount(1);setTermInstallmentCount(1);}}/><span>{label}</span><CheckCircle2/></label>)}
              </div>
              <p>{orderKind==="MACHINE"?"Önce ürün ailesini, ardından satılacak modeli seçin. Ana mamul fiyatı siparişte elle girilir ve KDV otomatik %10 hesaplanır.":"Yedek parçalar: standart parça, hazır parça, yarı mamul ve diğer parçalar."}{lines.length>0&&" Sipariş türünü değiştirmek için önce eklenen ürünleri kaldırın."}</p>
              {orderKind==="MACHINE"&&<><div className="machine-groups" role="group" aria-label="Ürün ailesi">{machineGroups.map(group=><button type="button" className={activeProductGroup===group&&!normalizedProductSearch?"active":""} onClick={()=>{setProductGroup(group);setProductSubgroup("");setProductSearch("");setProductPage(1);}} key={group}>{group}<small>{products.filter(p=>p.partCategory==="MACHINE"&&p.productGroup===group).length} model</small></button>)}</div>{machineSubgroups.length>0&&<div className="machine-subgroups" role="group" aria-label={`${activeProductGroup} alt grupları`}><b>Römork alt grubu</b><div>{machineSubgroups.map(subgroup=><button type="button" className={activeProductSubgroup===subgroup&&!normalizedProductSearch?"active":""} onClick={()=>{setProductSubgroup(subgroup);setProductSearch("");setProductPage(1);}} key={subgroup}>{subgroup}<small>{products.filter(p=>p.productSubgroup===subgroup).length} model</small></button>)}</div></div>}</>}
              <label className="field catalog-search"><span>{orderKind==="MACHINE"?"Model ara":"Ürün / parça ara"}</span><input value={productSearch} onChange={e=>{setProductSearch(e.target.value);setProductPage(1);}} placeholder={orderKind==="MACHINE"?"Model adı veya katalog modeli…":"Kod, parça veya ürün adı…"}/></label>
              <div className="product-picker">
                {pickerProducts.map((p) => (
                  <button
                    type="button"
                    onClick={() => addProduct(p.id)}
                    key={p.id}
                  >
                    <span>
                      <b>{p.name}</b>
                      <small>
                        {p.partCategory==="MACHINE"?`${p.manufacturerModel||"Model bilgisi bekleniyor"} · ${p.productSubgroup||p.productGroup}`:`${p.code} · Stok ${p.stockQuantity}`}
                      </small>
                    </span>
                    <strong>
                      {p.manualPrice?"Fiyatı siparişte gir":money(convertedPrice(p), currency)}
                      <Plus />
                    </strong>
                  </button>
                ))}
              </div>
              {!matchingProducts.length&&<EmptyInline text="Aramanıza uygun ürün bulunamadı."/>}
              <CatalogPager page={pickerPage} total={matchingProducts.length} pageSize={8} onChange={setProductPage}/>
              {detail.length > 0 && (
                <div className="selected-lines">
                  {detail.map((l) => (
                    <div key={l.productId}>
                      <span>
                        <b>{l.product.name}</b>
                        <small>
                          {l.product.partCategory==="MACHINE"?`${l.product.manufacturerModel||"Model"} · ${l.product.productGroup}${l.product.productSubgroup?` / ${l.product.productSubgroup}`:""}`:l.product.code}
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
                          max={l.product.stockTracking?l.product.stockQuantity:undefined}
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
                      <label className="field line-field">
                        <span>Birim fiyat ({currency})</span>
                        <input
                          type="number"
                          required
                          min="0.01"
                          step="0.01"
                          value={l.unitPrice||""}
                          placeholder="Fiyat girin"
                          onChange={(e) =>
                            setLines((v) =>
                              v.map((x) =>
                                x.productId === l.productId
                                  ? { ...x, unitPrice: Number(e.target.value) }
                                  : x,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="field line-field vat-field">
                        <span>KDV oranı (%)</span>
                        <input
                          type="number"
                          required
                          min="0"
                          max="100"
                          step="0.01"
                          value={l.vatRate}
                          readOnly={l.product.partCategory==="MACHINE"}
                          onChange={(e) =>
                            setLines((v) =>
                              v.map((x) =>
                                x.productId === l.productId
                                  ? { ...x, vatRate: Number(e.target.value) }
                                  : x,
                              ),
                            )
                          }
                        />
                      </label>
                      <strong>
                        {money(
                          l.unitPrice * l.quantity * (1 + l.vatRate / 100),
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
              <p>Siparişte kullanılacak avansı belirleyin; yalnızca kalan tutar için ödeme planı oluşturun.</p>
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
              <section className="order-advance-box">
                <div className="order-advance-heading"><div><h3>Avans hesabından düş</h3><p>Nakit, havale veya teslim alınmış çeklerden oluşan net cari alacak kullanılabilir.</p></div><strong>{money(availableAdvance)}<small>Kullanılabilir avans · TL</small></strong></div>
                <label className="field"><span>Siparişte kullanılacak avans ({currency})</span><input type="number" min="0" step="0.01" max={maxAdvance} value={advanceAmount} onChange={e=>changeAdvance(Number(e.target.value))}/></label>
                <div className="head-actions"><button type="button" className="mini-btn" disabled={!customerId||maxAdvance<=0} onClick={()=>changeAdvance(maxAdvance)}>Kullanılabilecek en yüksek tutarı uygula</button><button type="button" className="mini-btn" disabled={!advanceAmount} onClick={()=>changeAdvance(0)}>Avans kullanma</button></div>
                {invalidAdvance&&<div className="error-box" role="alert">Bu siparişte en fazla {money(maxAdvance,currency)} avans kullanabilirsiniz.</div>}
                <div className="order-advance-totals"><div><span>Avanstan düşülecek</span><b>{money(advanceAmount,currency)}</b>{currency!=="TRY"&&<small>{money(advanceAmount*exchangeRate)} karşılığı</small>}</div><div><span>Onay sonrası kalan avans (tahmini)</span><b>{money(Math.max(0,availableAdvance-advanceAmount*exchangeRate))}</b></div><div><span>Sipariş için kalan ödeme</span><b>{money(Math.max(0,remainingPayment),currency)}</b></div></div>
                <small>Düşüm sipariş onaylandığında gerçekleşir. Önceden teslim alınmış çekler için yeniden çek kaydı oluşturulmaz. Bakiye onay sırasında tekrar kontrol edilir.</small>
              </section>
              <label className="field order-note"><span>Sipariş notu</span><textarea maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label>
              {fullyFromAdvance?<div className="advance-covered"><CheckCircle2/><div><b>Siparişin tamamı avanstan karşılanıyor</b><p>Yeni tahsilat, taksit veya çek planı oluşturulmayacak.</p></div></div>:<>
              <h3>Kalan tutarın ödeme şekli</h3>
              <div className="choice-grid">
                {[
                  ["CASH", advanceAmount>0?"Kalan tutar peşin":"Tamamı peşin"],
                  ["TERM", `${customer?.paymentTermDays || 30} gün vadeli`],
                  ["CHECK", "Yeni çek / senet"],
                  ["MIXED", "Peşinat + evrak"],
                ].map(([v, l]) => (
                  <label className={payment === v ? "selected" : ""} key={v}>
                    <input
                      type="radio"
                      name="payment"
                      value={v}
                      checked={payment === v}
                      onChange={() => {setPayment(v);if(v!=="MIXED")setDown(0);}}
                    />
                    <span>{l}</span>
                    <CheckCircle2 />
                  </label>
                ))}
              </div>
              {payment === "TERM" && total-down-advanceAmount>0.01 && (
                <>
                  <div className="instrument-plan">
                    <label className="field">
                      <span>Taksit adedi</span>
                      <input
                        type="number"
                        min="1"
                        max="24"
                        value={termInstallmentCount}
                        onChange={(e) => { const count=Number(e.target.value); setTermInstallmentCount(count); rebuildSchedule(count); }}
                      />
                    </label>
                    <button type="button" className="mini-btn" onClick={() => rebuildSchedule(termInstallmentCount)}>Tutarları eşit dağıt</button>
                  </div>
                  <EditablePaymentPlan
                    rows={paymentSchedule}
                    setRows={setPaymentSchedule}
                    total={Math.max(0,total - down - advanceAmount)}
                    currency={currency}
                  />
                </>
              )}
              {payment === "MIXED" && (
                <><label className="field compact">
                  <span>Peşinat tutarı</span>
                  <input
                    type="number"
                    min="0"
                    max={total}
                      value={down}
                    onChange={(e) => setDown(Number(e.target.value))}
                  />
                </label>{down>total&&<div className="error-box inline-warning">Peşinat genel toplamdan büyük olamaz. En fazla {money(total,currency)} girebilirsiniz.</div>}</>
              )}
              {["CHECK", "MIXED"].includes(payment) && total-down-advanceAmount>0.01 && (
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
                      onChange={(e) => { const count=Number(e.target.value); setInstrumentCount(count); rebuildSchedule(count); }}
                      />
                  </label>
                  <button type="button" className="mini-btn" onClick={() => rebuildSchedule(instrumentCount)}>Tutarları eşit dağıt</button>
                </div>
              )}{" "}
              {["CHECK", "MIXED"].includes(payment) && total-down-advanceAmount>0.01 && (
                <EditablePaymentPlan
                  rows={paymentSchedule}
                  setRows={setPaymentSchedule}
                  total={Math.max(0,total - down - advanceAmount)}
                  currency={currency}
                />
              )}
              </>}
              <label className="field approval-picker"><span>Onaya gönderilecek yetkili</span><select required value={approvalAssigneeId} onChange={e=>setApprovalAssigneeId(Number(e.target.value))}><option value="">Yetkili seçin…</option>{assignees.map(x=><option key={x.id} value={x.id}>{x.name} · {x.email}</option>)}</select><small>Sipariş hazır olduğunda onay görevi seçtiğiniz yöneticiye gönderilir.</small></label>
            </div>
          </section>
        </div>
        <aside className="summary-card">
          <span className="eyebrow">SİPARİŞ ÖZETİ</span>
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
          <div><span>Cari avansından mahsup</span><b>− {money(advanceAmount,currency)}</b></div>
          <div>
            <span>Kalan ödeme</span>
            <b>{money(Math.max(0,total - down - advanceAmount), currency)}</b>
          </div>
          {currency !== "TRY" && (
            <div>
              <span>TL karşılığı</span>
              <b>{money(total * exchangeRate)}</b>
            </div>
          )}
          <button
            className="primary-btn full"
            disabled={busy || invalidAdvance || !customerId || !lines.length || !approvalAssigneeId || down+advanceAmount>total || advanceAmount<0 || advanceAmount*exchangeRate>Math.max(0,-(customer?.balance||0))+0.01 || (["TERM","CHECK","MIXED"].includes(payment) && total-down-advanceAmount>0.01 && Math.abs(planTotal-(total-down-advanceAmount))>0.01)}
          >
            {busy ? "Kaydediliyor…" : editId ? "Değişiklikleri kaydet" : "Taslağı oluştur"}
            <ChevronRight />
          </button>
          <small>
            Kaydettikten sonra siparişler ekranından yönetici onayına
            gönderebilirsiniz.
          </small>
        </aside>
      </div>
    </form>
  );
}

function EditablePaymentPlan({
  rows,
  setRows,
  total,
  currency,
}: {
  rows: { dueDate: string; amount: number }[];
  setRows: Dispatch<SetStateAction<{ dueDate: string; amount: number }[]>>;
  total: number;
  currency: string;
}) {
  const entered = rows.reduce((sum, row) => sum + row.amount, 0);
  const valid = Math.abs(entered - total) <= 0.01;
  return (
    <div className="payment-preview">
      <b>Her vade tarihini ve tutarını ayrı ayrı belirleyin</b>
      {rows.map((row, index) => (
          <span key={index}>
            <i>{index + 1}</i>
            <input type="date" value={row.dueDate} onChange={(e)=>setRows((current)=>current.map((x,i)=>i===index?{...x,dueDate:e.target.value}:x))}/>
            <input type="number" min="0.01" step="0.01" value={row.amount} onChange={(e)=>setRows((current)=>current.map((x,i)=>i===index?{...x,amount:Number(e.target.value)}:x))}/>
          </span>
      ))}
      <div className={valid?"plan-total valid":"plan-total invalid"}><span>Plan toplamı</span><b>{money(entered,currency)} / {money(total,currency)}</b></div>
    </div>
  );
}

function addDaysToToday(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
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
      <ScreenGuide title="Karar vermeden önce üç bilgiyi kontrol edin." steps={["Sipariş tutarını ve müşterinin mevcut bakiyesini karşılaştırın.","Sipariş sonrası risk, limitin üzerindeyse nedeni inceleyin.","Onaylayın; eksik varsa açıklama yazıp düzeltme isteyin veya reddedin."]} note="Denetçi kullanıcı yalnızca kayıtları görür; kararı yönetici verir."/>
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
                  <NavLink className="mini-btn" to={`/onaylar/siparis/${a.saleId}`}>Sipariş içeriğini ve ödeme planını gör</NavLink>
                  <div className="risk-bar">
                    <span>
                      <b>Mevcut bakiye</b>
                      {money(a.balance)}
                    </span>
                    <ChevronRight />
                    <span>
                      <b>Sipariş sonrası TL risk</b>
                      {money(a.balance + a.grandTotal * a.exchangeRate)}
                    </span>
                    <span
                      className={
                        a.balance + a.grandTotal * a.exchangeRate > a.riskLimit
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

function Receipts({ user, advanceOnly=false }: { user: User; advanceOnly?:boolean }) {
  const [searchParams]=useSearchParams();
  const [saving,setSaving]=useState(false);
  const [advanceRefresh,setAdvanceRefresh]=useState(0);
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
  const [customerId, setCustomerId] = useState(()=>Number(searchParams.get("customerId"))||0);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [message, setMessage] = useState("");
  const [currency, setCurrency] = useState("TRY");
  const [rate, setRate] = useState(1);
  const [receiptMode,setReceiptMode]=useState<"SCHEDULE"|"INSTRUMENT"|"GENERAL">(advanceOnly?"GENERAL":"SCHEDULE");
  const [scheduleId,setScheduleId]=useState(0);
  const [receiptAmount,setReceiptAmount]=useState("");
  const [receiptMethod,setReceiptMethod]=useState("BANK_TRANSFER");
  const [generalCheck,setGeneralCheck]=useState({issuer:"",serialNumber:"",bankName:"",issueDate:new Date().toISOString().slice(0,10),dueDate:addDaysToToday(30)});
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
    if(saving)return;
    const form=e.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setSaving(true);
    try {
      const selected=ledger?.schedules.find(x=>x.id===scheduleId);
      const result = receiptMode==="INSTRUMENT"&&selected?.instrumentId?await api<{message:string}>(`/instruments/${selected.instrumentId}/movements`,{method:"POST",body:JSON.stringify({status:"COLLECTED",movementDate:values.receiptDate,exchangeRate:currency==="TRY"?1:rate})}):receiptMode==="GENERAL"&&receiptMethod==="CHECK"?await api<{message:string}>("/instruments/intake",{method:"POST",body:JSON.stringify({customerId,amount:Number(receiptAmount),currency,exchangeRate:rate,...generalCheck,note:values.note})}):await api<{ message: string }>("/receipts", {
        method: "POST",
        body: JSON.stringify({
          customerId,
          paymentScheduleId:receiptMode==="SCHEDULE"?scheduleId:undefined,
          method: receiptMethod,
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
      form.reset();
      setScheduleId(0);setReceiptAmount("");
    } catch (err) {
      setMessage((err as Error).message);
    } finally { setSaving(false); }
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
        title={advanceOnly?"Avanslar ve bağlantı ödemeleri":"Cari hesap ve tahsilat"}
        description={advanceOnly?"Sipariş belli olmadan alınan ödemeyi kaydedin; kalan avansı takip edip siparişlerde kullanın.":"Müşteri ekstresini inceleyin; nakit veya banka tahsilatını doğrudan cariye işleyin."}
        action={
          ["ADMIN", "ACCOUNTING"].includes(user.role) && (
            <button className="mini-btn" onClick={tcmb}>
              TCMB kurlarını güncelle
            </button>
          )
        }
      />
      {advanceOnly?<ScreenGuide title="Avansı girin, sipariş geldikçe kullanın." steps={["Cariyi seçip sağdaki Avans girişi formuna tutar, tarih ve ödeme yöntemini yazın.","Avansı kaydedin; kullanılabilir tutar güncellensin.","Makine veya parça siparişi açıp Cari avansından kullanılacak tutarı girin."]} note="Düşüm sipariş onaylandığında gerçekleşir. Mevcut borçlar alınan ödemeden önce kapanır; kalan net alacak avans olarak kullanılabilir."/>:(<ScreenGuide title="Ödemeyi doğru cariye ve doğru vadeye işleyin." steps={["Ödeme yapan müşteriyi seçin.","Listeden kapanacak vadeyi seçin; listede yoksa Vadeden bağımsız ödeme kullanın.","Tutarı, ödeme şeklini ve tarihi kontrol edip tahsilatı kaydedin."]} note="Müşteriden fiziksel çek aldıysanız çek bilgilerini girin; çekin bankada tahsili daha sonra Çek ve Senetler ekranından tamamlanır."/>)}

      {message && <Toast text={message} close={() => setMessage("")} />}
      <section className="panel ledger-selector">
        <label className="field">
          <span>Müşteri</span>
          <select
            value={customerId}
            onChange={(e) => {setLedger(null);setCustomerId(Number(e.target.value));setScheduleId(0);setReceiptAmount("");setReceiptMode(advanceOnly?"GENERAL":"SCHEDULE");}}
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
      {!advanceOnly&&ledger&&<section className="due-picker panel"><div className="due-picker-head"><div><span className="eyebrow">AÇIK VADELER</span><h2>Hangi ödemeyi tahsil ediyorsunuz?</h2><p>Normal taksit, çek ve senetlerin tamamı burada görünür. Vadesi gelmemiş evrak da erken tahsil edilebilir.</p></div><button className={receiptMode==="GENERAL"?"mini-btn active":"mini-btn"} onClick={()=>{setReceiptMode("GENERAL");setScheduleId(0);setReceiptAmount("")}}>Vadeden bağımsız ödeme</button></div><div className="due-options">{ledger.schedules.map(x=>{const overdue=x.dueDate<new Date().toISOString().slice(0,10);const instrument=["CHECK","PROMISSORY_NOTE"].includes(x.paymentType);return <button key={x.id} className={`${scheduleId===x.id&&receiptMode!=="GENERAL"?"selected":""} ${overdue?"overdue":""}`} onClick={()=>chooseSchedule(x.id)}><span><b>{x.saleNumber} · {paymentTypeLabel(x.paymentType)}</b><small>{overdue?"Vadesi geçti":x.dueDate>new Date().toISOString().slice(0,10)&&instrument?"Erken tahsil edilebilir":"Vade"} · {dateOnly(x.dueDate)}</small>{instrument&&<small>{x.instrumentNumber||"Evrak hazırlanıyor"}</small>}</span><strong>{money(x.remainingAmount,x.currency)}<small>{x.paidAmount>0?`${money(x.paidAmount,x.currency)} ödendi`:instrument?"Evrak tutarı":"Kalan taksit"}</small></strong></button>})}{!ledger.schedules.length&&<EmptyInline text="Bu müşterinin açık taksit, çek veya senedi bulunmuyor. Serbest tahsilat kullanabilirsiniz."/>}</div></section>}
      {advanceOnly&&ledger&&<section className="panel advance-panel"><div className="advance-balance"><span>Kullanılabilir avans</span><strong>{money(Math.max(0,-ledger.customer.balance))}</strong><small>Mevcut borçlardan sonra kalan net cari alacak</small></div><div className="head-actions">{user.permissions?.includes("SALES")&&<><NavLink className="primary-btn" to={`/satislar/yeni?customerId=${customerId}`}>Makine siparişinde kullan</NavLink><NavLink className="mini-btn" to={`/yedek-parcalar/yeni?customerId=${customerId}`}>Parça siparişinde kullan</NavLink></>}<NavLink className="mini-btn" to={`/musteriler/${customerId}`}>Cari detayına dön</NavLink></div>{!["ADMIN","ACCOUNTING"].includes(user.role)&&<p>Avans girişi için muhasebe veya yönetici yetkisi gerekir. Bu ekranda bakiye ve hareketleri inceleyebilirsiniz.</p>}</section>}
      {advanceOnly&&ledger&&<CheckAdvanceHistory key={customerId} customerId={customerId} refresh={advanceRefresh}/>}
      {ledger && (
        <div className={`detail-grid ledger-layout ${advanceOnly&&receiptMethod==="CHECK"?"check-advance-layout":""}`}>
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
            advanceOnly&&receiptMethod==="CHECK"?<CheckAdvanceForm key={customerId} customerId={customerId} onSaved={message=>{setMessage(message);load();setAdvanceRefresh(v=>v+1);}} onCancel={()=>setReceiptMethod("BANK_TRANSFER")}/>:<form className="panel receipt-form" onSubmit={receipt}>
              <PanelTitle title={advanceOnly?"Avans girişi":receiptMode==="INSTRUMENT"?"Çek / senet tahsil et":receiptMode==="SCHEDULE"?"Seçili vadeyi tahsil et":"Vadeden bağımsız tahsilat"} />
              {receiptMode!=="GENERAL"?<div className="receipt-context">{selectedSchedule?<><small>{receiptMode==="INSTRUMENT"?"TAHSİL EDİLEN EVRAK":"TAHSİL EDİLEN VADE"}</small><b>{selectedSchedule.saleNumber} · {dateOnly(selectedSchedule.dueDate)}</b><span>Kalan: {money(selectedSchedule.remainingAmount,selectedSchedule.currency)}</span>{instrumentIncomplete&&<><span className="danger-text">Tahsilattan önce keşideci/borçlu, seri no ve banka bilgisi tamamlanmalıdır.</span><NavLink className="mini-btn" to="/kiymetli-evrak">Kıymetli Evrakta tamamla</NavLink></>}</>:<p>Yukarıdaki açık vadelerden birini seçin.</p>}</div>:<div className="receipt-context general"><b>Genel cari ödemesi / yıllık bağlantı avansı</b><span>Sipariş belli olmadan alınan peşin ödemeyi burada kaydedin. Borcu aşan tutar cari alacak bakiyesi olur; sonraki makine ve yedek parça siparişlerinde kullanılabilir. Bağlantı yılı ve açıklamayı nota yazın.</span></div>}
              {receiptMode!=="INSTRUMENT"&&<label className="field">
                <span>Yöntem</span>
                <select name="method" value={receiptMethod} onChange={e=>setReceiptMethod(e.target.value)}>
                  <option value="BANK_TRANSFER">Havale / EFT</option>
                  <option value="CASH">Nakit</option>
                  <option value="CHECK">{advanceOnly?"Çek / birden fazla çek":"Çek"}</option>
                </select>
              </label>}
              {receiptMode==="GENERAL"&&receiptMethod==="CHECK"&&<div className="check-intake-fields">
                <div className="info-note"><b>Fiziksel çek teslim alınıyor</b><br/>Çek portföye girer ve müşteri carisi çek tutarı kadar azalır. Banka bakiyesi ancak çek tahsil edilince veya kırdırılınca artar.</div>
                <label className="field"><span>Keşideci</span><input required value={generalCheck.issuer} onChange={e=>setGeneralCheck({...generalCheck,issuer:e.target.value})}/></label>
                <label className="field"><span>Seri / çek no</span><input required value={generalCheck.serialNumber} onChange={e=>setGeneralCheck({...generalCheck,serialNumber:e.target.value})}/></label>
                <label className="field"><span>Banka</span><input required value={generalCheck.bankName} onChange={e=>setGeneralCheck({...generalCheck,bankName:e.target.value})}/></label>
                <label className="field"><span>Düzenleme tarihi</span><input required type="date" value={generalCheck.issueDate} onChange={e=>setGeneralCheck({...generalCheck,issueDate:e.target.value})}/></label>
                <label className="field"><span>Çek vadesi</span><input required type="date" value={generalCheck.dueDate} onChange={e=>setGeneralCheck({...generalCheck,dueDate:e.target.value})}/></label>
              </div>}
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
              {!(receiptMode==="GENERAL"&&receiptMethod==="CHECK")&&<label className="field">
                <span>Tahsilat tarihi</span>
                <input
                  required
                  name="receiptDate"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                />
              </label>}
              {!(receiptMode==="GENERAL"&&receiptMethod==="CHECK")&&<label className="field">
                <span>Dekont / referans</span>
                <input name="reference" />
              </label>}
              <label className="field">
                <span>{advanceOnly?"Bağlantı yılı / açıklama":"Not"}</span>
                <input name="note" maxLength={500} placeholder={advanceOnly?"Örn. 2026 yıllık bağlantı avansı":undefined} />
              </label>
              <button className="primary-btn full" disabled={saving||!receiptAmount||Number(receiptAmount)<=0||(receiptMode!=="GENERAL"&&!scheduleId)||!!instrumentIncomplete}>
                {saving?"Kaydediliyor…":advanceOnly?"Avansı cariye kaydet":receiptMode==="INSTRUMENT"?"Evrakı tahsil et":receiptMode==="SCHEDULE"?"Seçili vadeye tahsilat işle":receiptMethod==="CHECK"?"Çeki portföye al ve cariden düş":"Genel tahsilatı cariye işle"}
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
        description="Onaylı siparişlerden planlanan, yoldaki ve tamamlanan sevkiyatları takip edin."
        action={
          ["ADMIN", "SHIPPING"].includes(user.role) && (
            <NavLink className="primary-btn" to="/sevkiyatlar/yeni">
              <Plus />
              Yeni sevkiyat
            </NavLink>
          )
        }
      />
      <ScreenGuide title="Sevkiyatın mevcut durumunu ve sıradaki adımını takip edin." steps={["Kartı açarak gönderilecek ürünleri ve adresi kontrol edin.","Araç, şoför ve gerekiyorsa irsaliye numarasını girin.","Yalnızca gerçekleşen durumu seçip kaydedin."]} note="‘Henüz düzenlenmedi’ irsaliye numarasının daha girilmediğini gösterir; sevke çıkışta numara eklenir."/>
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
                  <b title="Ürün sevke çıkarken düzenlenecek sevk irsaliyesinin numarasıdır.">{item.dispatchNumber || "Henüz düzenlenmedi"}</b>
                  {!item.dispatchNumber&&<small>Sevke çıkışta numara girilecek</small>}
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
        description="Onaylı siparişi seçin; sistem yalnızca sevk edilmemiş miktarları getirsin."
      />
      <ScreenGuide title="Siparişten sevk edilecek miktarı oluşturun." steps={["Onaylanmış siparişi seçin.","Gönderilecek ürün miktarlarını kontrol edin; parçalı sevkiyatsa azaltın.","Tarih ve teslimat adresini yazıp sevkiyatı oluşturun."]}/>
      {error && <div className="error-box">{error}</div>}
      <div className="form-layout">
        <div className="form-main">
          <section className="panel form-section">
            <div className="section-number">1</div>
            <div className="section-content">
              <h2>Onaylı sipariş</h2>
              <p>Sevki bekleyen siparişler listelenir.</p>
              <label className="field">
                <span>Sipariş seçin</span>
                <select
                  required
                  value={saleId}
                  onChange={(e) => setSaleId(Number(e.target.value))}
                >
                  <option value="">Sipariş seçin…</option>
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
          <h3>{detail?.sale.customerName || "Sipariş seçilmedi"}</h3>
          <div>
            <span>Sipariş</span>
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
            Sipariş miktarından fazla sevkiyat sunucu tarafından engellenir.
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
  type Discount = { company: string; rate: number; pricingMethod:"DIRECT"|"ANNUAL"; commission:number; tax:number; fee: number; withRecourse:boolean; date: string; note: string };
  type Endorsement = { counterpartyCustomerId:number; settlementAmount:number; date:string; reference:string; note:string };
  type Config = { rates: { currency: string; rate: number }[] };
  const [items, setItems] = useState<Instrument[]>([]);
  const [customers,setCustomers]=useState<Customer[]>([]);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("ACTION");
  const [openId,setOpenId]=useState<number|null>(null);
  const [activeAction,setActiveAction]=useState<Record<number,"COLLECT"|"DISCOUNT"|"ENDORSE"|"OTHER"|null>>({});
  const [helpOpen,setHelpOpen]=useState(true);
  const [states, setStates] = useState<Record<number, string>>({});
  const [counterparties, setCounterparties] = useState<Record<number, string>>(
    {},
  );
  const [details, setDetails] = useState<Record<number, Detail>>({});
  const [collections, setCollections] = useState<Record<number, Collection>>(
    {},
  );
  const [discounts, setDiscounts] = useState<Record<number, Discount>>({});
  const [endorsements,setEndorsements]=useState<Record<number,Endorsement>>({});
  const allowed = ["ADMIN", "ACCOUNTING", "AUDITOR"].includes(user.role);
  const load = useCallback(() => {
    if (allowed)
      Promise.all([
        api<Instrument[]>("/instruments"),
        api<Config>("/configuration"),
        api<Customer[]>("/customers"),
      ]).then(([rows, config, customerRows]) => {
        setItems(rows);
        setCustomers(customerRows);
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
        setDiscounts((current) => Object.fromEntries(rows.map((x) => [x.id, current[x.id] || { company: "", rate: 0, pricingMethod:"ANNUAL", commission:0, tax:0, fee: 0, withRecourse:true, date: new Date().toISOString().slice(0,10), note: "" }])));
        setEndorsements((current)=>Object.fromEntries(rows.map((x)=>[x.id,current[x.id]||{counterpartyCustomerId:0,settlementAmount:x.amount,date:new Date().toISOString().slice(0,10),reference:"",note:""}])));
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
  const discount = async (item: Instrument) => {
    const value=discounts[item.id];
    if(!value?.company) return setMessage("Çekin kırdırıldığı banka veya finansman firmasını yazın.");
    try {
      const result=await api<{message:string}>(`/instruments/${item.id}/discount`,{method:"POST",body:JSON.stringify({company:value.company,discountRate:value.rate,pricingMethod:value.pricingMethod,commissionAmount:value.commission,taxAmount:value.tax,feeAmount:value.fee,withRecourse:value.withRecourse,transactionDate:value.date,note:value.note})});
      setMessage(result.message); load();
    } catch(e){setMessage((e as Error).message)}
  };
  const endorse = async (item:Instrument) => {
    const value=endorsements[item.id];
    if(!value?.counterpartyCustomerId) return setMessage("Çekin verileceği tedarikçi carisini seçin.");
    if(!value.reference.trim()) return setMessage("Kapatılacak alış faturası veya borç referansını yazın.");
    try {
      const result=await api<{message:string}>(`/instruments/${item.id}/endorse`,{method:"POST",body:JSON.stringify({counterpartyCustomerId:value.counterpartyCustomerId,settlementAmount:value.settlementAmount,transactionDate:value.date,documentReference:value.reference,note:value.note||undefined})});
      setMessage(result.message); load();
    } catch(e){setMessage((e as Error).message)}
  };
  const shown = items.filter(
    (x) =>
      filter === "ALL" ||
      (filter === "ACTION" && !["COLLECTED","CANCELLED","ENDORSED","ASSIGNED"].includes(x.status) && (x.daysToDue<=7 || !x.issuer || !x.serialNumber || (x.instrumentType==="CHECK"&&!x.bankName))) ||
      (filter === "DUE" &&
        x.daysToDue === 0 &&
        !["COLLECTED", "CANCELLED", "ENDORSED", "ASSIGNED"].includes(x.status)) ||
      (filter === "OVERDUE" &&
        x.daysToDue < 0 &&
        !["COLLECTED", "CANCELLED", "ENDORSED", "ASSIGNED"].includes(x.status)) ||
      (filter === "UPCOMING" &&
        x.daysToDue > 0 &&
        !["COLLECTED", "CANCELLED", "ENDORSED", "ASSIGNED"].includes(x.status)) ||
      (filter === "COLLECTED" && x.status === "COLLECTED") ||
      (filter === "DISCOUNTED" && !!x.discountCompany) ||
      (filter === "ENDORSED" && !!x.endorsementCompany),
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
        description="Çekin teslim alınmasından tahsil, kırdırma veya karşılıksız sonucuna kadar tüm hareketlerini yönetin."
      />
      {message && <Toast text={message} close={() => setMessage("")} />}
      <section className="instrument-welcome panel"><div><span className="eyebrow">BU EKRANDA NE YAPACAĞIM?</span><h2>Önce çeki bulun, sonra size gösterilen sıradaki adımı uygulayın.</h2><p>Teknik terimleri bilmeniz gerekmez. Kartı açtığınızda yalnızca o çek için yapılabilecek işlemler gösterilir.</p></div><button className="mini-btn" onClick={()=>setHelpOpen(!helpOpen)}>{helpOpen?"Açıklamayı gizle":"Nasıl kullanılır?"}</button></section>
      {helpOpen&&<section className="instrument-simple-flow"><div><i>1</i><span><b>Bilgileri tamamla</b><small>Keşideci, banka ve çek numarasını yazın.</small></span></div><div><i>2</i><span><b>Teslim aldım</b><small>Fiziksel çek elinize geçtiğinde portföye alın.</small></span></div><div><i>3</i><span><b>Sonucu seç</b><small>Tahsil edildi, kırdırıldı veya karşılıksız çıktı.</small></span></div></section>}
      <div className="instrument-stats">
        <Metric
          icon={<FileClock />}
          tone="amber"
          label="Bugün vadesi gelen"
          value={String(
            items.filter(
              (x) =>
                x.daysToDue === 0 &&
                !["COLLECTED", "CANCELLED", "ENDORSED", "ASSIGNED"].includes(x.status),
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
              .filter((x) => !["COLLECTED", "CANCELLED", "ENDORSED", "ASSIGNED"].includes(x.status))
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
                !["COLLECTED", "CANCELLED", "ENDORSED", "ASSIGNED"].includes(x.status),
            ).length,
          )}
          note="İşlem gerekiyor"
        />
      </div>
      <section className="instrument-money-separation panel">
        <div><small>Ciro ile kapatılan tedarikçi borcu</small><b>{money(items.reduce((sum,x)=>sum+(x.endorsementAmount||0)*x.exchangeRate,0))}</b><span>Nakit hareketi değildir</span></div>
        <div><small>Kırdırmadan bankaya geçen net nakit</small><b>{money(items.reduce((sum,x)=>sum+(x.discountCashAmount||0)*x.exchangeRate,0))}</b><span>Gerçek para girişi</span></div>
        <div><small>Toplam çek finansman maliyeti</small><b>{money(items.reduce((sum,x)=>sum+(x.discountFinanceCost||0)*x.exchangeRate,0))}</b><span>İskonto + komisyon + vergi + masraf</span></div>
      </section>
      <div className="filter-tabs">
        {[
          ["ACTION", "Benim işlem yapacaklarım"],
          ["DUE", "Bugün vadesi gelen"],
          ["OVERDUE", "Vadesi geçen"],
          ["UPCOMING", "İleride vadesi gelecek"],
          ["COLLECTED", "Tamamlanan tahsilatlar"],
          ["DISCOUNTED", "Kırdırılan çekler"],
          ["ENDORSED", "Ciro edilen çekler"],
          ["ALL", "Bütün evraklar"],
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
          const discountValue=discounts[item.id];
          const discountDays=discountValue?Math.max(0,Math.ceil((new Date(`${item.dueDate}T12:00:00`).getTime()-new Date(`${discountValue.date}T12:00:00`).getTime())/86400000)):0;
          const discountCut=discountValue?item.amount*discountValue.rate/100*(discountValue.pricingMethod==="ANNUAL"?discountDays/360:1):0;
          const discountNet=Math.max(0,item.amount-discountCut-(discountValue?.commission||0)-(discountValue?.tax||0)-(discountValue?.fee||0));
          const nextStep=incomplete?"Önce çek bilgilerini tamamlayın":item.status==="PLANNED"?"Fiziksel çek elinize geçtiyse teslim alındı olarak işaretleyin":item.status==="IN_PORTFOLIO"?"Çek elinizde: tahsilat, bankaya verme, ciro veya kırdırma işlemini seçin":item.status==="GIVEN_TO_BANK"?"Çek bankada: tahsil edildi veya karşılıksız sonucunu kaydedin":item.status==="ENDORSED"?"Ciro tamamlandı; tedarikçi borcu kapatıldı, nakit ve maliyet değişmedi":item.discountCompany?"Kırdırma tamamlandı; net nakit ve finansman maliyeti kaydedildi":["COLLECTED","ASSIGNED","CANCELLED"].includes(item.status)?"Bu evrak için işlem tamamlandı":"Evrakın güncel sonucunu kaydedin";
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
                  <Status value={item.discountCompany ? "DISCOUNTED" : item.status} />
                  <button className="instrument-toggle" onClick={()=>setOpenId(expanded?null:item.id)}>{expanded?"Kartı kapat":item.status==="COLLECTED"?"Sonucu gör":"Aç ve devam et"}</button>
                </div>
              </div>
              <div className="instrument-next-step"><span>SIRADAKİ ADIM</span><b>{nextStep}</b></div>
              {!expanded&&incomplete&&<div className="instrument-warning">Evrak bilgileri eksik · işlem için tamamlayın</div>}
              {incomplete && expanded && (
                <div className="detail-editor">
                  <b>Evrak bilgilerini tamamlayın</b>
                  <div>
                    <label><small>{item.instrumentType === "CHECK" ? "Çeki düzenleyen kişi/firma (keşideci)" : "Senedi düzenleyen borçlu"}</small><input
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
                    /></label>
                    <label><small>Çekin üzerindeki seri / evrak numarası</small><input
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
                    /></label>
                    {item.instrumentType === "CHECK" && (
                      <label><small>Çekin ait olduğu banka</small><input
                        placeholder="Banka"
                        value={detail.bankName}
                        onChange={(e) =>
                          setDetails({
                            ...details,
                            [item.id]: { ...detail, bankName: e.target.value },
                          })
                        }
                      /></label>
                    )}
                    <label><small>Çekin düzenlendiği tarih</small><input
                      type="date"
                      value={detail.issueDate}
                      onChange={(e) =>
                        setDetails({
                          ...details,
                          [item.id]: { ...detail, issueDate: e.target.value },
                        })
                      }
                    /></label>
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
                  <span><small>Kayıt / sipariş kuru</small><b>{item.currency === "TRY" ? "1,0000" : item.exchangeRate.toLocaleString("tr-TR", { minimumFractionDigits: 4 })}</b></span>
                  <span><small>Tahsilat tarihi</small><b>{dateOnly(item.collectionDate!)}</b></span>
                  <span><small>Tahsilat kuru</small><b>{item.collectionRate.toLocaleString("tr-TR", { minimumFractionDigits: 4 })}</b></span>
                  <span><small>Tahsil edilen TL</small><b>{money(item.collectedTryAmount || 0)}</b></span>
                  <span className={(item.exchangeDifference || 0) < 0 ? "negative" : "positive"}><small>Kur farkı</small><b>{money(item.exchangeDifference || 0)}</b></span>
                </div>
              )}
              {expanded && item.discountCompany && (
                <div className="collection-summary discount-summary">
                  <span><small>Kırdırılan firma</small><b>{item.discountCompany}</b></span>
                  <span><small>İşlem tarihi</small><b>{dateOnly(item.discountDate!)}</b></span>
                  <span><small>Kırdırma oranı</small><b>%{item.discountRate?.toLocaleString("tr-TR")}</b></span>
                  <span><small>Ek masraf</small><b>{money(item.discountFee||0,item.currency)}</b></span>
                  <span><small>Komisyon</small><b>{money(item.discountCommission||0,item.currency)}</b></span>
                  <span><small>Vergi</small><b>{money(item.discountTax||0,item.currency)}</b></span>
                  <span><small>Rücu</small><b>{item.discountWithRecourse?"Rüculu":"Rücusuz"}</b></span>
                  <span><small>Net ele geçen</small><b>{money(item.discountNetAmount||0,item.currency)}</b></span>
                  <span><small>Toplam finansman maliyeti</small><b>{money(item.discountFinanceCost||0,item.currency)}</b></span>
                  {item.discountWithRecourse&&item.status==="ASSIGNED"&&user.role!=="AUDITOR"&&<button className="reject-btn" onClick={()=>move(item,"BOUNCED")}>Rüculu çek ödenmedi — cariyi yeniden aç</button>}
                </div>
              )}
              {expanded && item.endorsementCompany && (
                <div className="collection-summary endorsement-summary">
                  <span><small>Ciro edilen cari</small><b>{item.endorsementCompany}</b></span>
                  <span><small>Ciro tarihi</small><b>{dateOnly(item.endorsementDate!)}</b></span>
                  <span><small>Kapatılan borç</small><b>{money(item.endorsementAmount||0,item.currency)}</b></span>
                  <span><small>Belge / borç referansı</small><b>{item.endorsementReference}</b></span>
                  <span><small>Nakit etkisi</small><b>{money(0)}</b></span>
                  <span><small>Finansman maliyeti</small><b>{money(0)}</b></span>
                  {item.status==="ENDORSED"&&user.role!=="AUDITOR"&&<button className="reject-btn" onClick={()=>move(item,"BOUNCED")}>Ciro edilen çek karşılıksız çıktı</button>}
                </div>
              )}
              {expanded && !incomplete && user.role !== "AUDITOR" &&
                !["COLLECTED", "CANCELLED", "ENDORSED", "ASSIGNED"].includes(
                  item.status,
                ) && (
                  <>
                  {item.status==="PLANNED"?<div className="receive-check-box"><div><b>Fiziksel çek size teslim edildi mi?</b><span>“Teslim aldım” dediğinizde çek portföye girer ve tutarı müşteri carisinden düşer.</span></div><button className="collect-btn" onClick={()=>move(item,"IN_PORTFOLIO")}><CheckCircle2/>Evet, çeki teslim aldım</button></div>:<div className="instrument-action-choice"><b>Bu çekle şimdi ne yapmak istiyorsunuz?</b><div><button className={activeAction[item.id]==="COLLECT"?"selected":""} onClick={()=>setActiveAction({...activeAction,[item.id]:"COLLECT"})}><CheckCircle2/><span><b>Tahsil edildi</b><small>Para bankaya geçti</small></span></button>{item.instrumentType==="CHECK"&&<button className={activeAction[item.id]==="DISCOUNT"?"selected":""} onClick={()=>setActiveAction({...activeAction,[item.id]:"DISCOUNT"})}><CircleDollarSign/><span><b>Çeki kırdır</b><small>Vadesinden önce nakde çevir</small></span></button>}<button className={activeAction[item.id]==="ENDORSE"?"selected":""} onClick={()=>setActiveAction({...activeAction,[item.id]:"ENDORSE"})}><ShoppingCart/><span><b>Tedarikçiye ciro et</b><small>Nakit çıkmadan borç kapat</small></span></button><button className={activeAction[item.id]==="OTHER"?"selected":""} onClick={()=>setActiveAction({...activeAction,[item.id]:"OTHER"})}><FileClock/><span><b>Başka işlem</b><small>Bankaya ver, temlik et, karşılıksız</small></span></button></div></div>}
                  {item.status!=="PLANNED"&&activeAction[item.id]==="COLLECT"&&<div className="collection-editor">
                    <b>Tahsilat bilgisi</b>
                    <label><small>Gerçekleşen tarih</small><input type="date" value={collections[item.id]?.date || ""} onChange={(e) => setCollections({...collections,[item.id]:{...collections[item.id],date:e.target.value}})} /></label>
                    <label><small>{item.currency === "TRY" ? "Kur" : `${item.currency} tahsilat kuru`}</small><input type="number" min="0.0001" step="0.0001" readOnly={item.currency === "TRY"} value={collections[item.id]?.rate || ""} onChange={(e) => setCollections({...collections,[item.id]:{...collections[item.id],rate:Number(e.target.value)}})} /></label>
                    <span><small>Tahsilat TL karşılığı</small><b>{money(item.amount * (collections[item.id]?.rate || item.exchangeRate))}</b></span>
                    <button className="collect-btn" disabled={!collections[item.id]?.date || !collections[item.id]?.rate} onClick={() => move(item, "COLLECTED")}><CheckCircle2 />Tahsilatı kaydet</button>
                  </div>}
                  {item.status!=="PLANNED"&&activeAction[item.id]==="OTHER"&&<div className="instrument-actions simple-other-action">
                    <select
                      value={states[item.id] || ""}
                      onChange={(e) =>
                        setStates({ ...states, [item.id]: e.target.value })
                      }
                    >
                      <option value="">İşlem seçin…</option>
                      <option value="GIVEN_TO_BANK">Bankaya tahsile verdim</option>
                      <option value="ASSIGNED">Alacağı başka kuruma devrettim (temlik)</option>
                      <option value="BOUNCED">Çek karşılıksız çıktı</option>
                      <option value="PROTESTED">Senet protesto edildi</option>
                      <option value="RETURNED">Evrakı müşteriye iade ettim</option>
                    </select>
                    {states[item.id] === "ASSIGNED" && (
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
                      Seçilen işlemi kaydet
                    </button>
                  </div>}
                  {item.status!=="PLANNED"&&activeAction[item.id]==="ENDORSE"&&<div className="endorsement-editor">
                    <div className="financial-safety-note"><b>Ciro nakit tahsilat değildir</b><small>Seçtiğiniz tedarikçinin açık borcu azalır. Müşteri carisi, banka ve ürün maliyeti ikinci kez değişmez.</small></div>
                    <label><small>Çekin verileceği tedarikçi carisi</small><select value={endorsements[item.id]?.counterpartyCustomerId||0} onChange={e=>setEndorsements({...endorsements,[item.id]:{...endorsements[item.id],counterpartyCustomerId:Number(e.target.value)}})}><option value={0}>Tedarikçi seçin…</option>{customers.filter(c=>(c.tags||"").split(",").includes("SUPPLIER")).map(c=><option key={c.id} value={c.id}>{c.name} · {c.balance<0?`${money(Math.abs(c.balance))} açık borç`:"Açık borç yok"}</option>)}</select></label>
                    <label><small>Borçtan düşülecek tutar ({item.currency})</small><input type="number" min="0.01" max={item.amount} step="0.01" value={endorsements[item.id]?.settlementAmount||""} onChange={e=>setEndorsements({...endorsements,[item.id]:{...endorsements[item.id],settlementAmount:Number(e.target.value)}})}/></label>
                    <label><small>Alış faturası / borç referansı</small><input placeholder="Örn. AF-2026-184" value={endorsements[item.id]?.reference||""} onChange={e=>setEndorsements({...endorsements,[item.id]:{...endorsements[item.id],reference:e.target.value}})}/></label>
                    <label><small>Ciro tarihi</small><input type="date" value={endorsements[item.id]?.date||""} onChange={e=>setEndorsements({...endorsements,[item.id]:{...endorsements[item.id],date:e.target.value}})}/></label>
                    <label><small>Açıklama (isteğe bağlı)</small><input placeholder="Ciro açıklaması" value={endorsements[item.id]?.note||""} onChange={e=>setEndorsements({...endorsements,[item.id]:{...endorsements[item.id],note:e.target.value}})}/></label>
                    <div className="endorsement-impact"><span><small>Çek nominali</small><b>{money(item.amount,item.currency)}</b></span><span><small>Nakit etkisi</small><b>{money(0)}</b></span><span><small>Finansman maliyeti</small><b>{money(0)}</b></span></div>
                    <button className="mini-btn" onClick={()=>endorse(item)}>Ciroyu ve cari mahsubu kaydet</button>
                  </div>}
                  {item.status!=="PLANNED"&&item.instrumentType==="CHECK"&&activeAction[item.id]==="DISCOUNT"&&<div className="discount-editor">
                    <div><b>Çeki kırdır / finansmana devret</b><small>Portföydeki bu çeki seçili firmaya devreder. Bu işlem müşterinin carisini ikinci kez düşürmez.</small></div>
                    <label><small>Banka / finansman firması</small><input placeholder="Örn. ABC Faktoring" value={discounts[item.id]?.company||""} onChange={e=>setDiscounts({...discounts,[item.id]:{...discounts[item.id],company:e.target.value}})}/></label>
                    <label><small>Kırdırma oranı (%)</small><input type="number" min="0" max="100" step="0.01" value={discounts[item.id]?.rate||0} onChange={e=>setDiscounts({...discounts,[item.id]:{...discounts[item.id],rate:Number(e.target.value)}})}/></label>
                    <label><small>Oran biçimi</small><select value={discounts[item.id]?.pricingMethod||"ANNUAL"} onChange={e=>setDiscounts({...discounts,[item.id]:{...discounts[item.id],pricingMethod:e.target.value as "DIRECT"|"ANNUAL"}})}><option value="ANNUAL">Yıllık oran × kalan gün / 360</option><option value="DIRECT">Doğrudan toplam oran</option></select></label>
                    <label><small>Komisyon ({item.currency})</small><input type="number" min="0" step="0.01" value={discounts[item.id]?.commission||0} onChange={e=>setDiscounts({...discounts,[item.id]:{...discounts[item.id],commission:Number(e.target.value)}})}/></label>
                    <label><small>Vergi ({item.currency})</small><input type="number" min="0" step="0.01" value={discounts[item.id]?.tax||0} onChange={e=>setDiscounts({...discounts,[item.id]:{...discounts[item.id],tax:Number(e.target.value)}})}/></label>
                    <label><small>Ek masraf ({item.currency})</small><input type="number" min="0" step="0.01" value={discounts[item.id]?.fee||0} onChange={e=>setDiscounts({...discounts,[item.id]:{...discounts[item.id],fee:Number(e.target.value)}})}/></label>
                    <label><small>İşlem tarihi</small><input type="date" value={discounts[item.id]?.date||""} onChange={e=>setDiscounts({...discounts,[item.id]:{...discounts[item.id],date:e.target.value}})}/></label>
                    <label className="recourse-choice"><input type="checkbox" checked={discounts[item.id]?.withRecourse??true} onChange={e=>setDiscounts({...discounts,[item.id]:{...discounts[item.id],withRecourse:e.target.checked}})}/><small>Rüculu (ödenmezse sorumluluk bizde)</small></label>
                    <span><small>Vade günü / iskonto</small><b>{discountDays} gün · {money(discountCut,item.currency)}</b></span>
                    <span><small>Net ele geçecek tutar</small><b>{money(discountNet,item.currency)}</b></span>
                    <button className="mini-btn" onClick={()=>discount(item)}>Çeki kırdır</button>
                  </div>}
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
    if (!sourceId) return setMessage("Onaylanmış bir sipariş seçin.");
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
      <ScreenGuide title="Onaylanan sipariş için elektronik belge talebi oluşturun." steps={["Önce belge sağlayıcısının tanımlı olduğunu kontrol edin.","Onaylanmış siparişi ve doğru belge türünü seçin.","Talebi oluşturun; resmî numara gelene kadar durumunu listeden takip edin."]} note="e-Fatura kurumsal alıcıya, e-Arşiv e-Fatura kullanmayan alıcıya, e-İrsaliye ise sevkiyata eşlik eden belgeye yöneliktir."/>
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
            <span>Onaylı sipariş</span>
            <select
              value={sourceId}
              onChange={(e) => setSourceId(Number(e.target.value))}
            >
              <option value="">Sipariş seçin…</option>
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
            <small className="field-help">{documentType==="E_INVOICE"?"e-Fatura mükellefi kurumsal alıcı için.":documentType==="E_ARCHIVE"?"e-Fatura kullanmayan alıcı için.":"Mal sevkiyatına eşlik eden elektronik irsaliye."}</small>
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
const labels:Record<string,{title:string;description:string}>={DASHBOARD:{title:"Ana Sayfa",description:"Günlük özet ve bildirimler"},CUSTOMERS:{title:"Cariler",description:"Müşteri, bayi ve tedarikçi cari kartları"},SALES:{title:"Siparişler",description:"Sipariş listesi ve yeni sipariş"},INSTRUMENTS:{title:"Çek ve Senetler",description:"Çek ve senet işlemleri"},RECEIPTS:{title:"Tahsilatlar",description:"Cari ekstre, vadeler ve alınan ödemeler"},APPROVALS:{title:"Onaylar",description:"Onay, ret ve düzeltme kararları"},SHIPMENTS:{title:"Sevkiyatlar",description:"Sevkiyat planlama ve teslimat"},EDOCUMENTS:{title:"e-Belgeler",description:"e-Fatura, e-Arşiv ve e-İrsaliye"},AUDIT:{title:"İşlem Geçmişi",description:"Değiştirilemez işlem geçmişi"},SECURITY:{title:"Güvenlik",description:"İki aşamalı doğrulama, passkey ve cihazlar"},USER_MANAGEMENT:{title:"Kullanıcı Yetkileri",description:"Kullanıcı ekran erişimlerini yönetme"}};
  const [data,setData]=useState<Response|null>(null);const [selectedId,setSelectedId]=useState(0);const [draft,setDraft]=useState<string[]>([]);const [message,setMessage]=useState("");
  const load=useCallback(()=>api<Response>("/admin/users").then(result=>{setData(result);const id=selectedId||result.users.find(x=>x.role!=="ADMIN")?.id||result.users[0]?.id||0;setSelectedId(id);setDraft(result.users.find(x=>x.id===id)?.permissions||[])}),[selectedId]);
  useEffect(()=>{if(currentUser.role==="ADMIN")load()},[currentUser.role,load]);
  if(currentUser.role!=="ADMIN")return <Empty title="Kullanıcı Yetkileri" text="Bu ekran yalnızca yöneticilere açıktır."/>;
  if(!data)return <div className="loading">Yetkiler hazırlanıyor…</div>;
  const selected=data.users.find(x=>x.id===selectedId);const isAdmin=selected?.role==="ADMIN";
  const selectUser=(id:number)=>{setSelectedId(id);setDraft(data.users.find(x=>x.id===id)?.permissions||[]);setMessage("")};
  const toggle=(key:string)=>setDraft(draft.includes(key)?draft.filter(x=>x!==key):[...draft,key]);
  const save=async()=>{if(!selected)return;try{const result=await api<{message:string}>(`/admin/users/${selected.id}/permissions`,{method:"PUT",body:JSON.stringify({permissions:draft})});setMessage(result.message);const users=data.users.map(x=>x.id===selected.id?{...x,permissions:draft}:x);setData({...data,users})}catch(e){setMessage((e as Error).message)}};
  return <><PageHead eyebrow="YÖNETİM" title="Kullanıcı yetkileri" description="Kullanıcının sol menüde göreceği ve erişebileceği modülleri belirleyin."/><ScreenGuide title="Bir çalışanın görebileceği ekranları seçin." steps={["Soldan çalışanı seçin.","Kullanması gereken ekranları işaretleyin.","Yetkileri kaydet düğmesine basın."]} note="Yönetici hesaplarının erişimi kapatılamaz. Ekranı açmak, kullanıcının rolü dışındaki kritik işlemleri yapmasına izin vermez."/>{message&&<Toast text={message} close={()=>setMessage("")}/>}<div className="permission-layout"><section className="panel permission-users"><PanelTitle title="Kullanıcılar"/><div>{data.users.map(user=><button className={selectedId===user.id?"selected":""} onClick={()=>selectUser(user.id)} key={user.id}><span className="avatar">{user.name.split(" ").map(x=>x[0]).join("").slice(0,2)}</span><span><b>{user.name}</b><small>{roleLabels[user.role]} · {user.email}</small></span><em>{user.permissions.length} ekran</em></button>)}</div></section><section className="panel permission-editor"><div className="permission-head"><div><span className="eyebrow">ERİŞİM AYARLARI</span><h2>{selected?.name}</h2><p>{isAdmin?"Yönetici hesapları güvenlik nedeniyle bütün ekranlara erişir.":"İşaretlenen ekranlar kullanıcının sol menüsünde görünür."}</p></div><button className="primary-btn" disabled={isAdmin} onClick={save}>Yetkileri kaydet</button></div><div className="permission-grid">{data.permissions.map(key=>{const meta=labels[key]||{title:key,description:""};const checked=isAdmin||draft.includes(key);return <label className={checked?"checked":""} key={key}><input type="checkbox" checked={checked} disabled={isAdmin} onChange={()=>toggle(key)}/><span><b>{meta.title}</b><small>{meta.description}</small></span><CheckCircle2/></label>})}</div><div className="permission-note"><ShieldCheck/><span><b>Sunucu koruması etkin</b><small>Menüde gizlenen bir ekrana adres yazarak veya doğrudan API isteğiyle erişilemez. Rolün izin vermediği işlem, ekran seçilmiş olsa bile açılamaz.</small></span></div></section></div></>
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
      <ScreenGuide title="Hesabınızı iki basit adımla koruyun." steps={["Önce iki aşamalı doğrulamayı kurun.","Desteklenen cihazlarda hızlı giriş için passkey ekleyin.","Tanımadığınız açık cihaz oturumlarını kapatın."]}/>
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
        title="İşlem geçmişi"
        description="Kim, neyi, ne zaman yaptı? Değiştirilemez işlem geçmişi."
      />
      <ScreenGuide title="Sistemde yapılan değişiklikleri buradan kontrol edin." steps={["İşlemin ne olduğunu okuyun.","İşlemi yapan kullanıcıyı ve ilgili kayıt numarasını kontrol edin.","Tarih ve kısa takip koduyla gerektiğinde kaydı eşleştirin."]} note="Bu ekran yalnızca kayıtları gösterir; buradan işlem değiştirilemez veya silinemez."/>
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
        SALE_CREATED: "Sipariş oluşturuldu",
        SALE_SUBMITTED: "Sipariş onaya gönderildi",
        APPROVAL_APPROVED: "Sipariş onaylandı",
        APPROVAL_REJECTED: "Sipariş reddedildi",
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
function transactionTypeLabel(v:string){return ({CASH_RECEIPT:"Nakit",BANK_RECEIPT:"Havale / EFT",INSTRUMENT_RECEIPT:"Çek / senet tahsilatı",INSTRUMENT_RECEIVED:"Çek / senet teslim alındı",INSTRUMENT_BOUNCED:"Karşılıksız evrak — borç yeniden açıldı",DOWN_PAYMENT:"Peşinat",RECEIPT_REVERSAL:"Ters kayıt"} as Record<string,string>)[v]||"Tahsilat"}
function dateOnly(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(
    new Date(`${value}T12:00:00`),
  );
}

export default App;
