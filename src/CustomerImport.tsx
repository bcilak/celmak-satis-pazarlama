import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { NavLink } from "react-router-dom";
import { CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { api } from "./api";
import { customerTagLabels, type Customer } from "./types";
import { readSpreadsheet } from "./spreadsheet";

type Field = "name" | "city" | "district" | "address" | "phone" | "taxNumber" | "email" | "note";
const fields: { key: Field; label: string; required?: boolean; max: number; guess: RegExp }[] = [
  { key: "name", label: "Firma / bayi adı", required: true, max: 180, guess: /bayi|firma|unvan|ünvan|cari|isim|^ad[ıi]?$|müşteri/ },
  { key: "city", label: "İl", max: 80, guess: /^il$|^il\b|şehir|sehir/ },
  { key: "district", label: "İlçe", max: 80, guess: /ilçe|ilce|semt/ },
  { key: "address", label: "Adres", max: 300, guess: /adres/ },
  { key: "phone", label: "Telefon", max: 30, guess: /tel|gsm|cep/ },
  { key: "taxNumber", label: "Vergi / TC no", max: 11, guess: /vergi|vkn|tckn|tc no/ },
  { key: "email", label: "E-posta", max: 120, guess: /posta|mail/ },
  { key: "note", label: "Not", max: 1000, guess: /^not|açıklama|aciklama/ },
];
// JS'te \s bölünmez boşluğu (Excel'de sık görülen NBSP) da kapsar.
const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const nameKey = (value: string) => clean(value).toLocaleUpperCase("tr-TR");
const headerKey = (value: string) => clean(value).toLocaleLowerCase("tr-TR");

type Row = { index: number; values: Record<Field, string>; status: "new" | "exists" | "duplicate" | "invalid"; problem?: string; incomplete: boolean };

export function CustomerImport() {
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<string[][]>([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<Record<Field, number>>({} as Record<Field, number>);
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [tags, setTags] = useState<string[]>(["DEALER"]);
  const [paymentTermDays, setPaymentTermDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ message: string; created: { row: number; code: string; name: string }[]; skipped: { row: number; name: string; reason: string }[] } | null>(null);

  useEffect(() => {
    api<Customer[]>("/customers").then((items) => setExisting(new Set(items.map((c) => nameKey(c.name))))).catch((e) => setError(e.message));
  }, []);

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setResult(null);
    try {
      const rows = await readSpreadsheet(file);
      if (!rows.length) throw new Error("Dosyada okunabilir satır bulunamadı.");
      // Başlık satırı: firma adı sütununa benzeyen bir hücre içeren ilk satır.
      const found = rows.findIndex((row) => row.some((cell) => fields[0].guess.test(headerKey(cell))));
      const header = found >= 0 ? found : 0;
      const guessed = {} as Record<Field, number>;
      for (const field of fields) {
        const column = rows[header].findIndex((cell, column) => field.guess.test(headerKey(cell)) && !Object.values(guessed).includes(column));
        guessed[field.key] = column;
      }
      if (guessed.name < 0) guessed.name = rows[header].findIndex((cell) => clean(cell));
      setFileName(file.name);
      setTable(rows);
      setHeaderRow(header);
      setMapping(guessed);
      setExcluded(new Set());
    } catch (e) {
      setTable([]);
      setError((e as Error).message);
    }
  };

  const rows: Row[] = useMemo(() => {
    const seen = new Set<string>();
    return table
      .slice(headerRow + 1)
      .map((cells, offset) => {
        const values = Object.fromEntries(fields.map((f) => [f.key, mapping[f.key] >= 0 ? clean(cells[mapping[f.key]] || "") : ""])) as Record<Field, string>;
        return { cells, values, index: headerRow + offset + 2 };
      })
      .filter(({ cells }) => cells.some((cell) => clean(cell)))
      .map(({ values, index }) => {
        const key = nameKey(values.name);
        const tooLong = fields.find((f) => values[f.key].length > f.max);
        let status: Row["status"] = "new";
        let problem: string | undefined;
        if (values.name.length < 2) { status = "invalid"; problem = "Firma adı yok"; }
        else if (tooLong) { status = "invalid"; problem = `${tooLong.label} çok uzun (en fazla ${tooLong.max})`; }
        else if (values.taxNumber && !/^\d{10,11}$/.test(values.taxNumber.replace(/\s/g, ""))) { status = "invalid"; problem = "Vergi / TC no 10–11 hane olmalı"; }
        else if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) { status = "invalid"; problem = "E-posta geçersiz"; }
        else if (existing.has(key)) status = "exists";
        else if (seen.has(key)) status = "duplicate";
        if (status === "new") seen.add(key);
        return { index, values: { ...values, taxNumber: values.taxNumber.replace(/\s/g, "") }, status, problem, incomplete: !values.city && !values.phone && !values.address };
      });
  }, [table, headerRow, mapping, existing]);

  const importable = rows.filter((row) => row.status === "new" && !excluded.has(row.index));
  const counts = {
    exists: rows.filter((r) => r.status === "exists").length,
    duplicate: rows.filter((r) => r.status === "duplicate").length,
    invalid: rows.filter((r) => r.status === "invalid").length,
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await api<NonNullable<typeof result>>("/customers/import", {
        method: "POST",
        body: JSON.stringify({
          tags,
          paymentTermDays,
          riskLimit: 0,
          rows: importable.map((row) => Object.fromEntries(Object.entries(row.values).filter(([, value]) => value))),
        }),
      });
      setResult(response);
      setTable([]);
      const items = await api<Customer[]>("/customers");
      setExisting(new Set(items.map((c) => nameKey(c.name))));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const columns = table[headerRow] || [];
  const columnLabel = (column: number) => `${String.fromCharCode(65 + column)} · ${clean(columns[column] || "") || "(başlıksız)"}`;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">CARİ YÖNETİMİ</span>
          <h1>Excel'den cari içe aktar</h1>
          <p>Bayi veya müşteri listenizi tek seferde cari olarak açın. Cari kodları otomatik verilir; aynı adla kayıtlı cariler tekrar açılmaz.</p>
        </div>
        <NavLink className="mini-btn" to="/musteriler">Carilere dön</NavLink>
      </div>
      {error && <div className="error-box">{error}</div>}
      {result && (
        <section className="panel import-result">
          <div className="advance-covered"><CheckCircle2 /><div><b>{result.message}</b><p>Açılan cariler Cariler ekranında; kartlarından adres, risk limiti ve vade bilgisi düzenlenebilir.</p></div></div>
          {result.skipped.length > 0 && (
            <ul className="import-skipped">{result.skipped.map((s) => <li key={s.row}><b>{s.name}</b> — {s.reason}</li>)}</ul>
          )}
          <div className="head-actions"><NavLink className="primary-btn" to="/musteriler">Carileri gör</NavLink><label className="mini-btn file-pick"><Upload /> Başka dosya yükle<input type="file" accept=".xlsx,.csv" onChange={choose} /></label></div>
        </section>
      )}
      {!table.length && !result && (
        <section className="panel import-drop">
          <FileSpreadsheet />
          <h2>Excel (.xlsx) veya CSV dosyası seçin</h2>
          <p>İlk sayfadaki tablo okunur. Başlık satırında “Bayi / Firma adı”, “İl”, “İlçe”, “Adres”, “Tel” gibi sütunlar otomatik tanınır; gerekirse elle eşleştirebilirsiniz. Eski .xls dosyalarını Excel'de “Farklı kaydet → .xlsx” ile çevirin.</p>
          <label className="primary-btn file-pick"><Upload /> Dosya seç<input type="file" accept=".xlsx,.csv" onChange={choose} /></label>
        </section>
      )}
      {table.length > 0 && (
        <>
          <section className="panel import-settings">
            <div className="import-file"><FileSpreadsheet /><div><b>{fileName}</b><span>{rows.length} dolu satır · başlık {headerRow + 1}. satırda</span></div><label className="mini-btn file-pick"><Upload /> Başka dosya<input type="file" accept=".xlsx,.csv" onChange={choose} /></label></div>
            <div className="form-grid">
              <label className="field"><span>Başlık satırı</span><select value={headerRow} onChange={(e) => setHeaderRow(Number(e.target.value))}>{table.slice(0, 15).map((row, i) => <option key={i} value={i}>{i + 1}. satır: {row.filter((c) => clean(c)).slice(0, 3).map(clean).join(" · ") || "(boş)"}</option>)}</select></label>
              <div className="field"><span>Açılacak cari türü</span><div className="tag-picker compact">{["DEALER", "CUSTOMER", "SUPPLIER"].map((tag) => <label key={tag} className={tags.includes(tag) ? "selected" : ""}><input type="checkbox" checked={tags.includes(tag)} onChange={(e) => setTags(e.target.checked ? [...tags, tag] : tags.length > 1 ? tags.filter((t) => t !== tag) : tags)} /><span>{customerTagLabels[tag]}</span></label>)}</div></div>
              <label className="field"><span>Varsayılan vade</span><select value={paymentTermDays} onChange={(e) => setPaymentTermDays(Number(e.target.value))}>{[0, 15, 30, 45, 60, 90].map((d) => <option key={d} value={d}>{d ? `${d} gün` : "Peşin"}</option>)}</select></label>
            </div>
            <h3>Sütun eşleştirme</h3>
            <div className="import-mapping">
              {fields.map((field) => (
                <label className="field" key={field.key}>
                  <span>{field.label}{field.required ? " *" : ""}</span>
                  <select value={mapping[field.key] ?? -1} onChange={(e) => setMapping({ ...mapping, [field.key]: Number(e.target.value) })}>
                    {!field.required && <option value={-1}>— Kullanma —</option>}
                    {columns.map((_, column) => <option key={column} value={column}>{columnLabel(column)}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </section>
          <section className="panel">
            <div className="toolbar">
              <span><b>{importable.length}</b> cari açılacak{counts.exists ? ` · ${counts.exists} zaten kayıtlı` : ""}{counts.duplicate ? ` · ${counts.duplicate} dosyada tekrar` : ""}{counts.invalid ? ` · ${counts.invalid} hatalı` : ""}</span>
              <button className="primary-btn" disabled={busy || !importable.length || mapping.name < 0} onClick={submit}>{busy ? "Cariler açılıyor…" : `${importable.length} cariyi aç`}</button>
            </div>
            <div className="table-wrap">
              <table className="import-table">
                <thead><tr><th /><th>Satır</th><th>Firma adı</th><th>İl / ilçe</th><th>Adres</th><th>Telefon</th><th>Durum</th></tr></thead>
                <tbody>
                  {rows.map((row) => {
                    const selectable = row.status === "new";
                    const checked = selectable && !excluded.has(row.index);
                    return (
                      <tr key={row.index} className={checked ? "" : "muted-row"}>
                        <td><input type="checkbox" aria-label={`${row.values.name} içe aktarılsın`} disabled={!selectable} checked={checked} onChange={() => { const next = new Set(excluded); if (next.has(row.index)) next.delete(row.index); else next.add(row.index); setExcluded(next); }} /></td>
                        <td>{row.index}</td>
                        <td><b>{row.values.name || "—"}</b>{row.values.taxNumber && <small>VKN {row.values.taxNumber}</small>}</td>
                        <td>{[row.values.city, row.values.district].filter(Boolean).join(" / ") || "—"}</td>
                        <td className="import-address">{row.values.address || "—"}</td>
                        <td>{row.values.phone || "—"}</td>
                        <td>
                          {row.status === "new" && <span className={row.incomplete ? "import-chip warn" : "import-chip ok"}>{row.incomplete ? "Yeni · iletişim bilgisi yok" : "Yeni"}</span>}
                          {row.status === "exists" && <span className="import-chip skip">Zaten kayıtlı</span>}
                          {row.status === "duplicate" && <span className="import-chip skip">Dosyada tekrar</span>}
                          {row.status === "invalid" && <span className="import-chip bad">{row.problem}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
