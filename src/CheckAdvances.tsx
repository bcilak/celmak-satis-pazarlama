import { useEffect, useState, type FormEvent } from "react";
import { NavLink } from "react-router-dom";
import { api } from "./api";
import { statusLabels } from "./types";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const money = (n: number, currency = "TRY") => new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(n);
const newCheck = () => ({ key: crypto.randomUUID(), amount: "", issuer: "", serialNumber: "", bankName: "", issueDate: today(), dueDate: today() });
type CheckRow = ReturnType<typeof newCheck>;

export function CheckAdvanceForm({ customerId, onSaved, onCancel }: { customerId: number; onSaved: (message: string) => void; onCancel: () => void }) {
  const [checks, setChecks] = useState<CheckRow[]>([newCheck()]);
  const [currency, setCurrency] = useState("TRY");
  const [rate, setRate] = useState(1);
  const [target, setTarget] = useState("");
  const [receivedDate, setReceivedDate] = useState(today);
  const [note, setNote] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const total = Math.round(checks.reduce((sum, c) => sum + (Number(c.amount) || 0), 0) * 100) / 100;
  const difference = Math.round((total - Number(target)) * 100) / 100;
  const change = (key: string, field: keyof CheckRow, value: string) => setChecks(rows => rows.map(c => c.key === key ? { ...c, [field]: value } : c));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await api<{ message: string }>("/receipts/check-advances", { method: "POST", body: JSON.stringify({ requestId, customerId, currency, exchangeRate: currency === "TRY" ? 1 : rate, receivedDate, targetAmount: target ? Number(target) : undefined, note, checks: checks.map(c => ({ amount: Number(c.amount), issuer: c.issuer, bankName: c.bankName, serialNumber: c.serialNumber, issueDate: c.issueDate, dueDate: c.dueDate })) }) });
      setChecks([newCheck()]); setTarget(""); setNote(""); setRequestId(crypto.randomUUID());
      onSaved(result.message);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <form className="panel receipt-form check-advance-form" onSubmit={save}>
    <h2>Çeklerle bağlantı avansı</h2>
    <p>Her çekin tutarını ayrı girin. Çekler tek işlemde portföye ve cari hesaba kaydedilir; bankada tahsil edilmiş sayılmaz.</p>
    {error && <div className="error-box" role="alert">{error}</div>}
    <fieldset disabled={busy}>
      <div className="form-grid">
        <label className="field"><span>Bağlantı hedef tutarı (isteğe bağlı)</span><input type="number" min="0.01" step="0.01" value={target} onChange={e => setTarget(e.target.value)} placeholder="Örn. 2000000" /></label>
        <label className="field"><span>Çeklerin teslim alındığı tarih</span><input required type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} /></label>
        <label className="field"><span>Para birimi</span><select value={currency} onChange={e => { setCurrency(e.target.value); setRate(1); }}><option>TRY</option><option>USD</option><option>EUR</option></select></label>
        <label className="field"><span>Teslim alma kuru</span><input required type="number" min="0.0001" step="0.0001" readOnly={currency === "TRY"} value={rate} onChange={e => setRate(Number(e.target.value))} /></label>
      </div>
      {checks.map((c, index) => <section className="advance-check-row" key={c.key}>
        <div className="head-actions"><h3>{index + 1}. çek</h3><button type="button" className="mini-btn" disabled={checks.length === 1} onClick={() => setChecks(rows => rows.filter(x => x.key !== c.key))}>Çeki kaldır</button></div>
        <div className="form-grid">
          <label className="field"><span>Çek tutarı ({currency})</span><input required type="number" min="0.01" step="0.01" value={c.amount} onChange={e => change(c.key, "amount", e.target.value)} /></label>
          <label className="field"><span>Keşideci / borçlu</span><input required minLength={2} maxLength={160} value={c.issuer} onChange={e => change(c.key, "issuer", e.target.value)} /></label>
          <label className="field"><span>Banka</span><input required minLength={2} maxLength={120} value={c.bankName} onChange={e => change(c.key, "bankName", e.target.value)} /></label>
          <label className="field"><span>Seri / çek numarası</span><input required maxLength={80} value={c.serialNumber} onChange={e => change(c.key, "serialNumber", e.target.value)} /></label>
          <label className="field"><span>Düzenleme tarihi</span><input required type="date" value={c.issueDate} onChange={e => change(c.key, "issueDate", e.target.value)} /></label>
          <label className="field"><span>Vade tarihi</span><input required type="date" min={c.issueDate} value={c.dueDate} onChange={e => change(c.key, "dueDate", e.target.value)} /></label>
        </div>
      </section>)}
      <button type="button" className="mini-btn" disabled={checks.length >= 100} onClick={() => setChecks(rows => [...rows, newCheck()])}>+ Çek ekle</button>
      <div className="advance-balance"><span>{checks.length} çek toplamı</span><strong>{money(total, currency)}</strong>{target && <><span>Bağlantı hedefi: {money(Number(target), currency)}</span><b>{difference === 0 ? "Çek toplamı hedefle eşleşiyor." : difference > 0 ? `Hedefi aşan tutar: ${money(difference, currency)}` : `Eksik tutar: ${money(-difference, currency)}`}</b>{difference !== 0 && <small>Kaydedilecek avans çeklerin gerçek toplamıdır. Hedef tutar yalnızca karşılaştırma içindir.</small>}</>}</div>
      <label className="field"><span>Bağlantı yılı / açıklama</span><input maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder="Örn. 2026 yıllık bağlantı çekleri" /></label>
      <button className="primary-btn full" disabled={total <= 0}>{busy ? "Kaydediliyor…" : `${checks.length} çeki avans olarak kaydet`}</button>
      <button type="button" className="mini-btn" onClick={onCancel}>Nakit / havale girişine dön</button>
    </fieldset>
  </form>;
}

