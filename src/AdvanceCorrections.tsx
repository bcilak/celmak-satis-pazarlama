import { useState } from "react";
import { Pencil, Undo2 } from "lucide-react";
import { api } from "./api";
import { MoneyInput } from "./OrderTools";
import { money } from "./types";

export type AdvanceReceipt = {
  id: number; number: string; method: string; receiptDate: string; amount: number; currency: string; exchangeRate: number; tryAmount: number;
  reference?: string | null; note?: string | null; createdBy?: string | null;
};
export type OpeningBalance = { date: string; currency: string; exchangeRate: number; amount: number; tryAmount: number } | null;

const methodLabels: Record<string, string> = { CASH: "Nakit", BANK_TRANSFER: "Havale / EFT", CHECK: "Çek" };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const dateText = (iso: string) => iso.slice(0, 10).split("-").reverse().join(".");

/**
 * Avans hesabındaki kayıtları düzeltme: vadeye bağlı olmayan tahsilatlar (avans girişleri) ve
 * açılış bakiyesi (devir). Kayıtlar silinmez; ters kayıt + doğru kayıt ya da fark satırı oluşur.
 */
export function AdvanceCorrections({ customerId, receipts, opening, canEdit, onSaved }: {
  customerId: number; receipts: AdvanceReceipt[]; opening: OpeningBalance; canEdit: boolean; onSaved: (message: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ amount: 0, method: "BANK_TRANSFER", date: today(), reference: "", note: "", reason: "", side: "ADVANCE" as "ADVANCE" | "DEBT" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editable = receipts.filter((r) => r.method !== "CHECK");
  if (!opening && !editable.length) return null;

  const startReceipt = (r: AdvanceReceipt) => {
    setEditing(`r-${r.id}`); setError("");
    setForm({ amount: r.amount, method: r.method, date: r.receiptDate.slice(0, 10), reference: r.reference || "", note: r.note || "", reason: "", side: "ADVANCE" });
  };
  const startOpening = () => {
    if (!opening) return;
    setEditing("opening"); setError("");
    setForm({ amount: Math.abs(opening.amount), method: "BANK_TRANSFER", date: today(), reference: "", note: "", reason: "", side: opening.amount > 0 ? "DEBT" : "ADVANCE" });
  };
  const save = async (r?: AdvanceReceipt) => {
    setBusy(true); setError("");
    try {
      const result = r
        ? await api<{ message: string }>(`/receipts/${r.id}`, { method: "PUT", body: JSON.stringify({ method: form.method, receiptDate: form.date, amount: form.amount, exchangeRate: r.exchangeRate, reference: form.reference || undefined, note: form.note || undefined, reason: form.reason }) })
        : await api<{ message: string }>(`/customers/${customerId}/opening-balance`, { method: "PUT", body: JSON.stringify({ amount: form.side === "DEBT" ? form.amount : -form.amount, date: form.date, reason: form.reason }) });
      setEditing(null);
      onSaved(result.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const cancelReceipt = async (r: AdvanceReceipt) => {
    const reason = prompt(`${r.number} (${money(r.amount, r.currency)}) iptal edilsin mi? Kayıt ters kayıtla kapanır. İptal nedenini yazın:`);
    if (!reason || reason.trim().length < 3) return;
    try {
      const result = await api<{ message: string }>(`/receipts/${r.id}/reverse`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) });
      onSaved(result.message);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const editor = (r?: AdvanceReceipt) => (
    <form className="advance-edit" onSubmit={(e) => { e.preventDefault(); save(r); }}>
      <div className="form-grid">
        {!r && (
          <label className="field"><span>Bakiye türü</span>
            <select value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value as "ADVANCE" | "DEBT" })}>
              <option value="ADVANCE">Avans (bizim borcumuz)</option>
              <option value="DEBT">Borç (carinin borcu)</option>
            </select>
          </label>
        )}
        <label className="field"><span>Doğru tutar ({r ? r.currency : opening?.currency})</span><MoneyInput currency={r ? r.currency : opening?.currency || "TRY"} value={form.amount} onChange={(amount) => setForm({ ...form, amount })} /></label>
        {r && <label className="field"><span>Ödeme şekli</span><select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}><option value="BANK_TRANSFER">Havale / EFT</option><option value="CASH">Nakit</option></select></label>}
        <label className="field"><span>{r ? "Ödeme tarihi" : "Düzeltme tarihi"}</span><input type="date" required max={today()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
        {r && <label className="field"><span>Dekont / referans</span><input maxLength={100} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></label>}
        <label className="field wide"><span>Düzeltme nedeni *</span><input required minLength={3} maxLength={300} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Örn. Tutar yanlış girilmiş, dekontta 250.000 TL" /></label>
      </div>
      <small className="muted-note">{r ? "Eski kayıt silinmez: ters kayıtla kapanır ve doğru tutarla yeni kayıt açılır. Cari ekstresinde iki satır da görünür." : "Açılış kaydı silinmez: eski ve yeni tutar arasındaki fark ayrı bir düzeltme satırı olarak cariye işlenir. Sıfır girerseniz açılış bakiyesi kapanır."}</small>
      {error && <div className="error-box">{error}</div>}
      <div className="head-actions">
        <button type="button" className="mini-btn" disabled={busy} onClick={() => setEditing(null)}>Vazgeç</button>
        <button className="primary-btn" disabled={busy || form.reason.trim().length < 3 || (r ? form.amount <= 0 : form.amount < 0)}>{busy ? "Kaydediliyor…" : "Düzeltmeyi kaydet"}</button>
      </div>
    </form>
  );

  return (
    <section className="panel advance-corrections">
      <div className="panel-title"><h2>Avans kayıtları</h2></div>
      <p className="info-note pad">Yanlış girilen avansı buradan düzeltebilir veya iptal edebilirsiniz.{canEdit ? "" : " Düzeltme için muhasebe veya yönetici yetkisi gerekir."}</p>
      {error && !editing && <div className="error-box">{error}</div>}
      <div className="compact-list">
        {opening && (
          <div className="advance-entry">
            <span><b>Açılış bakiyesi (devir)</b><small>{dateText(opening.date)} · {opening.amount < 0 ? "Avans" : opening.amount > 0 ? "Borç" : "Kapandı"}</small></span>
            <strong>{money(Math.abs(opening.amount), opening.currency)}{opening.currency !== "TRY" && <small>{money(Math.abs(opening.tryAmount))}</small>}</strong>
            {canEdit && editing !== "opening" && <button type="button" className="mini-btn" onClick={startOpening}><Pencil /> Düzelt</button>}
            {editing === "opening" && editor()}
          </div>
        )}
        {editable.map((r) => (
          <div className="advance-entry" key={r.id}>
            <span><b>{r.number} · {methodLabels[r.method] || r.method}</b><small>{dateText(r.receiptDate)}{r.reference ? ` · ${r.reference}` : ""}{r.note ? ` · ${r.note}` : ""}{r.createdBy ? ` · ${r.createdBy}` : ""}</small></span>
            <strong>{money(r.amount, r.currency)}{r.currency !== "TRY" && <small>{money(r.tryAmount)}</small>}</strong>
            {canEdit && editing !== `r-${r.id}` && <span className="head-actions"><button type="button" className="mini-btn" onClick={() => startReceipt(r)}><Pencil /> Düzelt</button><button type="button" className="mini-btn" onClick={() => cancelReceipt(r)}><Undo2 /> İptal et</button></span>}
            {editing === `r-${r.id}` && editor(r)}
          </div>
        ))}
      </div>
    </section>
  );
}
