import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { NavLink } from "react-router-dom";
import { CheckCircle2, FileSpreadsheet, Search, Upload } from "lucide-react";
import { api } from "./api";
import { customerTagLabels, money, type Customer } from "./types";
import { defaultSheetIndex, readWorkbook, type Sheet } from "./spreadsheet";
import { exactNameKey, nameTokens, rankCandidates, type Candidate } from "./nameMatch";

// Eski sistemden gelen cari bakiye listesini (ör. "Bayi alacaklarımız" Excel'i) açılış bakiyesi olarak aktarır.

type Field = "name" | "debit" | "credit" | "balance" | "date" | "note" | "rep";
const fields: { key: Field; label: string; hint?: string; required?: boolean; guess: RegExp }[] = [
  { key: "name", label: "Cari adı / ünvan", required: true, guess: /ünvan|unvan|adı|adi|cari|bayi|firma|müşteri/ },
  { key: "debit", label: "Borç sütunu", hint: "Carinin bize borcu", guess: /^borç|^borc|borcu/ },
  { key: "credit", label: "Alacak / avans sütunu", hint: "Carinin avansı (eksi veya artı yazılmış olabilir)", guess: /alaca/ },
  { key: "balance", label: "Tek bakiye sütunu", hint: "Borç/alacak ayrı değilse: artı = borç, eksi = avans", guess: /bakiye/ },
  { key: "date", label: "Son işlem tarihi", guess: /tarih/ },
  { key: "note", label: "Açıklama", guess: /açıklama|aciklama|^not/ },
  { key: "rep", label: "Temsilci", guess: /temsilci/ },
];
const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const low = (value: string) => clean(value).toLocaleLowerCase("tr-TR");
const ZERO = 1; // 1 TL altındaki kuruş / yuvarlama kalıntıları sıfır sayılır.

function parseAmount(raw: string): number | null | "invalid" {
  const value = clean(raw);
  if (!value) return null;
  if (/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(value)) return Number(value);
  if (/^-?[\d.]+(,\d+)?$/.test(value)) return Number(value.replace(/\./g, "").replace(",", "."));
  return "invalid";
}
function parseDate(raw: string): string | undefined {
  const value = clean(raw);
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const serial = Number(value);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) return new Date(Math.round((serial - 25569) * 86400000)).toISOString().slice(0, 10);
  const dotted = value.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dotted) return `${dotted[3]}-${dotted[2].padStart(2, "0")}-${dotted[1].padStart(2, "0")}`;
  return undefined;
}
const trDate = (iso: string) => iso.split("-").reverse().join(".");

type Section = { id: number; title: string; named: boolean; firstRow: number };
type Row = {
  index: number; section: number; name: string; amount: number; zero: boolean; problem?: string; hidden: boolean;
  lastDate?: string; note?: string; candidates: Candidate<Customer>[];
};
type Choice = number | "new";

