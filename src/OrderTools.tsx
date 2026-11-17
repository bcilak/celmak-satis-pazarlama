import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChartColumn, PencilLine, Pencil, Plus, Printer, StickyNote, TriangleAlert, Undo2, X } from "lucide-react";
import { api } from "./api";
import celmakLogo from "./assets/celmak-logo.jpg";
import { ReportTabs } from "./UnbackedReport";
import { VAT_RATES, currencySymbol, money, paymentMethodLabels, statusLabels, type Product } from "./types";

/* ------------------------------------------------------------------ */
/* Ortak yardımcılar                                                   */
/* ------------------------------------------------------------------ */

const longDate = (value?: string | null) => {
  if (!value) return "—";
  const date = value.length > 10 ? new Date(value.replace(" ", "T") + "Z") : new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "long" }).format(date);
};
const shortDate = (value?: string | null) => {
  if (!value) return "";
  const date = value.length > 10 ? new Date(value.replace(" ", "T") + "Z") : new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
};
// Bugün Türkiye saatine göre (UTC gece yarısından önce bir gün geride kalmasın).
const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const qty = (value: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value);

/* ------------------------------------------------------------------ */
/* Para girişi: binlik nokta, ondalık virgül ve para birimi işareti    */
/* ------------------------------------------------------------------ */

const groupThousands = (digits: string) => digits.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** 1250000.5 → "1.250.000,5" (en fazla 2 ondalık). Sıfır için boş döner ki yer tutucu görünsün. */
function formatAmountText(value: number) {
  if (!value) return "";
  const [whole, fraction] = Math.abs(value).toFixed(2).split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return groupThousands(whole) + (trimmed ? `,${trimmed}` : "");
}

