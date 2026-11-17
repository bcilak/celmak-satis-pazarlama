import { Fragment, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { ChevronRight, Search, TriangleAlert } from "lucide-react";
import { api } from "./api";
import { customerTagLabels, money, paymentMethodLabels } from "./types";

type Row = {
  id: number; code: string; name: string; city?: string | null; phone?: string | null; tags: string; balance: number; lastOrderDate?: string | null;
  plannedTransfers: number; pendingInstruments: number; unplanned: number; overdue: number; oldestDueDate?: string | null;
  items: { saleId: number; saleNumber: string; paymentType: string; dueDate: string; remaining: number; currency: string; tryAmount: number; instrumentNumber?: string | null; instrumentStatus?: string | null; overdue: boolean }[];
};
type Report = { today: string; rows: Row[]; totals: { balance: number; plannedTransfers: number; pendingInstruments: number; unplanned: number; overdue: number; customers: number } };

const dateText = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "—");

/** Rapor ekranları arasında geçiş. */
export function ReportTabs() {
  return (
    <nav className="report-tabs" aria-label="Raporlar">
      <NavLink end to="/raporlar">Makine siparişleri</NavLink>
      <NavLink to="/raporlar/evraksiz">Evraksız alacaklar</NavLink>
    </nav>
  );
}

/**
 * Evraksız alacaklar: borcu olup karşılığında çek/senet teslim alınmamış veya ödemesi gelmemiş cariler.
 * Borç; vadeli havale, teslim alınmamış (planlı) çek/senet ve hiç planı olmayan açık cari olarak ayrılır.
 */
export function UnbackedReport() {
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | "OVERDUE" | "UNPLANNED">("ALL");
  const [openId, setOpenId] = useState<number | null>(null);
  useEffect(() => {
    api<Report>("/reports/unbacked").then(setData).catch((e) => setError(e.message));
  }, []);
  if (error) return <div className="error-box">{error}</div>;
  if (!data) return <div className="loading">Rapor hazırlanıyor…</div>;
  const words = query.trim().toLocaleLowerCase("tr-TR").split(/\s+/).filter(Boolean);
  const rows = data.rows.filter((r) =>
    (filter === "ALL" || (filter === "OVERDUE" ? r.overdue > 0.009 : r.unplanned > 0.009)) &&
    words.every((w) => `${r.name} ${r.code} ${r.city || ""}`.toLocaleLowerCase("tr-TR").includes(w)));
  const t = data.totals;
  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">RAPORLAR</span>
          <h1>Evraksız alacaklar</h1>
          <p>Borcu olup karşılığında henüz çek/senet teslim alınmamış veya ödemesi gelmemiş cariler.</p>
        </div>
      </div>
      <ReportTabs />
      <section className="unbacked-metrics">
        <div className="main"><small>Toplam evraksız alacak</small><b>{money(t.balance)}</b><span>{t.customers} cari</span></div>
        <div><small>Planı olmayan açık cari</small><b>{money(t.unplanned)}</b><span>Vade veya evrak bağlanmamış</span></div>
        <div><small>Teslim alınmamış çek / senet</small><b>{money(t.pendingInstruments)}</b><span>Planlı evrak bekleniyor</span></div>
        <div><small>Vadeli havale bekleyen</small><b>{money(t.plannedTransfers)}</b><span>Ödeme planında</span></div>
        <div className="danger"><small>Vadesi geçmiş</small><b>{money(t.overdue)}</b><span>Hemen takip edilmeli</span></div>
      </section>
      <section className="panel">
        <div className="toolbar unbacked-toolbar">
          <label className="search-input"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari adı, kodu veya il ara…" /></label>
          <div className="chip-filters">
            {([["ALL", "Tümü"], ["OVERDUE", "Vadesi geçenler"], ["UNPLANNED", "Planı olmayanlar"]] as const).map(([v, l]) => <button type="button" key={v} className={filter === v ? "active" : ""} onClick={() => setFilter(v)}>{l}</button>)}
          </div>
          <span><b>{rows.length}</b> cari · {money(rows.reduce((s, r) => s + r.balance, 0))}</span>
        </div>
        <div className="table-wrap">
          <table className="unbacked-table">
            <thead><tr><th>Cari</th><th className="num">Evraksız borç</th><th className="num">Açık cari (plansız)</th><th className="num">Teslim alınmamış evrak</th><th className="num">Vadeli havale</th><th className="num">Vadesi geçen</th><th>En eski vade</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <tr className={r.overdue > 0.009 ? "overdue-row" : ""} onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                    <td><b>{r.name}</b><small>{[r.code, r.city, (r.tags || "").split(",").map((x) => customerTagLabels[x] || x).join(", "), r.lastOrderDate ? `son sipariş ${dateText(r.lastOrderDate)}` : ""].filter(Boolean).join(" · ")}</small></td>
                    <td className="num"><b>{money(r.balance)}</b></td>
                    <td className="num">{r.unplanned > 0.009 ? <span className="danger-text">{money(r.unplanned)}</span> : "—"}</td>
                    <td className="num">{r.pendingInstruments > 0.009 ? money(r.pendingInstruments) : "—"}</td>
                    <td className="num">{r.plannedTransfers > 0.009 ? money(r.plannedTransfers) : "—"}</td>
                    <td className="num">{r.overdue > 0.009 ? <b className="danger-text"><TriangleAlert className="inline-icon" /> {money(r.overdue)}</b> : "—"}</td>
                    <td>{dateText(r.oldestDueDate)}</td>
                    <td><button type="button" className="mini-btn" aria-expanded={openId === r.id}>{openId === r.id ? "Gizle" : "Ayrıntı"}</button></td>
                  </tr>
                  {openId === r.id && (
                    <tr className="unbacked-detail">
                      <td colSpan={8}>
                        {r.items.length ? (
                          <div className="compact-list">
                            {r.items.map((x, i) => (
                              <div key={i}>
                                <span><b><NavLink to={`/satislar/${x.saleId}`}>{x.saleNumber}</NavLink> · {paymentMethodLabels[x.paymentType] || x.paymentType}</b><small>{x.instrumentNumber ? `${x.instrumentNumber} · teslim alınmadı · ` : ""}Vade {dateText(x.dueDate)}{x.overdue ? " · vadesi geçti" : ""}</small></span>
                                <strong className={x.overdue ? "danger-text" : ""}>{money(x.remaining, x.currency)}{x.currency !== "TRY" && <small>{money(x.tryAmount)}</small>}</strong>
                              </div>
                            ))}
                          </div>
                        ) : <p className="info-note">Bu borca bağlı vade veya evrak yok: tamamı açık cari. Bayiyle ödeme planı veya çek/senet konuşulmalı.</p>}
                        <div className="head-actions">
                          <NavLink className="mini-btn" to={`/musteriler/${r.id}`}>Cari kartı <ChevronRight /></NavLink>
                          <NavLink className="mini-btn" to={`/tahsilatlar?customerId=${r.id}`}>Tahsilat gir <ChevronRight /></NavLink>
                          <NavLink className="mini-btn" to={`/kiymetli-evrak?ara=${encodeURIComponent(r.name)}`}>Çek / senetleri <ChevronRight /></NavLink>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className="info-note pad">{data.rows.length ? "Süzgece uyan cari yok." : "Evraksız alacak yok: borcu olan bütün carilerin borcu çek/senet veya ödemeyle karşılanmış."}</p>}
      </section>
    </>
  );
}