export function OpeningBalanceImport() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rates, setRates] = useState<{ currency: string; rate: number }[]>([]);
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<Record<Field, number>>({} as Record<Field, number>);
  const [excludedSections, setExcludedSections] = useState<Set<number>>(new Set());
  const [overrides, setOverrides] = useState<Record<number, { include?: boolean; choice?: Choice; confirmed?: boolean }>>({});
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState("TRY");
  const [rate, setRate] = useState(1);
  const [tags, setTags] = useState<string[]>(["DEALER"]);
  const [createZero, setCreateZero] = useState(false);
  const [view, setView] = useState("ALL");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ message: string; created: { name: string; code: string }[]; posted: { name: string; code: string; amount: number }[]; skipped: { name: string; reason: string }[]; totals: { debit: number; credit: number } } | null>(null);

  const loadCustomers = () => api<Customer[]>("/customers").then(setCustomers);
  useEffect(() => {
    loadCustomers().catch((e) => setError(e.message));
    api<{ rates: { currency: string; rate: number }[] }>("/configuration").then((c) => setRates(c.rates)).catch(() => undefined);
  }, []);
  const customerIndex = useMemo(() => customers.map((c) => ({ item: c, tokens: nameTokens(c.name), key: exactNameKey(c.name) })), [customers]);

  const detect = (rows: string[][]) => {
    // Başlık satırı: ad sütunu ile borç/alacak/bakiye sütunu FARKLI hücrelerde olmalı
    // (aksi halde "BAYİ ALACAKLARIMIZ" gibi bir sayfa başlığı yanlışlıkla seçilir).
    const header = Math.max(0, rows.findIndex((row) => {
      const nameCol = row.findIndex((c) => fields[0].guess.test(low(c)));
      return nameCol >= 0 && row.some((c, col) => col !== nameCol && /borç|borc|alaca|bakiye/.test(low(c)));
    }));
    const guessed = {} as Record<Field, number>;
    for (const field of fields) guessed[field.key] = (rows[header] || []).findIndex((cell, col) => field.guess.test(low(cell)) && !Object.values(guessed).includes(col));
    return { header, guessed };
  };
  const applySheet = (all: Sheet[], i: number) => {
    const { header, guessed } = detect(all[i]?.rows || []);
    setSheetIndex(i);
    setHeaderRow(header);
    setMapping(guessed);
    setOverrides({});
    setExcludedSections(new Set());
  };
  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setResult(null);
    try {
      const all = await readWorkbook(file);
      setSheets(all);
      setFileName(file.name);
      applySheet(all, defaultSheetIndex(all));
    } catch (e) {
      setSheets([]);
      setError((e as Error).message);
    }
  };

  // Satırları bölümlere ayır: yalnızca adı olan satırlar bölüm başlığıdır, TOPLAM satırı bölümü kapatır.
  const { rows, sections } = useMemo(() => {
    const table = sheets[sheetIndex]?.rows || [];
    const hiddenSet = new Set(sheets[sheetIndex]?.hiddenRows || []);
    const cell = (cells: string[], field: Field) => (mapping[field] >= 0 ? cells[mapping[field]] || "" : "");
    const sections: Section[] = [];
    const rows: Row[] = [];
    let current = -1;
    const open = (title: string, named: boolean, firstRow: number) => { sections.push({ id: sections.length, title, named, firstRow }); current = sections.length - 1; };
    table.slice(headerRow + 1).forEach((cells, offset) => {
      const index = headerRow + offset + 2;
      const name = clean(cell(cells, "name"));
      const filled = cells.filter((c) => clean(c)).length;
      if (!filled) return;
      if (/^toplam\b/i.test(low(name)) || /^toplam$/i.test(low(cells.find((c) => clean(c)) || ""))) { current = -1; return; }
      const amountCells = (["debit", "credit", "balance"] as const).map((f) => clean(cell(cells, f)));
      if (amountCells.some((v) => /^(borç|borc|alacak|alacağı|bakiye)/i.test(low(v)))) return; // tekrar eden başlık satırı
      if (name && filled === 1) { open(name, true, index); return; }
      if (!name) return;
      if (current < 0) open("", false, index);
      const debit = parseAmount(cell(cells, "debit"));
      const credit = parseAmount(cell(cells, "credit"));
      const balance = parseAmount(cell(cells, "balance"));
      let problem: string | undefined;
      let amount = 0;
      if ([debit, credit, balance].includes("invalid")) problem = "Tutar sütununda yazı var (ör. döviz işareti veya not)";
      else if (mapping.balance >= 0 && typeof balance === "number") amount = balance;
      else {
        const d = typeof debit === "number" ? debit : 0;
        const c = typeof credit === "number" ? credit : 0;
        if (Math.abs(d) >= ZERO && Math.abs(c) >= ZERO) problem = "Borç ve alacak birlikte dolu (alacak sütununda tarih olabilir)";
        amount = d - Math.abs(c);
      }
      const note = [clean(cell(cells, "note")), clean(cell(cells, "rep"))].filter((v) => v && !/^\d{4}-\d{2}-\d{2}$/.test(v)).join(" · ") || undefined;
      rows.push({ index, section: current, name, amount: Number(amount.toFixed(2)), zero: Math.abs(amount) < ZERO, problem, hidden: hiddenSet.has(index - 1), lastDate: parseDate(cell(cells, "date")), note: note?.slice(0, 480), candidates: rankCandidates(name, customerIndex) });
    });
    // Başlıksız bölümlere ilk ve son satırdaki adlardan bir başlık ver.
    for (const section of sections)
      if (!section.named) {
        const members = rows.filter((r) => r.section === section.id);
        section.title = members.length ? `Başlıksız bölüm: ${members[0].name} … ${members[members.length - 1].name}` : "Başlıksız bölüm";
      }
    return { rows, sections };
  }, [sheets, sheetIndex, headerRow, mapping, customerIndex]);

  // Türkçe "İ" büyük harfi /i bayrağıyla eşleşmediği için önce Türkçe küçük harfe çevrilir.
  const sectionDefaultExcluded = (s: Section) => /şüpheli|supheli/.test(low(s.title)) || !s.named;
  const sectionIncluded = (id: number) => {
    const s = sections[id];
    if (!s) return true;
    return excludedSections.has(id) ? false : excludedSections.has(-1 - id) ? true : !sectionDefaultExcluded(s);
  };
  const toggleSection = (id: number) => {
    const next = new Set(excludedSections);
    const included = sectionIncluded(id);
    next.delete(id);
    next.delete(-1 - id);
    const defaultIncluded = !sectionDefaultExcluded(sections[id]);
    if (included && defaultIncluded) next.add(id);
    if (!included && !defaultIncluded) next.add(-1 - id);
    setExcludedSections(next);
  };

  const plan = rows.map((row) => {
    const best = row.candidates[0];
    const defaultChoice: Choice = best && best.score >= 0.55 ? best.item.id : "new";
    const choice = overrides[row.index]?.choice ?? defaultChoice;
    const target = choice === "new" ? undefined : customers.find((c) => c.id === choice);
    const alreadyOpened = Boolean(target?.hasOpeningBalance) && !row.zero;
    const actionable = !row.problem && !alreadyOpened && (!row.zero || (createZero && choice === "new"));
    // Excel'de gizlenmiş satırlar (kapanmış/eski hesaplar) varsayılan olarak aktarılmaz.
    const defaultInclude = actionable && sectionIncluded(row.section) && !row.hidden;
    const include = actionable && (overrides[row.index]?.include ?? defaultInclude);
    const review = choice !== "new" ? (best && best.item.id === choice && best.score < 0.85) : Boolean(best && best.score >= 0.4);
    // Benzerlikle önerilen eşleşmeler kullanıcı onaylamadan aktarılmaz (yanlış cariye bakiye gitmesin).
    const confirmed = Boolean(overrides[row.index]?.confirmed || overrides[row.index]?.choice !== undefined);
    const needsConfirm = Boolean(review) && !confirmed && actionable && defaultInclude;
    return { row, choice, target, include: needsConfirm ? false : include, review: Boolean(review), needsConfirm, alreadyOpened, actionable };
  });
  const selected = plan.filter((p) => p.include);
  const totals = {
    debit: selected.filter((p) => p.row.amount > 0).reduce((s, p) => s + p.row.amount, 0),
    credit: selected.filter((p) => p.row.amount < 0).reduce((s, p) => s - p.row.amount, 0),
    newCount: new Set(selected.filter((p) => p.choice === "new").map((p) => exactNameKey(p.row.name))).size,
    existingCount: new Set(selected.filter((p) => p.choice !== "new").map((p) => p.choice)).size,
    review: selected.filter((p) => p.review).length,
  };
  const pending = plan.filter((p) => p.needsConfirm);
  const words = low(query).split(" ").filter(Boolean);
  const visible = plan.filter((p) => {
    if (words.length && !words.every((w) => low(p.row.name).includes(w) || low(p.target?.name || "").includes(w))) return false;
    if (view === "REVIEW") return p.needsConfirm || (p.include && p.review);
    if (view === "NEW") return p.include && p.choice === "new";
    if (view === "EXISTING") return p.include && p.choice !== "new";
    if (view === "OUT") return !p.include;
    return true;
  });
  // Fonksiyonel güncelleme: aynı tıklamada birden çok değişiklik birbirini ezmesin.
  const setChoice = (rowIndex: number, choice: Choice) => setOverrides((cur) => ({ ...cur, [rowIndex]: { ...cur[rowIndex], choice } }));
  const setInclude = (rowIndex: number, include: boolean) => setOverrides((cur) => ({ ...cur, [rowIndex]: { ...cur[rowIndex], include } }));
  const confirm = (rowIndexes: number[]) =>
    setOverrides((cur) => {
      const next = { ...cur };
      for (const rowIndex of rowIndexes) next[rowIndex] = { ...next[rowIndex], confirmed: true };
      return next;
    });

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await api<NonNullable<typeof result>>("/customers/opening-balances", {
        method: "POST",
        body: JSON.stringify({
          date,
          currency,
          exchangeRate: currency === "TRY" ? 1 : rate,
          tags,
          rows: selected.map((p) => ({ customerId: p.choice === "new" ? undefined : p.choice, name: p.row.name, amount: p.row.zero ? 0 : p.row.amount, lastDate: p.row.lastDate, note: p.row.note })),
        }),
      });
      setResult(response);
      setSheets([]);
      await loadCustomers();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const table = sheets[sheetIndex]?.rows || [];
  const columns = table[headerRow] || [];
  const filePicker = (label: string, primary = false) => (
    <label className={`${primary ? "primary-btn" : "mini-btn"} file-pick`}><Upload /> {label}<input type="file" accept=".xlsx,.xls,.csv" onChange={choose} /></label>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">CARİ YÖNETİMİ</span>
          <h1>Açılış bakiyesi (devir) aktar</h1>
          <p>Eski sistemdeki borç ve avans bakiyelerini carilere işleyin. Sistemde olmayan cariler aynı anda açılır; her cariye yalnızca bir kez devir girilebilir.</p>
        </div>
        <NavLink className="mini-btn" to="/musteriler">Carilere dön</NavLink>
      </div>
      {error && <div className="error-box">{error}</div>}
      {result && (
        <section className="panel import-result">
          <div className="advance-covered"><CheckCircle2 /><div><b>{result.message}</b><p>Toplam borç {money(result.totals.debit)} · toplam avans {money(result.totals.credit)}. Bakiyeler cari detayında “Açılış bakiyesi (devir)” hareketi olarak görünür.</p></div></div>
          {result.skipped.length > 0 && <ul className="import-skipped">{result.skipped.map((s) => <li key={s.name}><b>{s.name}</b> — {s.reason}</li>)}</ul>}
          <div className="head-actions"><NavLink className="primary-btn" to="/musteriler">Carileri gör</NavLink>{filePicker("Başka dosya yükle")}</div>
        </section>
      )}
      {!sheets.length && !result && (
        <section className="panel import-drop">
          <FileSpreadsheet />
          <h2>Bakiye listesini seçin (.xls, .xlsx veya CSV)</h2>
          <p>Ad / ünvan, borç ve alacak (avans) sütunları otomatik tanınır. Dosyada birden çok sayfa veya bölüm varsa hangilerinin aktarılacağını siz seçersiniz. Hiçbir şey siz onaylamadan kaydedilmez.</p>
          {filePicker("Dosya seç", true)}
        </section>
      )}
      {sheets.length > 0 && (
        <>
          <section className="panel import-settings">
            <div className="import-file"><FileSpreadsheet /><div><b>{fileName}</b><span>{rows.length} cari satırı · {sections.length} bölüm</span></div>{filePicker("Başka dosya")}</div>
            <div className="form-grid">
              <label className="field"><span>Sayfa</span><select value={sheetIndex} onChange={(e) => applySheet(sheets, Number(e.target.value))}>{sheets.map((s, i) => <option key={i} value={i}>{s.name.trim() || `Sayfa ${i + 1}`}{s.hidden ? " (gizli)" : ""}</option>)}</select></label>
              <label className="field"><span>Başlık satırı</span><select value={headerRow} onChange={(e) => { setHeaderRow(Number(e.target.value)); setOverrides({}); }}>{table.slice(0, 20).map((row, i) => <option key={i} value={i}>{i + 1}. satır: {row.filter((c) => clean(c)).slice(0, 3).map(clean).join(" · ") || "(boş)"}</option>)}</select></label>
              <label className="field"><span>Devir (açılış) tarihi</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
              <label className="field"><span>Tutarların para birimi</span><select value={currency} onChange={(e) => { setCurrency(e.target.value); setRate(e.target.value === "TRY" ? 1 : rates.find((r) => r.currency === e.target.value)?.rate || 1); }}><option value="TRY">TL</option><option value="USD">USD</option><option value="EUR">EUR</option></select></label>
              {currency !== "TRY" && <label className="field"><span>Kur (1 {currency} = ? TL)</span><input type="number" min="0.0001" step="0.0001" value={rate} onChange={(e) => setRate(Number(e.target.value))} /></label>}
              <div className="field"><span>Yeni açılacak carilerin türü</span><div className="tag-picker compact">{["DEALER", "CUSTOMER", "SUPPLIER"].map((tag) => <label key={tag} className={tags.includes(tag) ? "selected" : ""}><input type="checkbox" checked={tags.includes(tag)} onChange={(e) => setTags(e.target.checked ? [...tags, tag] : tags.length > 1 ? tags.filter((t) => t !== tag) : tags)} /><span>{customerTagLabels[tag]}</span></label>)}</div></div>
            </div>
            <h3>Sütun eşleştirme</h3>
            <div className="import-mapping">
              {fields.map((field) => (
                <label className="field" key={field.key} title={field.hint}>
                  <span>{field.label}{field.required ? " *" : ""}</span>
                  <select value={mapping[field.key] ?? -1} onChange={(e) => { setMapping({ ...mapping, [field.key]: Number(e.target.value) }); setOverrides({}); }}>
                    {!field.required && <option value={-1}>— Kullanma —</option>}
                    {columns.map((c, col) => <option key={col} value={col}>{String.fromCharCode(65 + col)} · {clean(c) || "(başlıksız)"}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <label className="check-field"><input type="checkbox" checked={createZero} onChange={(e) => setCreateZero(e.target.checked)} /> Bakiyesi olmayan (sıfır) satırları da yeni cari olarak aç</label>
            <small className="muted-note">1 TL altındaki kuruş farkları sıfır sayılır. Borç sütunu = carinin bize borcu; alacak sütunu = carinin avansı (eksi ya da artı yazılmış olsun, avans olarak alınır).</small>
          </section>

          {sections.length > 1 && (
            <section className="panel import-sections">
              <h3>Bölümler</h3>
              <p className="muted-note">Toplamlar Excel'de görünen satırlardan hesaplanır; Excel'de gizlenmiş satırlar varsayılan olarak aktarılmaz (tabloda “Hariç” süzgecinden tek tek ekleyebilirsiniz). Şüpheli alacaklar ve başlıksız bölümler (ör. para birimi belli olmayan yurtdışı listesi) varsayılan olarak hariçtir; isterseniz ekleyin. Döviz bölümlerini ayrı bir aktarımda ilgili para birimini seçerek yükleyebilirsiniz.</p>
              {sections.map((s) => {
                const members = plan.filter((p) => p.row.section === s.id);
                const shown = members.filter((p) => !p.row.hidden && !p.row.problem);
                const hiddenCount = members.filter((p) => p.row.hidden).length;
                const debit = shown.filter((p) => !p.row.zero && p.row.amount > 0).reduce((sum, p) => sum + p.row.amount, 0);
                const credit = shown.filter((p) => !p.row.zero && p.row.amount < 0).reduce((sum, p) => sum - p.row.amount, 0);
                return (
                  <label key={s.id} className={sectionIncluded(s.id) ? "section-row selected" : "section-row"}>
                    <input type="checkbox" checked={sectionIncluded(s.id)} onChange={() => toggleSection(s.id)} />
                    <span><b>{s.title}</b><small>{s.firstRow}. satırdan başlar · {members.length} cari{hiddenCount ? ` · ${hiddenCount}'i Excel'de gizli` : ""}</small></span>
                    <em>Borç {money(debit)}</em>
                    <em>Avans {money(credit)}</em>
                  </label>
                );
              })}
            </section>
          )}

          <section className="panel">
            <div className="import-summary">
              <div><small>Aktarılacak</small><b>{selected.length} satır</b></div>
              <div><small>Mevcut cariye</small><b>{totals.existingCount}</b></div>
              <div><small>Yeni açılacak cari</small><b>{totals.newCount}</b></div>
              <div><small>Toplam borç</small><b>{money(totals.debit, currency)}</b></div>
              <div><small>Toplam avans</small><b>{money(totals.credit, currency)}</b></div>
              <button className="primary-btn" disabled={busy || !selected.length || mapping.name < 0} onClick={submit}>{busy ? "Aktarılıyor…" : "Bakiyeleri aktar"}</button>
            </div>
            {pending.length > 0 && (
              <div className="review-warning">
                <span><b>{pending.length} satır onayınızı bekliyor.</b> Bu satırlarda cari isim benzerliğiyle önerildi (veya sistemde benzer adlı bir cari var). Onaylanmadan aktarılmazlar: “Kontrol edilmeli” süzgecinden tek tek bakın, yanlışsa listeden doğru cariyi ya da “Yeni cari aç”ı seçin.</span>
                {view === "REVIEW" ? (
                  <button type="button" className="mini-btn" onClick={() => confirm(pending.map((p) => p.row.index))}>Listedeki önerilerin hepsini onayla</button>
                ) : (
                  <button type="button" className="mini-btn" onClick={() => setView("REVIEW")}>Onay bekleyenleri göster</button>
                )}
              </div>
            )}
            <div className="toolbar import-toolbar">
              <div className="chip-filters">
                {[["ALL", `Tümü (${plan.length})`], ["REVIEW", `Kontrol edilmeli (${pending.length + totals.review})`], ["NEW", "Yeni cari"], ["EXISTING", "Mevcut cari"], ["OUT", `Hariç (${plan.length - selected.length})`]].map(([v, l]) => (
                  <button key={v} type="button" className={view === v ? "active" : ""} onClick={() => setView(v)}>{l}</button>
                ))}
              </div>
              <label className="search-input"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Satırlarda ara…" /></label>
            </div>
            <div className="table-wrap">
              <table className="import-table">
                <thead><tr><th /><th>Satır</th><th>Excel'deki ad</th><th className="num">Bakiye</th><th>Sistemdeki cari</th><th>Durum</th></tr></thead>
                <tbody>
                  {visible.map(({ row, choice, include, review, needsConfirm, alreadyOpened, actionable }) => (
                    <tr key={row.index} className={include ? "" : "muted-row"}>
                      <td><input type="checkbox" aria-label={`${row.name} aktarılsın`} disabled={!actionable} checked={include} onChange={(e) => { setInclude(row.index, e.target.checked); if (e.target.checked && needsConfirm) confirm([row.index]); }} /></td>
                      <td>{row.index}</td>
                      <td><b>{row.name}</b><small>{[row.lastDate && `son işlem ${trDate(row.lastDate)}`, row.note].filter(Boolean).join(" · ")}</small></td>
                      <td className={`num ${row.zero ? "" : row.amount > 0 ? "debt-amount" : "advance-amount"}`}>{row.zero ? "—" : <><b>{money(Math.abs(row.amount), currency)}</b><small>{row.amount > 0 ? "Borçlu" : "Avans"}</small></>}</td>
                      <td>
                        <select className="match-select" value={String(choice)} onChange={(e) => setChoice(row.index, e.target.value === "new" ? "new" : Number(e.target.value))}>
                          <option value="new">+ Yeni cari aç</option>
                          {row.candidates.map((c) => <option key={c.item.id} value={c.item.id}>{c.item.name} · {c.item.code} (%{Math.round(c.score * 100)})</option>)}
                          {typeof choice === "number" && !row.candidates.some((c) => c.item.id === choice) && <option value={choice}>{customers.find((c) => c.id === choice)?.name}</option>}
                        </select>
                        <CustomerSearch customers={customers} onPick={(id) => setChoice(row.index, id)} />
                      </td>
                      <td>
                        {row.problem ? <span className="import-chip bad">{row.problem}</span>
                          : alreadyOpened ? <span className="import-chip skip">Bu cariye devir zaten girilmiş</span>
                          : row.zero && !(createZero && choice === "new") ? <span className="import-chip skip">Bakiye yok</span>
                          : row.hidden && !include ? <span className="import-chip skip">Excel'de gizli satır</span>
                          : needsConfirm ? <span className="confirm-cell"><span className="import-chip warn">{choice === "new" ? "Benzer cari var" : "Önerilen eşleşme"}</span><button type="button" className="mini-btn" onClick={() => confirm([row.index])}>Onayla</button></span>
                          : review ? <span className="import-chip ok">{choice === "new" ? "Yeni cari (onaylandı)" : "Eşleşme onaylandı"}</span>
                          : <span className="import-chip ok">{choice === "new" ? "Yeni cari" : "Eşleşti"}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!visible.length && <div className="empty-inline"><span>Bu süzgeçte satır yok.</span></div>}
          </section>
        </>
      )}
    </>
  );
}

/** Önerilerde olmayan bir cariyi adından aratıp seçmek için küçük arama kutusu. */
function CustomerSearch({ customers, onPick }: { customers: Customer[]; onPick: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const words = low(text).split(" ").filter(Boolean);
  const hits = words.length ? customers.filter((c) => words.every((w) => low(`${c.name} ${c.code}`).includes(w))).slice(0, 8) : [];
  if (!open) return <button type="button" className="text-btn match-other" onClick={() => setOpen(true)}>Başka cari seç…</button>;
  return (
    <div className="match-search">
      <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Cari adı veya kodu" onKeyDown={(e) => e.key === "Escape" && setOpen(false)} />
      {hits.map((c) => <button type="button" key={c.id} onClick={() => { onPick(c.id); setOpen(false); setText(""); }}>{c.name}<small>{c.code}</small></button>)}
      {words.length > 0 && !hits.length && <small>Bulunamadı</small>}
    </div>
  );
}