export function MoneyInput({
  value,
  onChange,
  currency = "TRY",
  required,
  placeholder = "0,00",
  invalid,
  readOnly,
}: {
  value: number;
  onChange: (value: number) => void;
  currency?: string;
  required?: boolean;
  placeholder?: string;
  invalid?: boolean;
  readOnly?: boolean;
}) {
  // Yazarken kullanıcının metni korunur; odak yokken metin her zaman değerden türetilir
  // (ör. "tutarları eşit dağıt" sonrası güncel tutar görünür).
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const shown = focused ? text : formatAmountText(value);
  const handle = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const raw = input.value;
    const caret = input.selectionStart ?? raw.length;
    const significantBeforeCaret = raw.slice(0, caret).replace(/[^\d,]/g, "").length;
    let cleaned = raw.replace(/[^\d,]/g, "");
    const comma = cleaned.indexOf(",");
    if (comma >= 0) cleaned = cleaned.slice(0, comma + 1) + cleaned.slice(comma + 1).replace(/,/g, "").slice(0, 2);
    const whole = comma >= 0 ? cleaned.slice(0, comma) : cleaned;
    const fraction = comma >= 0 ? cleaned.slice(comma + 1) : undefined;
    const next = (whole ? groupThousands(whole) : fraction !== undefined ? "0" : "") + (fraction !== undefined ? `,${fraction}` : "");
    setText(next);
    onChange(next ? Number(`${whole || "0"}.${fraction || "0"}`) : 0);
    // İmleci, noktalar eklendikten sonra da aynı rakamın yanında tut.
    requestAnimationFrame(() => {
      let seen = 0;
      let position = 0;
      while (position < next.length && seen < significantBeforeCaret) {
        if (/[\d,]/.test(next[position])) seen++;
        position++;
      }
      input.setSelectionRange(position, position);
    });
  };
  return (
    <span className={invalid ? "money-input invalid" : "money-input"}>
      <input
        inputMode="decimal"
        autoComplete="off"
        required={required}
        readOnly={readOnly}
        placeholder={placeholder}
        value={shown}
        onChange={handle}
        onFocus={() => {
          setText(formatAmountText(value));
          setFocused(true);
        }}
        onBlur={() => setFocused(false)}
      />
      <b aria-hidden="true">{currencySymbol(currency)}</b>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Evraksız alacak uyarısı                                             */
/* ------------------------------------------------------------------ */
// Teslim alınan çek/senet ve tahsilatlar cariye alacak olarak işlendiği için
// pozitif cari bakiye = henüz evrak veya ödeme ile karşılanmamış (evraksız) alacaktır.

export function UnbackedReceivableBadge({ balance }: { balance: number }) {
  if (balance <= 0.01) return null;
  return (
    <span className="unbacked-badge" role="img" aria-label="Evraksız alacak var" title={`Evraksız alacak: ${money(balance)} — çek/senet ya da ödeme ile karşılanmamış cari borç`}>
      !
    </span>
  );
}

export function UnbackedReceivableNotice({ balance }: { balance: number }) {
  if (balance <= 0.01) return null;
  return (
    <div className="unbacked-notice" role="status">
      <TriangleAlert />
      <div>
        <b>Evraksız alacak: {money(balance)}</b>
        <span>Bu tutar için henüz çek/senet alınmadı ya da ödeme yapılmadı. Evrak veya tahsilat girildiğinde uyarı kendiliğinden kalkar.</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cari notu                                                           */
/* ------------------------------------------------------------------ */

export function CustomerNoteEditor({ customerId, note, canEdit, onSaved }: { customerId: number; note?: string | null; canEdit: boolean; onSaved: (note: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api(`/customers/${customerId}/note`, { method: "PUT", body: JSON.stringify({ note: draft }) });
      onSaved(draft.trim());
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel customer-note">
      <div className="customer-note-head">
        <StickyNote />
        <b>Cari notu</b>
        {canEdit && !editing && (
          <button type="button" className="mini-btn" onClick={() => { setDraft(note || ""); setEditing(true); }}>
            <Pencil /> {note ? "Düzenle" : "Not ekle"}
          </button>
        )}
      </div>
      {editing ? (
        <>
          <textarea maxLength={1000} rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Örn. Ödemeleri ayın 15'inde yapar, sevkiyatı depodan teslim alır…" />
          {error && <div className="error-box">{error}</div>}
          <div className="head-actions">
            <button type="button" className="mini-btn" onClick={() => setEditing(false)} disabled={busy}>Vazgeç</button>
            <button type="button" className="primary-btn" onClick={save} disabled={busy}>{busy ? "Kaydediliyor…" : "Notu kaydet"}</button>
          </div>
        </>
      ) : (
        <p className={note ? "" : "muted"}>{note || "Bu cari için not girilmemiş."}</p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Yazdırma / PDF şablonları                                           */
/* ------------------------------------------------------------------ */

function PrintFrame({ title, fileName, children }: { title: string; fileName: string; children: ReactNode }) {
  const navigate = useNavigate();
  useEffect(() => {
    const previous = document.title;
    document.title = fileName; // Tarayıcı PDF dosya adını sayfa başlığından alır.
    return () => {
      document.title = previous;
    };
  }, [fileName]);
  return (
    <>
      <div className="print-toolbar no-print">
        <button type="button" className="mini-btn" onClick={() => navigate(-1)}><ArrowLeft /> Geri</button>
        <div>
          <b>{title}</b>
          <span>PDF almak için “Yazdır / PDF” düğmesine basın, açılan pencerede Hedef olarak “PDF olarak kaydet”i seçin.</span>
        </div>
        <button type="button" className="primary-btn" onClick={() => window.print()}><Printer /> Yazdır / PDF</button>
      </div>
      <article className="print-doc">{children}</article>
    </>
  );
}

function DocHeader({ title, number, date, extra }: { title: string; number: string; date: string; extra?: ReactNode }) {
  return (
    <header className="doc-header">
      <div className="doc-brand">
        <span className="doc-mark">Ç</span>
        <div>
          <b>ÇELMAK</b>
          <small>Tarım Makineleri</small>
        </div>
      </div>
      <div className="doc-title">
        <h1>{title}</h1>
        <p><span>No</span><b>{number}</b></p>
        <p><span>Tarih</span><b>{date}</b></p>
        {extra}
      </div>
    </header>
  );
}

type SaleDoc = {
  sale: {
    id: number; number: string; status: string; note?: string; paymentMethod: string; cardInstallments?: number | null; orderKind?: "MACHINE" | "SPARE_PART";
    subtotal: number; vatTotal: number; grandTotal: number; downPayment: number; advanceAmount: number;
    currency: string; exchangeRate: number; createdAt: string; orderDate?: string; approvedAt?: string | null;
    customerId: number; customerCode: string; customerName: string; customerTaxNumber?: string; customerTaxOffice?: string; customerPhone?: string; customerEmail?: string; customerCity?: string; customerDistrict?: string; customerAddress?: string;
    createdBy: string; approvalAssignee?: string;
  };
  items: { id: number; productId: number; code: string; name: string; unit: string; model?: string; productGroup?: string; quantity: number; unitPrice: number; vatRate: number; lineTotal: number; shippedQuantity: number; returnedQuantity: number }[];
  schedule: { id: number; sequenceNo: number; paymentType: string; dueDate: string; amount: number; paidAmount: number; currency: string; status: string; instrumentId?: number | null; instrumentNumber?: string | null; instrumentStatus?: string | null }[];
  shipments: { id: number; number: string; status: string; plannedDate: string; actualDate?: string; dispatchNumber?: string; deliveryAddress?: string }[];
  returns: { id: number; number: string; returnDate: string; reason: string; subtotal: number; vatTotal: number; grandTotal: number; currency: string; createdBy: string; items: { quantity: number; lineTotal: number; name: string; code: string; unit: string }[] }[];
  amendments?: { id: number; number: string; amendmentDate: string; reason: string; previousTotal: number; newTotal: number; difference: number; currency: string; settlement: string; settlementDueDate?: string | null; createdBy: string; changes: { product: string; oldQuantity: number; newQuantity: number; oldTotal: number; newTotal: number }[]; paymentPlan?: { replaced: { paymentType: string; dueDate: string; amount: number; instrumentNumber?: string | null }[]; plan: PlanRow[] } | null }[];
};
export type { SaleDoc };

// Çelmak'ın matbu sipariş formu (Doküman No SP.FR.02) düzeninde basılır.
const ORDER_FORM_ROWS = 14;

export function SalePrint() {
  const { id } = useParams();
  const [data, setData] = useState<SaleDoc | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<SaleDoc>(`/sales/${id}/detail`).then(setData).catch((e) => setError(e.message));
  }, [id]);
  if (error) return <div className="error-box">{error}</div>;
  if (!data) return <div className="loading">Sipariş formu hazırlanıyor…</div>;
  const s = data.sale;
  const cur = s.currency;
  const remaining = Math.max(0, s.grandTotal - s.downPayment - s.advanceAmount);
  // Sıra No: SAT-2026-000123 → 2026/000123
  const serial = s.number.replace(/^[A-Z]+-(\d{4})-(\d+)$/, "$1/$2");
  const address = [s.customerAddress, [s.customerDistrict, s.customerCity].filter(Boolean).join(" / ")].filter(Boolean).join(" ");
  const activeShipments = data.shipments.filter((x) => x.status !== "CANCELLED").sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
  const firstShipment = activeShipments[0];
  const shipmentAddress = firstShipment?.deliveryAddress || address;
  const vatRates = Array.from(new Set(data.items.map((x) => x.vatRate))).sort((a, b) => a - b);
  const vatLabel = vatRates.length === 1 ? `% ${vatRates[0]} KDV` : `KDV (${vatRates.map((r) => `%${r}`).join(", ")})`;
  const approved = s.status === "APPROVED" || s.status === "COMPLETED";
  const installments = data.schedule.filter((x) => x.sequenceNo > 0);
  const method = paymentMethodLabels[s.paymentMethod] || s.paymentMethod;
  const blankRows = Math.max(0, ORDER_FORM_ROWS - data.items.length);
  return (
    <PrintFrame title={`${s.number} sipariş formu`} fileName={`${s.number} Siparis Formu`}>
      <div className="order-form">
        <header className="of-head">
          <img src={celmakLogo} alt="Çelmak Tarım Makinaları" />
          <div className="of-company">
            <span>ÇELMAK TARIM MAKİNALARI TİC. SAN. LTD. ŞTİ.</span>
            <span>Yeni Sanayi Sitesi 48. Sokak No:8 Balıkesir / TÜRKİYE</span>
            <span>T. 0 266 246 28 00-01 F. 0 266 246 28 02</span>
            <span className="of-web">
              <span>www.celmak.com&nbsp;&nbsp;info@celmak.com</span>
              <span>Sıra No : {serial}</span>
            </span>
          </div>
          {!approved && <div className="of-stamp">{statusLabels[s.status] || s.status}</div>}
        </header>
        <h1 className="of-title">SİPARİŞ FORMU</h1>
        <table className="of-info">
          <colgroup><col style={{ width: "27%" }} /><col style={{ width: "40%" }} /><col style={{ width: "15%" }} /><col style={{ width: "18%" }} /></colgroup>
          <tbody>
            <tr><th>MÜŞTERİ ÜNVANI</th><td>{s.customerName}</td><th>TARİHİ</th><td>{shortDate(s.orderDate || s.createdAt)}</td></tr>
            <tr><th>ADRESİ</th><td>{address}</td><th>SEVK TARİHİ</th><td>{shortDate(firstShipment?.actualDate || firstShipment?.plannedDate)}</td></tr>
            <tr><th>SEVKİYAT ADRESİ</th><td>{shipmentAddress}</td><th>VERGİ DAİRESİ</th><td>{s.customerTaxOffice}</td></tr>
            <tr><th>TELEFON</th><td>{s.customerPhone}</td><th>TC/VERGİ NO</th><td>{s.customerTaxNumber}</td></tr>
            <tr><th>FAX/ E-POSTA</th><td>{s.customerEmail}</td><th>TEKLİF NO</th><td></td></tr>
          </tbody>
        </table>
        <table className="of-items">
          <colgroup><col style={{ width: "44.5%" }} /><col style={{ width: "11%" }} /><col style={{ width: "9%" }} /><col style={{ width: "14.5%" }} /><col style={{ width: "21%" }} /></colgroup>
          <thead>
            <tr><th>ÜRÜN CİNSİ</th><th>MİKTARI</th><th>BİRİMİ</th><th>BİRİM FİYATI</th><th className="of-spaced">TUTARI</th></tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}{item.model && item.model !== item.name ? <small> · {item.model}</small> : null}</td>
                <td className="num">{qty(item.quantity)}</td>
                <td className="center">{(item.unit || "ADET").toLocaleUpperCase("tr-TR")}</td>
                <td className="num">{money(item.lineTotal / item.quantity, cur)}</td>
                <td className="num">{money(item.lineTotal, cur)}</td>
              </tr>
            ))}
            {Array.from({ length: blankRows }, (_, i) => (
              <tr key={`blank-${i}`} className="blank"><td /><td /><td className="center">ADET</td><td /><td /></tr>
            ))}
          </tbody>
        </table>
        <p className="of-bank">ÇELMAK TARIM MAK. SAN. TİC. LTD. ŞTİ. işbank Balıkesir Şubesi İban TR69 0006 4000 0012 1003 4047 42</p>
        <table className="of-bottom">
          <colgroup><col style={{ width: "21%" }} /><col style={{ width: "43.5%" }} /><col style={{ width: "14.5%" }} /><col style={{ width: "21%" }} /></colgroup>
          <tbody>
            <tr className="of-delivery"><td className="center">TESLİM ŞEKLİ: BALIKESİR</td><td className="center"><b>İMZALI KAŞELİ OLARAK ONAYINIZI BEKLİYORUZ.</b></td><td /><td /></tr>
            <tr className="of-tall"><td rowSpan={2} className="center">ÖDEME</td>
              <td rowSpan={2} className="of-payment">
                <b>{method}{s.paymentMethod === "CREDIT_CARD" && s.cardInstallments && s.cardInstallments > 1 ? ` · ${s.cardInstallments} taksit` : ""}</b>
                {s.downPayment > 0 && <span>Peşinat: {money(s.downPayment, cur)}</span>}
                {s.advanceAmount > 0 && <span>Avanstan mahsup: {money(s.advanceAmount, cur)}</span>}
                {installments.slice(0, 6).map((row) => (
                  <span key={row.sequenceNo}>{row.sequenceNo}. vade {shortDate(row.dueDate)} · {paymentMethodLabels[row.paymentType] || row.paymentType} · {money(row.amount, row.currency)}</span>
                ))}
                {installments.length > 6 && <span>+ {installments.length - 6} vade daha (toplam {money(installments.reduce((t, x) => t + x.amount, 0), cur)})</span>}
                {cur !== "TRY" && <span>Döviz: {cur} · Kur {qty(s.exchangeRate)} · TL karşılığı {money(s.grandTotal * s.exchangeRate)}</span>}
                {s.note && <span className="of-note">Not: {s.note}</span>}
                {data.amendments?.length ? <span className="of-note">Revize edildi: {data.amendments.map((a) => `${a.number} (${shortDate(a.amendmentDate)})`).join(", ")}</span> : null}
              </td>
              <td>TOPLAM</td><td className="num"><b>{money(s.grandTotal, cur)}</b></td></tr>
            <tr className="of-tall"><td>BAKİYE:</td><td className="num">{money(remaining, cur)}</td></tr>
            <tr><td rowSpan={3} className="center of-last">{s.createdBy.toLocaleUpperCase("tr-TR")}</td>
              <td rowSpan={3} className="of-approval of-last"><b>MÜŞTERİ ONAYI:</b></td>
              <td>ARA TOPLAM</td><td className="num">{money(s.subtotal, cur)}</td></tr>
            <tr><td>{vatLabel}</td><td className="center">DAHİL <small>({money(s.vatTotal, cur)})</small></td></tr>
            <tr><td>GENEL TOPLAM</td><td className="num"><b>{money(s.grandTotal, cur)}</b></td></tr>
          </tbody>
        </table>
        <p className="of-disclaimer">Şirketimizin iş bu formun tamamını veya bir kısmını ve şartları tek taraflı olarak değiştirme veya iptal hakkını saklı tutar.</p>
        <table className="of-docinfo">
          <colgroup><col style={{ width: "21%" }} /><col style={{ width: "29.5%" }} /><col style={{ width: "28.5%" }} /><col style={{ width: "21%" }} /></colgroup>
          <tbody><tr><td>Doküman No : SP.FR.02</td><td>Yayın Tarihi : 04.11.2025</td><td>Revizyon Tarihi :</td><td>Rev : 00</td></tr></tbody>
        </table>
      </div>
    </PrintFrame>
  );
}

type ShipmentDoc = {
  shipment: { id?: number; number: string; status: string; plannedDate: string; actualDate?: string; deliveryAddress: string; vehiclePlate?: string; driverName?: string; dispatchNumber?: string; recipientName?: string; note?: string; saleNumber: string; customerName: string };
  items: { code: string; name: string; unit: string; quantity: number }[];
};

export function ShipmentPrint() {
  const { id } = useParams();
  const [data, setData] = useState<ShipmentDoc | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<ShipmentDoc>(`/shipments/${id}`).then(setData).catch((e) => setError(e.message));
  }, [id]);
  if (error) return <div className="error-box">{error}</div>;
  if (!data) return <div className="loading">Sevk formu hazırlanıyor…</div>;
  const sh = data.shipment;
  const total = data.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <PrintFrame title={`${sh.number} sevk formu`} fileName={`${sh.number} Sevk Formu`}>
      <DocHeader title="SEVK FORMU" number={sh.number} date={longDate(sh.actualDate || sh.plannedDate)} extra={<p><span>Sipariş</span><b>{sh.saleNumber}</b></p>} />
      <section className="doc-parties">
        <div>
          <small>TESLİM ALACAK</small>
          <b>{sh.customerName}</b>
          <span>{sh.deliveryAddress}</span>
          {sh.recipientName && <span>Teslim alan: {sh.recipientName}</span>}
        </div>
        <div>
          <small>SEVK BİLGİSİ</small>
          <span>Planlanan tarih: {longDate(sh.plannedDate)}</span>
          {sh.actualDate && <span>Çıkış tarihi: {longDate(sh.actualDate)}</span>}
          <span>Araç plakası: {sh.vehiclePlate || "—"}</span>
          <span>Şoför: {sh.driverName || "—"}</span>
          <span>İrsaliye no: {sh.dispatchNumber || "—"}</span>
          <span>Durum: {statusLabels[sh.status] || sh.status}</span>
        </div>
      </section>
      <table className="doc-table">
        <thead><tr><th>#</th><th>Ürün</th><th>Kod</th><th className="num">Miktar</th></tr></thead>
        <tbody>
          {data.items.map((item, index) => (
            <tr key={`${item.code}-${index}`}><td>{index + 1}</td><td><b>{item.name}</b></td><td>{item.code}</td><td className="num">{qty(item.quantity)} {item.unit}</td></tr>
          ))}
          <tr className="doc-total-row"><td colSpan={3}>Toplam</td><td className="num">{qty(total)}</td></tr>
        </tbody>
      </table>
      {sh.note && <p className="doc-note"><b>Not:</b> {sh.note}</p>}
      <section className="doc-signatures three">
        <div><span>Teslim eden · Çelmak</span></div>
        <div><span>Şoför</span></div>
        <div><span>Teslim alan</span></div>
      </section>
    </PrintFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Makine sipariş raporu                                               */
/* ------------------------------------------------------------------ */

type ReportRow = {
  customerId: number; customerCode: string; customerName: string; customerCity?: string; isDealer: number;
  productId: number; productName: string; model?: string; productGroup?: string; productSubgroup?: string;
  quantity: number; returnedQuantity: number; shippedQuantity: number; tryTotal: number; orderCount: number;
};
type Report = { from: string; to: string; includePending: boolean; rows: ReportRow[] };

export function MachineReport() {
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(todayIso());
  const [includePending, setIncludePending] = useState(false);
  const [dealersOnly, setDealersOnly] = useState(true);
  const [tab, setTab] = useState<"models" | "dealers">("models");
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!from || !to) return;
    api<Report>(`/reports/machine-orders?from=${from}&to=${to}&includePending=${includePending}`)
      .then((report) => {
        setError("");
        setData(report);
      })
      .catch((e) => setError(e.message));
  }, [from, to, includePending]);
  const rows = useMemo(() => data?.rows || [], [data]);
  const net = (row: { quantity: number; returnedQuantity: number }) => row.quantity - row.returnedQuantity;

  const modelGroups = useMemo(() => {
    type ModelTotal = { productName: string; model?: string; group: string; quantity: number; returned: number; shipped: number; customers: Set<number>; tryTotal: number };
    const byProduct = new Map<number, ModelTotal>();
    for (const row of rows) {
      const current = byProduct.get(row.productId) || { productName: row.productName, model: row.model, group: row.productGroup || "Diğer", quantity: 0, returned: 0, shipped: 0, customers: new Set<number>(), tryTotal: 0 };
      current.quantity += row.quantity;
      current.returned += row.returnedQuantity;
      current.shipped += row.shippedQuantity;
      current.tryTotal += row.tryTotal;
      current.customers.add(row.customerId);
      byProduct.set(row.productId, current);
    }
    const groups = new Map<string, ModelTotal[]>();
    for (const product of byProduct.values()) groups.set(product.group, [...(groups.get(product.group) || []), product]);
    return [...groups.entries()]
      .map(([group, products]) => ({ group, products: products.sort((a, b) => a.productName.localeCompare(b.productName, "tr")) }))
      .sort((a, b) => a.group.localeCompare(b.group, "tr"));
  }, [rows]);

  const dealerBlocks = useMemo(() => {
    const byCustomer = new Map<number, { name: string; code: string; city?: string; isDealer: boolean; lines: ReportRow[] }>();
    for (const row of rows) {
      if (dealersOnly && !row.isDealer) continue;
      const current = byCustomer.get(row.customerId) || { name: row.customerName, code: row.customerCode, city: row.customerCity, isDealer: Boolean(row.isDealer), lines: [] };
      current.lines.push(row);
      byCustomer.set(row.customerId, current);
    }
    return [...byCustomer.values()]
      .map((block) => ({ ...block, total: block.lines.reduce((sum, line) => sum + net(line), 0) }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "tr"));
  }, [rows, dealersOnly]);

  const totalMachines = rows.reduce((sum, row) => sum + net(row), 0);
  const totalShipped = rows.reduce((sum, row) => sum + row.shippedQuantity, 0);
  const dealerCount = new Set(rows.filter((row) => row.isDealer).map((row) => row.customerId)).size;
  const modelCount = new Set(rows.map((row) => row.productId)).size;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">RAPORLAR</span>
          <h1>Makine sipariş raporu</h1>
          <p>Hangi modelden toplam kaç makine sipariş edildiğini ve hangi bayiye kaç adet gittiğini görün.</p>
        </div>
        <button type="button" className="primary-btn no-print" onClick={() => window.print()}><Printer /> Yazdır / PDF</button>
      </div>
      <div className="no-print"><ReportTabs /></div>
      <section className="panel report-filters no-print">
        <label className="field"><span>Başlangıç</span><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="field"><span>Bitiş</span><input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="check-field"><input type="checkbox" checked={includePending} onChange={(e) => setIncludePending(e.target.checked)} /> Onay bekleyen siparişleri de say</label>
        <small>Sipariş tarihine göre süzülür. İade edilen makineler toplamdan düşülür.</small>
      </section>
      <p className="print-only report-range">{longDate(from)} – {longDate(to)} · {includePending ? "Onaylı + onay bekleyen" : "Yalnızca onaylı"} siparişler</p>
      {error && <div className="error-box">{error}</div>}
      <div className="metric-grid report-metrics">
        <div className="metric"><div><small>Toplam makine</small><strong>{qty(totalMachines)}</strong><p>İadeler düşülmüş net adet</p></div></div>
        <div className="metric"><div><small>Sevk edilen</small><strong>{qty(totalShipped)}</strong><p>Sevk bekleyen: {qty(Math.max(0, rows.reduce((s, r) => s + r.quantity, 0) - totalShipped))}</p></div></div>
        <div className="metric"><div><small>Model sayısı</small><strong>{modelCount}</strong><p>Sipariş alan farklı model</p></div></div>
        <div className="metric"><div><small>Bayi sayısı</small><strong>{dealerCount}</strong><p>Bu dönemde sipariş veren bayi</p></div></div>
      </div>
      <div className="detail-tabs no-print">
        <button className={tab === "models" ? "active" : ""} onClick={() => setTab("models")}>Model bazında toplam</button>
        <button className={tab === "dealers" ? "active" : ""} onClick={() => setTab("dealers")}>Bayi bazında dağılım</button>
      </div>
      {!data ? (
        <div className="loading inline-loading">Rapor hazırlanıyor…</div>
      ) : !rows.length ? (
        <section className="panel"><div className="empty-inline"><ChartColumn /><span>Seçilen tarih aralığında makine siparişi yok.</span></div></section>
      ) : tab === "models" ? (
        <section className="panel">
          <div className="table-wrap">
            <table className="report-table">
              <thead><tr><th>Model</th><th className="num">Sipariş</th><th className="num">İade</th><th className="num">Net adet</th><th className="num">Sevk edilen</th><th className="num">Sevk bekleyen</th><th className="num">Cari sayısı</th></tr></thead>
              <tbody>
                {modelGroups.map(({ group, products }) => (
                  <ReportGroup key={group} group={group} products={products} />
                ))}
                <tr className="report-grand"><td>Genel toplam</td><td className="num">{qty(rows.reduce((s, r) => s + r.quantity, 0))}</td><td className="num">{qty(rows.reduce((s, r) => s + r.returnedQuantity, 0))}</td><td className="num">{qty(totalMachines)}</td><td className="num">{qty(totalShipped)}</td><td className="num">{qty(Math.max(0, rows.reduce((s, r) => s + r.quantity, 0) - totalShipped))}</td><td /></tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="panel">
          <div className="toolbar no-print">
            <label className="check-field"><input type="checkbox" checked={dealersOnly} onChange={(e) => setDealersOnly(e.target.checked)} /> Yalnızca bayileri göster</label>
            <span>{dealerBlocks.length} cari</span>
          </div>
          {dealerBlocks.length ? (
            <div className="table-wrap">
              <table className="report-table">
                <thead><tr><th>{dealersOnly ? "Bayi" : "Cari"} / model</th><th className="num">Sipariş</th><th className="num">İade</th><th className="num">Net adet</th><th className="num">Sevk edilen</th><th className="num">Tutar (TL)</th></tr></thead>
                <tbody>
                  {dealerBlocks.map((block) => (
                    <DealerBlock key={block.code} block={block} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-inline"><span>{dealersOnly ? "Bu dönemde bayi olarak işaretli carilerden makine siparişi yok. Carinin türlerinde “Bayi” seçili olmalı." : "Kayıt yok."}</span></div>
          )}
        </section>
      )}
    </>
  );
}

function ReportGroup({ group, products }: { group: string; products: { productName: string; model?: string; quantity: number; returned: number; shipped: number; customers: Set<number> }[] }) {
  const sum = (pick: (p: (typeof products)[number]) => number) => products.reduce((total, p) => total + pick(p), 0);
  return (
    <>
      <tr className="report-group"><td>{group}</td><td className="num">{qty(sum((p) => p.quantity))}</td><td className="num">{qty(sum((p) => p.returned))}</td><td className="num">{qty(sum((p) => p.quantity - p.returned))}</td><td className="num">{qty(sum((p) => p.shipped))}</td><td className="num">{qty(Math.max(0, sum((p) => p.quantity - p.shipped)))}</td><td /></tr>
      {products.map((p) => (
        <tr key={p.productName}>
          <td className="indent"><b>{p.productName}</b>{p.model && <small>{p.model}</small>}</td>
          <td className="num">{qty(p.quantity)}</td>
          <td className="num">{p.returned ? qty(p.returned) : "—"}</td>
          <td className="num strong">{qty(p.quantity - p.returned)}</td>
          <td className="num">{qty(p.shipped)}</td>
          <td className="num">{qty(Math.max(0, p.quantity - p.shipped))}</td>
          <td className="num">{p.customers.size}</td>
        </tr>
      ))}
    </>
  );
}

function DealerBlock({ block }: { block: { name: string; code: string; city?: string; isDealer: boolean; total: number; lines: ReportRow[] } }) {
  return (
    <>
      <tr className="report-group">
        <td>{block.name}<small>{[block.code, block.city, block.isDealer ? "Bayi" : null].filter(Boolean).join(" · ")}</small></td>
        <td className="num">{qty(block.lines.reduce((s, l) => s + l.quantity, 0))}</td>
        <td className="num">{qty(block.lines.reduce((s, l) => s + l.returnedQuantity, 0))}</td>
        <td className="num">{qty(block.total)}</td>
        <td className="num">{qty(block.lines.reduce((s, l) => s + l.shippedQuantity, 0))}</td>
        <td className="num">{money(block.lines.reduce((s, l) => s + l.tryTotal, 0))}</td>
      </tr>
      {block.lines.map((line) => (
        <tr key={line.productId}>
          <td className="indent"><b>{line.productName}</b><small>{[line.productGroup, line.model].filter(Boolean).join(" · ")}</small></td>
          <td className="num">{qty(line.quantity)}</td>
          <td className="num">{line.returnedQuantity ? qty(line.returnedQuantity) : "—"}</td>
          <td className="num strong">{qty(line.quantity - line.returnedQuantity)}</td>
          <td className="num">{qty(line.shippedQuantity)}</td>
          <td className="num">{money(line.tryTotal)}</td>
        </tr>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Sipariş iadesi                                                      */
/* ------------------------------------------------------------------ */

export function SaleReturnPanel({ data, canReturn, onDone }: { data: SaleDoc; canReturn: boolean; onDone: (message: string) => void }) {
  const s = data.sale;
  const returnable = data.items.map((item) => ({ ...item, available: Math.max(0, Number((item.shippedQuantity - item.returnedQuantity).toFixed(4))) }));
  const anyReturnable = returnable.some((item) => item.available > 0);
  const approved = ["APPROVED", "COMPLETED"].includes(s.status);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = returnable.filter((item) => (quantities[item.id] || 0) > 0);
  const refund = selected.reduce((sum, item) => sum + (item.lineTotal / item.quantity) * quantities[item.id], 0);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ message: string }>(`/sales/${s.id}/returns`, {
        method: "POST",
        body: JSON.stringify({ returnDate: date, reason, items: selected.map((item) => ({ saleItemId: item.id, quantity: quantities[item.id] })) }),
      });
      setOpen(false);
      setQuantities({});
      setReason("");
      onDone(result.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!approved && !data.returns.length) return null;
  return (
    <section className="panel sale-returns">
      <div className="panel-title">
        <h2>İadeler</h2>
        {canReturn && approved && !open && (
          <button type="button" className="mini-btn" disabled={!anyReturnable} title={anyReturnable ? "" : "İade yalnızca sevk edilmiş ürünler için alınabilir."} onClick={() => setOpen(true)}>
            <Undo2 /> İade al
          </button>
        )}
      </div>
      {approved && !anyReturnable && !data.returns.length && (
        <p className="info-note pad">Bu siparişte iade alınabilecek ürün yok. İade yalnızca sevk edilmiş miktar için yapılabilir.</p>
      )}
      {open && (
        <form className="return-form" onSubmit={submit}>
          <div className="form-grid">
            <label className="field"><span>İade tarihi</span><input type="date" required value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="field wide"><span>İade nedeni</span><input required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Örn. Hasarlı teslim, yanlış model…" /></label>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ürün</th><th className="num">Sevk edilen</th><th className="num">Önceki iade</th><th className="num">İade adedi</th></tr></thead>
              <tbody>
                {returnable.map((item) => (
                  <tr key={item.id}>
                    <td><b>{item.name}</b><small>{item.code}</small></td>
                    <td className="num">{qty(item.shippedQuantity)}</td>
                    <td className="num">{qty(item.returnedQuantity)}</td>
                    <td className="num">
                      <input className="qty-input" type="number" min="0" max={item.available} step="1" disabled={!item.available} value={quantities[item.id] || ""} placeholder={item.available ? `en fazla ${qty(item.available)}` : "—"} onChange={(e) => setQuantities({ ...quantities, [item.id]: Math.min(item.available, Math.max(0, Number(e.target.value))) })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="return-summary">
            <span>Cariye alacak olarak işlenecek tutar (KDV dahil)</span>
            <b>{money(refund, s.currency)}</b>
          </div>
          <p className="info-note">İade onaylandığında tutar {s.customerName} carisine alacak olarak işlenir. Cari zaten ödediyse bu tutar avans olarak kalır; nakit iade gerekiyorsa Tahsilatlar ekranından yapılır.</p>
          {error && <div className="error-box">{error}</div>}
          <div className="head-actions">
            <button type="button" className="mini-btn" onClick={() => setOpen(false)} disabled={busy}>Vazgeç</button>
            <button className="primary-btn" disabled={busy || !selected.length || reason.trim().length < 3}>{busy ? "Kaydediliyor…" : "İadeyi kaydet"}</button>
          </div>
        </form>
      )}
      {data.returns.length > 0 && (
        <div className="compact-list">
          {data.returns.map((r) => (
            <div key={r.id}>
              <span>
                <b>{r.number} · {longDate(r.returnDate)}</b>
                <small>{r.items.map((item) => `${qty(item.quantity)} ${item.unit} ${item.name}`).join(", ")} — {r.reason}</small>
              </span>
              <strong>{money(r.grandTotal, r.currency)}<small>{r.createdBy}</small></strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Onaylı sipariş revizyonu                                            */
/* ------------------------------------------------------------------ */

type PlanRow = { paymentType: string; dueDate: string; amount: number };
const planTypeLabels: Record<string, string> = { BANK_TRANSFER: "Havale / EFT", CHECK: "Çek", PROMISSORY_NOTE: "Senet" };
const settlementLabels: Record<string, string> = {
  REPLAN: "Ödeme planı değiştirildi",
  OPEN_ACCOUNT: "Açık cari (Tahsilatlar'dan alınacak)",
  BANK_TRANSFER: "Vadeli havale / EFT",
  CHECK: "Çek",
  PROMISSORY_NOTE: "Senet",
  NONE: "—",
};
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

type AmendLine = { key: string; saleItemId?: number; productId: number; name: string; detail: string; quantity: number; unitPrice: number; vatRate: number; shipped: number; returned: number; original?: { quantity: number; lineTotal: number } };

export function SaleAmendPanel({ data, canAmend, onDone }: { data: SaleDoc; canAmend: boolean; onDone: (message: string) => void }) {
  const s = data.sale;
  const approved = ["APPROVED", "COMPLETED"].includes(s.status);
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<AmendLine[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(todayIso());
  const [settlement, setSettlement] = useState("OPEN_ACCOUNT");
  const [dueDate, setDueDate] = useState(addDays(todayIso(), 30));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Ödeme planını değiştirme: ödenmemiş ve evrakı teslim alınmamış vadeler iptal edilip yeni plan kurulur.
  const [planMode, setPlanMode] = useState<"KEEP" | "REPLAN">("KEEP");
  const [plan, setPlan] = useState<PlanRow[]>([]);
  const [planCount, setPlanCount] = useState(1);
  const amendments = data.amendments || [];
  const replaceable = data.schedule.filter((x) => x.sequenceNo > 0 && ["PLANNED", "INSTRUMENT_CREATED"].includes(x.status) && x.paidAmount < 0.005 && ["BANK_TRANSFER", "CHECK", "PROMISSORY_NOTE"].includes(x.paymentType) && (!x.instrumentId || x.instrumentStatus === "PLANNED"));
  const fixedRows = data.schedule.filter((x) => x.sequenceNo > 0 && !replaceable.includes(x) && x.status !== "PAID");
  const openTotal = Number(replaceable.reduce((t, x) => t + x.amount, 0).toFixed(2));

  const start = () => {
    setLines(data.items.map((item) => ({
      key: `item-${item.id}`, saleItemId: item.id, productId: item.productId, name: item.name, detail: [item.model, item.code].filter(Boolean).join(" · "),
      quantity: item.quantity, unitPrice: Number((item.lineTotal / item.quantity).toFixed(2)), vatRate: item.vatRate,
      shipped: item.shippedQuantity, returned: item.returnedQuantity, original: { quantity: item.quantity, lineTotal: item.lineTotal },
    })));
    setReason(""); setError(""); setSearch(""); setSettlement("OPEN_ACCOUNT"); setDate(todayIso()); setDueDate(addDays(todayIso(), 30));
    setPlanMode("KEEP"); setPlan(replaceable.map((x) => ({ paymentType: x.paymentType, dueDate: x.dueDate, amount: x.amount }))); setPlanCount(Math.max(1, replaceable.length));
    setOpen(true);
    if (!products.length) api<Product[]>("/products").then(setProducts).catch((e) => setError(e.message));
  };

  const lineTotal = (l: AmendLine) => Number((l.unitPrice * l.quantity).toFixed(2));
  const newTotal = Number(lines.reduce((sum, l) => sum + lineTotal(l), 0).toFixed(2));
  const difference = Number((newTotal - s.grandTotal).toFixed(2));
  // Sunucudaki hesapla aynı: siparişin plana bağlanmamış ödenmemiş kısmı (bkz. paymentPlanTarget).
  const fixedPlanned = data.schedule.filter((x) => x.sequenceNo > 0 && !replaceable.includes(x)).reduce((t, x) => t + x.amount, 0);
  const returnedTotal = (data.returns || []).reduce((t, r) => t + r.grandTotal, 0);
  const planTarget = Number(Math.max(0, ["CASH", "CREDIT_CARD"].includes(s.paymentMethod) ? openTotal + difference : newTotal - s.downPayment - s.advanceAmount - returnedTotal - fixedPlanned).toFixed(2));
  const planTotal = Number(plan.reduce((t, x) => t + x.amount, 0).toFixed(2));
  const planMismatch = planMode === "REPLAN" && plan.length > 0 && Math.abs(planTotal - planTarget) > 0.01;
  const planInvalid = planMode === "REPLAN" && (planMismatch || plan.some((x) => x.amount <= 0 || !x.dueDate || x.dueDate < date) || (!plan.length && planTarget > 0.009 && !replaceable.length));
  const distribute = (count: number, type?: string) => {
    const n = Math.max(1, Math.min(24, count));
    const base = Math.floor((planTarget / n) * 100) / 100;
    const firstDue = plan[0]?.dueDate && plan[0].dueDate >= date ? plan[0].dueDate : addDays(date, 30);
    setPlan(Array.from({ length: n }, (_, i) => ({
      paymentType: type || plan[i]?.paymentType || plan[0]?.paymentType || "CHECK",
      dueDate: plan[i]?.dueDate && plan[i].dueDate >= date && i < plan.length ? plan[i].dueDate : addDays(firstDue, 30 * i),
      amount: i === n - 1 ? Number((planTarget - base * i).toFixed(2)) : base,
    })));
  };
  const setAllTypes = (type: string) => setPlan((cur) => (cur.length ? cur.map((x) => ({ ...x, paymentType: type })) : [{ paymentType: type, dueDate: addDays(date, 30), amount: planTarget }]));
  const patchPlan = (index: number, change: Partial<PlanRow>) => setPlan((cur) => cur.map((x, i) => (i === index ? { ...x, ...change } : x)));
  const changed = lines.some((l) => !l.original || l.quantity !== l.original.quantity || Math.abs(lineTotal(l) - l.original.lineTotal) >= 0.01);
  const invalid = lines.find((l) => l.quantity < l.shipped || (l.quantity > 0 && l.unitPrice <= 0));
  const kindOk = (p: Product) => (s.orderKind === "SPARE_PART" ? p.partCategory !== "MACHINE" : p.partCategory === "MACHINE");
  const words = search.trim().toLocaleLowerCase("tr-TR").split(/\s+/).filter(Boolean);
  const hits = words.length
    ? products.filter((p) => kindOk(p) && !lines.some((l) => l.productId === p.id) && words.every((w) => `${p.name} ${p.code} ${p.manufacturerModel || ""} ${p.productGroup || ""}`.toLocaleLowerCase("tr-TR").includes(w))).slice(0, 8)
    : [];
  const addProduct = (p: Product) => {
    const vat = (VAT_RATES as readonly number[]).includes(p.vatRate) ? p.vatRate : 20;
    const net = s.currency === "TRY" ? p.unitPrice : p.unitPrice / s.exchangeRate;
    setLines((cur) => [...cur, { key: `new-${p.id}`, productId: p.id, name: p.name, detail: [p.manufacturerModel, p.productGroup].filter(Boolean).join(" · ") || p.code, quantity: 1, unitPrice: p.manualPrice ? 0 : Number((net * (1 + vat / 100)).toFixed(2)), vatRate: vat, shipped: 0, returned: 0 }]);
    setSearch("");
  };
  const patch = (key: string, change: Partial<AmendLine>) => setLines((cur) => cur.map((l) => (l.key === key ? { ...l, ...change } : l)));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ message: string }>(`/sales/${s.id}/amendments`, {
        method: "POST",
        body: JSON.stringify({
          amendmentDate: date, reason,
          items: lines.filter((l) => l.saleItemId || l.quantity > 0).map((l) => ({ saleItemId: l.saleItemId, productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice, vatRate: l.vatRate })),
          settlement: planMode === "KEEP" && difference > 0 ? settlement : "OPEN_ACCOUNT",
          settlementDueDate: planMode === "KEEP" && difference > 0 && settlement !== "OPEN_ACCOUNT" ? dueDate : undefined,
          paymentPlan: planMode === "REPLAN" ? plan : undefined,
        }),
      });
      setOpen(false);
      onDone(result.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!approved && !amendments.length) return null;
  return (
    <section className="panel sale-amend">
      <div className="panel-title">
        <h2>Sipariş revizyonları</h2>
        {canAmend && approved && !open && <button type="button" className="mini-btn" onClick={start}><PencilLine /> Siparişi / ödeme şeklini revize et</button>}
      </div>
      {open && (
        <form className="amend-form" onSubmit={submit}>
          <p className="info-note">Miktar ve fiyatları değiştirin, ürün ekleyin veya çıkarın. Fiyatlar KDV dahildir. Sevk edilmiş miktarın altına inilemez (azaltmak için iade kullanın). Kaydedince fark cariye işlenir ve revizyon geçmişe yazılır.</p>
          <div className="table-wrap">
            <table className="amend-table">
              <thead><tr><th>Ürün</th><th className="num">Sevk edilen</th><th>Miktar</th><th>Birim fiyat (KDV dahil)</th><th>KDV</th><th className="num">Tutar</th><th /></tr></thead>
              <tbody>
                {lines.map((l) => {
                  const removed = l.quantity === 0;
                  const changedLine = !l.original || l.quantity !== l.original.quantity || Math.abs(lineTotal(l) - l.original.lineTotal) >= 0.01;
                  return (
                    <tr key={l.key} className={removed ? "muted-row" : changedLine ? "changed-row" : ""}>
                      <td><b>{l.name}</b><small>{l.detail}{!l.original ? " · yeni kalem" : l.original.quantity !== l.quantity ? ` · önce ${qty(l.original.quantity)}` : ""}</small></td>
                      <td className="num">{l.original ? qty(l.shipped) : "—"}</td>
                      <td><input className="qty-input" type="number" min={l.shipped} step="1" value={l.quantity} onChange={(e) => patch(l.key, { quantity: Math.max(0, Number(e.target.value)) })} aria-label={`${l.name} miktarı`} />{l.quantity < l.shipped && <small className="danger-text">En az {qty(l.shipped)}</small>}</td>
                      <td><MoneyInput currency={s.currency} value={l.unitPrice} invalid={l.quantity > 0 && l.unitPrice <= 0} onChange={(v) => patch(l.key, { unitPrice: v })} /></td>
                      <td><select value={l.vatRate} onChange={(e) => patch(l.key, { vatRate: Number(e.target.value) })}>{VAT_RATES.map((r) => <option key={r} value={r}>%{r}</option>)}</select></td>
                      <td className="num"><b>{money(lineTotal(l), s.currency)}</b></td>
                      <td>{l.original ? <button type="button" className="mini-btn" disabled={l.shipped > 0 || l.returned > 0 || removed} title={l.shipped > 0 ? "Sevk edilmiş kalem çıkarılamaz" : "Kalemi çıkar"} onClick={() => patch(l.key, { quantity: 0 })}><X /></button> : <button type="button" className="mini-btn" title="Kalemi kaldır" onClick={() => setLines((cur) => cur.filter((x) => x.key !== l.key))}><X /></button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="amend-add">
            <label className="search-input"><Plus /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={s.orderKind === "SPARE_PART" ? "Parça ekle: kod veya ad yazın" : "Ürün ekle: model veya ad yazın (ör. silaj)"} /></label>
            {hits.length > 0 && <div className="amend-hits">{hits.map((p) => <button type="button" key={p.id} onClick={() => addProduct(p)}><b>{p.name}</b><small>{[p.manufacturerModel, p.productGroup, p.code].filter(Boolean).join(" · ")}</small></button>)}</div>}
            {words.length > 0 && !hits.length && <small className="muted-note">Eşleşen ürün yok.</small>}
          </div>
          <div className="amend-summary">
            <div><small>Önceki toplam</small><b>{money(s.grandTotal, s.currency)}</b></div>
            <div><small>Yeni toplam</small><b>{money(newTotal, s.currency)}</b></div>
            <div className={difference > 0.009 ? "diff-up" : difference < -0.009 ? "diff-down" : ""}>
              <small>Fark</small>
              <b>{difference > 0 ? "+" : difference < 0 ? "−" : ""}{money(Math.abs(difference), s.currency)}</b>
              <span>{difference > 0.009 ? "Bayiden alınacak ek tutar (cariye borç)" : difference < -0.009 ? "Bayiye alacak / avans olarak işlenir" : "Tutar değişmiyor"}</span>
            </div>
          </div>
          <div className="amend-plan-mode">
            <b>Ödeme</b>
            <div className="chip-filters">
              <button type="button" className={planMode === "KEEP" ? "active" : ""} onClick={() => setPlanMode("KEEP")}>Ödeme planı aynı kalsın</button>
              <button type="button" className={planMode === "REPLAN" ? "active" : ""} onClick={() => { setPlanMode("REPLAN"); if (!plan.length && planTarget > 0) setPlan([{ paymentType: "CHECK", dueDate: addDays(date, 30), amount: planTarget }]); }}>Ödeme şeklini / planını değiştir</button>
            </div>
          </div>
          {planMode === "KEEP" && difference > 0.009 && (
            <div className="amend-settlement">
              <b>Fark nasıl ödenecek?</b>
              <div className="chip-filters">{["OPEN_ACCOUNT", "BANK_TRANSFER", "CHECK", "PROMISSORY_NOTE"].map((v) => <button type="button" key={v} className={settlement === v ? "active" : ""} onClick={() => setSettlement(v)}>{settlementLabels[v]}</button>)}</div>
              {settlement !== "OPEN_ACCOUNT" && <label className="field"><span>Vade tarihi</span><input type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>}
              <small className="muted-note">{settlement === "OPEN_ACCOUNT" ? "Fark cari bakiyeye eklenir; ödeme gelince Tahsilatlar ekranından girilir." : settlement === "BANK_TRANSFER" ? "Ödeme planına vadeli havale satırı eklenir." : "Ödeme planına eklenir ve Çek ve Senetler ekranında planlı evrak oluşur."}</small>
            </div>
          )}
          {planMode === "REPLAN" && (
            <div className="amend-replan">
              <div className="replan-summary">
                <div><small>İptal edilip yeniden planlanacak vadeler</small><b>{money(openTotal, s.currency)}</b><span>{replaceable.length ? replaceable.map((x) => `${planTypeLabels[x.paymentType] || x.paymentType} ${longDate(x.dueDate)}`).join(" · ") : "Açık vade yok"}</span></div>
                {Math.abs(difference) > 0.009 && <div><small>Revizyon farkı</small><b>{difference > 0 ? "+" : "−"}{money(Math.abs(difference), s.currency)}</b></div>}
                <div className="target"><small>Siparişin ödenmemiş kısmı · yeni plan toplamı</small><b>{money(planTarget, s.currency)}</b>{Math.abs(planTarget - openTotal - difference) > 0.009 && <span>Önceki plan siparişle uyuşmuyordu; yeni plan güncel tutara göre kurulur.</span>}</div>
              </div>
              {fixedRows.length > 0 && <p className="muted-note">Değişmeyecek: {fixedRows.map((x) => `${planTypeLabels[x.paymentType] || x.paymentType} ${longDate(x.dueDate)} ${money(x.amount - x.paidAmount, x.currency)}${x.instrumentStatus && x.instrumentStatus !== "PLANNED" ? " (evrak teslim alındı)" : x.paidAmount > 0 ? " (kısmen ödendi)" : ""}`).join(" · ")}</p>}
              {planTarget > 0.009 && (
                <>
                  <div className="replan-tools">
                    <span>Hepsini şuna çevir:</span>
                    <div className="chip-filters">{["BANK_TRANSFER", "CHECK", "PROMISSORY_NOTE"].map((t) => <button type="button" key={t} className={plan.length > 0 && plan.every((x) => x.paymentType === t) ? "active" : ""} onClick={() => setAllTypes(t)}>{planTypeLabels[t]}</button>)}</div>
                    <label className="field"><span>Taksit sayısı</span><input type="number" min={1} max={24} value={planCount} onChange={(e) => setPlanCount(Number(e.target.value))} /></label>
                    <button type="button" className="mini-btn" onClick={() => distribute(planCount)}>Tutarı eşit dağıt</button>
                  </div>
                  <div className="replan-rows">
                    {plan.map((row, i) => (
                      <div key={i}>
                        <span className="row-no">{i + 1}.</span>
                        <select value={row.paymentType} onChange={(e) => patchPlan(i, { paymentType: e.target.value })} aria-label={`${i + 1}. ödeme şekli`}>{["BANK_TRANSFER", "CHECK", "PROMISSORY_NOTE"].map((t) => <option key={t} value={t}>{planTypeLabels[t]}</option>)}</select>
                        <input type="date" min={date} value={row.dueDate} onChange={(e) => patchPlan(i, { dueDate: e.target.value })} aria-label={`${i + 1}. vade`} />
                        <MoneyInput currency={s.currency} value={row.amount} invalid={row.amount <= 0} onChange={(v) => patchPlan(i, { amount: v })} />
                        <button type="button" className="mini-btn" title="Satırı sil" onClick={() => setPlan((cur) => cur.filter((_, j) => j !== i))}><X /></button>
                      </div>
                    ))}
                    <button type="button" className="mini-btn" onClick={() => setPlan((cur) => [...cur, { paymentType: cur[cur.length - 1]?.paymentType || "CHECK", dueDate: addDays(cur[cur.length - 1]?.dueDate || date, 30), amount: Math.max(0, Number((planTarget - planTotal).toFixed(2))) }])}><Plus /> Vade ekle</button>
                  </div>
                  <p className={planMismatch ? "danger-text" : "muted-note"}>Plan toplamı {money(planTotal, s.currency)}{planMismatch ? ` · ${money(Math.abs(planTarget - planTotal), s.currency)} ${planTotal < planTarget ? "eksik" : "fazla"}` : " · tutuyor"}{!plan.length ? " · plan boş: tutar açık cariye kalır" : ""}</p>
                  {plan.some((x) => x.dueDate < date) && <small className="danger-text replan-warning">Bazı vadeler revizyon tarihinden ({longDate(date)}) önce; bu satırlara yeni vade tarihi girin.</small>}
                </>
              )}
              <small className="muted-note">Eski vadeler ve henüz teslim alınmamış çek/senetler iptal edilir; yeni çek/senetler Çek ve Senetler ekranında planlı evrak olarak oluşur. Teslim alınmış evrak ve ödenmiş vadeler değişmez.</small>
            </div>
          )}
          <div className="form-grid">
            <label className="field"><span>Revizyon tarihi</span><input type="date" required max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="field wide"><span>Revizyon nedeni</span><input required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Örn. Bayi 10 tamburlu yerine 8 tamburlu + 2 silaj istedi" /></label>
          </div>
          {error && <div className="error-box">{error}</div>}
          <div className="head-actions">
            <button type="button" className="mini-btn" onClick={() => setOpen(false)} disabled={busy}>Vazgeç</button>
            <button className="primary-btn" disabled={busy || (!changed && planMode !== "REPLAN") || Boolean(invalid) || planInvalid || reason.trim().length < 3 || !lines.some((l) => l.quantity > 0)}>{busy ? "Kaydediliyor…" : "Revizyonu kaydet"}</button>
          </div>
        </form>
      )}
      {!open && !amendments.length && <p className="info-note pad">Bu sipariş henüz revize edilmedi.{canAmend ? " Bayi kalem veya fiyat değişikliği isterse “Siparişi revize et” ile güncelleyin; fark cariye otomatik işlenir." : ""}</p>}
      {amendments.length > 0 && (
        <div className="compact-list amend-history">
          {amendments.map((a) => (
            <div key={a.id}>
              <span>
                <b>{a.number} · {longDate(a.amendmentDate)} · {a.createdBy}</b>
                <small>{a.reason}</small>
                {a.paymentPlan && <small>Ödeme planı: {a.paymentPlan.replaced.length ? a.paymentPlan.replaced.map((x) => `${planTypeLabels[x.paymentType] || x.paymentType} ${money(x.amount, a.currency)}`).join(", ") : "açık cari"} → {a.paymentPlan.plan.length ? a.paymentPlan.plan.map((x) => `${planTypeLabels[x.paymentType] || x.paymentType} ${shortDate(x.dueDate)} ${money(x.amount, a.currency)}`).join(", ") : "açık cari"}</small>}
                <small>{a.changes.map((c) => c.oldQuantity === 0 ? `+ ${qty(c.newQuantity)} ${c.product}` : c.newQuantity === 0 ? `− ${c.product} çıkarıldı` : c.oldQuantity !== c.newQuantity ? `${c.product}: ${qty(c.oldQuantity)} → ${qty(c.newQuantity)}` : `${c.product}: fiyat ${money(c.oldTotal, a.currency)} → ${money(c.newTotal, a.currency)}`).join(" · ")}</small>
              </span>
              <strong className={a.difference > 0 ? "diff-up" : a.difference < 0 ? "diff-down" : ""}>{a.difference > 0 ? "+" : a.difference < 0 ? "−" : ""}{money(Math.abs(a.difference), a.currency)}<small>{a.settlement === "REPLAN" ? settlementLabels.REPLAN : a.difference > 0 ? settlementLabels[a.settlement] + (a.settlementDueDate ? ` · ${longDate(a.settlementDueDate)}` : "") : `${money(a.previousTotal, a.currency)} → ${money(a.newTotal, a.currency)}`}</small></strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
