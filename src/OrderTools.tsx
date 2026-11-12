import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChartColumn, Pencil, Printer, StickyNote, TriangleAlert, Undo2 } from "lucide-react";
import { api } from "./api";
import { currencySymbol, money, paymentMethodLabels, statusLabels } from "./types";

/* ------------------------------------------------------------------ */
/* Ortak yardımcılar                                                   */
/* ------------------------------------------------------------------ */

const longDate = (value?: string | null) => {
  if (!value) return "—";
  const date = value.length > 10 ? new Date(value.replace(" ", "T") + "Z") : new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "long" }).format(date);
};
const todayIso = () => new Date().toISOString().slice(0, 10);
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
}: {
  value: number;
  onChange: (value: number) => void;
  currency?: string;
  required?: boolean;
  placeholder?: string;
  invalid?: boolean;
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
    id: number; number: string; status: string; note?: string; paymentMethod: string; cardInstallments?: number | null;
    subtotal: number; vatTotal: number; grandTotal: number; downPayment: number; advanceAmount: number;
    currency: string; exchangeRate: number; createdAt: string; approvedAt?: string | null;
    customerId: number; customerCode: string; customerName: string; customerTaxNumber?: string; customerPhone?: string; customerEmail?: string; customerCity?: string;
    createdBy: string; approvalAssignee?: string;
  };
  items: { id: number; code: string; name: string; unit: string; model?: string; productGroup?: string; quantity: number; unitPrice: number; vatRate: number; lineTotal: number; shippedQuantity: number; returnedQuantity: number }[];
  schedule: { sequenceNo: number; paymentType: string; dueDate: string; amount: number; paidAmount: number; currency: string; status: string }[];
  shipments: { id: number; number: string; status: string; plannedDate: string; actualDate?: string; dispatchNumber?: string }[];
  returns: { id: number; number: string; returnDate: string; reason: string; subtotal: number; vatTotal: number; grandTotal: number; currency: string; createdBy: string; items: { quantity: number; lineTotal: number; name: string; code: string; unit: string }[] }[];
};
export type { SaleDoc };

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
  const remaining = Math.max(0, s.grandTotal - s.downPayment - s.advanceAmount);
  const method = paymentMethodLabels[s.paymentMethod] || s.paymentMethod;
  return (
    <PrintFrame title={`${s.number} sipariş formu`} fileName={`${s.number} Siparis Formu`}>
      <DocHeader title="SİPARİŞ FORMU" number={s.number} date={longDate(s.createdAt)} extra={<p><span>Durum</span><b>{statusLabels[s.status] || s.status}</b></p>} />
      <section className="doc-parties">
        <div>
          <small>ALICI</small>
          <b>{s.customerName}</b>
          <span>Cari kodu: {s.customerCode}</span>
          {s.customerTaxNumber && <span>Vergi no: {s.customerTaxNumber}</span>}
          {s.customerCity && <span>{s.customerCity}</span>}
          {s.customerPhone && <span>Tel: {s.customerPhone}</span>}
        </div>
        <div>
          <small>SİPARİŞ BİLGİSİ</small>
          <span>Hazırlayan: {s.createdBy}</span>
          <span>Onay: {s.approvalAssignee || "—"}{s.approvedAt ? ` · ${longDate(s.approvedAt)}` : ""}</span>
          <span>Para birimi: {s.currency}{s.currency !== "TRY" ? ` · Kur ${s.exchangeRate}` : ""}</span>
          <span>Ödeme: {method}{s.paymentMethod === "CREDIT_CARD" && s.cardInstallments && s.cardInstallments > 1 ? ` · ${s.cardInstallments} taksit` : ""}</span>
        </div>
      </section>
      <table className="doc-table">
        <thead>
          <tr><th>#</th><th>Ürün / model</th><th className="num">Miktar</th><th className="num">Birim fiyat (KDV dahil)</th><th className="num">KDV</th><th className="num">Tutar (KDV dahil)</th></tr>
        </thead>
        <tbody>
          {data.items.map((item, index) => (
            <tr key={item.id}>
              <td>{index + 1}</td>
              <td><b>{item.name}</b><small>{[item.model, item.productGroup, item.code].filter(Boolean).join(" · ")}</small></td>
              <td className="num">{qty(item.quantity)} {item.unit}</td>
              <td className="num">{money(item.lineTotal / item.quantity, s.currency)}</td>
              <td className="num">%{item.vatRate}</td>
              <td className="num">{money(item.lineTotal, s.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <section className="doc-bottom">
        <div className="doc-payment">
          <h2>Ödeme planı</h2>
          {data.schedule.length ? (
            <table className="doc-table compact">
              <thead><tr><th>#</th><th>Tür</th><th>Vade</th><th className="num">Tutar</th></tr></thead>
              <tbody>
                {data.schedule.map((row) => (
                  <tr key={row.sequenceNo}><td>{row.sequenceNo === 0 ? "Peşinat" : row.sequenceNo}</td><td>{paymentMethodLabels[row.paymentType] || row.paymentType}</td><td>{longDate(row.dueDate)}</td><td className="num">{money(row.amount, row.currency)}</td></tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>{s.paymentMethod === "CREDIT_CARD" ? "Kredi kartı ile tahsil edilecek." : s.paymentMethod === "CASH" ? "Peşin tahsil edilecek." : "Ödeme planı yok."}</p>
          )}
          {s.note && <p className="doc-note"><b>Not:</b> {s.note}</p>}
        </div>
        <div className="doc-totals">
          <p><span>Ara toplam (KDV hariç)</span><b>{money(s.subtotal, s.currency)}</b></p>
          <p><span>KDV</span><b>{money(s.vatTotal, s.currency)}</b></p>
          <p className="grand"><span>Genel toplam</span><b>{money(s.grandTotal, s.currency)}</b></p>
          {s.downPayment > 0 && <p><span>Peşinat</span><b>− {money(s.downPayment, s.currency)}</b></p>}
          {s.advanceAmount > 0 && <p><span>Cari avansından mahsup</span><b>− {money(s.advanceAmount, s.currency)}</b></p>}
          <p><span>Kalan ödeme</span><b>{money(remaining, s.currency)}</b></p>
          {s.currency !== "TRY" && <p><span>TL karşılığı</span><b>{money(s.grandTotal * s.exchangeRate)}</b></p>}
        </div>
      </section>
      <section className="doc-signatures">
        <div><span>Satıcı · Çelmak</span></div>
        <div><span>Alıcı · {s.customerName}</span></div>
      </section>
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