type Batch = { id: number; targetAmount: number | null; totalAmount: number; currency: string; receivedDate: string; note?: string; checks: { id: number; number: string; amount: number; issuer: string; bankName: string; serialNumber: string; dueDate: string; status: string }[] };
export function CheckAdvanceHistory({ customerId, refresh }: { customerId: number; refresh: number }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<Batch[]>(`/receipts/check-advances?customerId=${customerId}`).then(data => { if (active) { setBatches(data); setError(""); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [customerId, refresh]);
  return <section className="panel advance-panel"><h2>Çekli bağlantı geçmişi</h2>{error && <div className="error-box">{error}</div>}{!batches.length && !error && <p>Bu cari için kayıtlı çekli bağlantı bulunmuyor.</p>}{batches.map(b => <details key={b.id}><summary>BAĞ-{b.id} · {b.receivedDate} · {b.checks.length} çek · {money(b.totalAmount, b.currency)}</summary><p>{b.note}</p>{b.targetAmount !== null && <p>Hedef: {money(b.targetAmount, b.currency)} · Çek toplamı ile fark: {money(b.totalAmount - b.targetAmount, b.currency)}</p>}<div className="table-wrap"><table><thead><tr><th>Çek / banka</th><th>Keşideci</th><th>Vade</th><th>Tutar</th><th>Durum</th></tr></thead><tbody>{b.checks.map(c => <tr key={c.id}><td>{c.number}<small>{c.bankName} · {c.serialNumber}</small></td><td>{c.issuer}</td><td>{c.dueDate}</td><td>{money(c.amount, b.currency)}</td><td>{statusLabels[c.status] || c.status}</td></tr>)}</tbody></table></div></details>)}<p>Toplamlar teslim alınan çekleri gösterir. Kullanılabilir avans net cari bakiyeye göre hesaplanır; karşılıksız çek bu bakiyeyi azaltır.</p><NavLink className="mini-btn" to="/kiymetli-evrak">Çek tahsilat ve durum işlemleri</NavLink></section>;
}
