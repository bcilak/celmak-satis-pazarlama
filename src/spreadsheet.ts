import { readXls, type Sheet } from "./xls";

export type { Sheet };

// Küçük, bağımlılıksız .xlsx / .xls / .csv okuyucu.
// .xlsx bir zip arşividir: tarayıcının DecompressionStream'i ile açılır, XML'i DOMParser ile okunur.
// .xls için xls.ts kullanılır. Her sayfanın hücre metinleri döner (biçim, formül, birleştirme yok sayılır).

type ZipEntry = { method: number; compressedSize: number; offset: number };

function zipEntries(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("Dosya okunamadı. Geçerli bir .xlsx dosyası seçin.");
  const count = view.getUint16(end + 10, true);
  let pointer = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(pointer, true) !== 0x02014b50) throw new Error("Excel dosyası bozuk görünüyor.");
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    entries.set(decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength)), {
      method: view.getUint16(pointer + 10, true),
      compressedSize: view.getUint32(pointer + 20, true),
      offset: view.getUint32(pointer + 42, true),
    });
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function entryText(bytes: Uint8Array, entry: ZipEntry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(entry.offset, true) !== 0x04034b50) throw new Error("Excel dosyası bozuk görünüyor.");
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
  const data = bytes.slice(start, start + entry.compressedSize);
  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) throw new Error("Bu Excel sıkıştırma biçimi desteklenmiyor.");
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

const xml = (text: string) => new DOMParser().parseFromString(text, "application/xml");
const all = (node: Document | Element, name: string) => Array.from(node.getElementsByTagNameNS("*", name));

function columnIndex(reference: string) {
  const letters = reference.replace(/\d+$/, "").toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

async function readXlsx(bytes: Uint8Array): Promise<Sheet[]> {
  const entries = zipEntries(bytes);
  const read = async (path: string) => {
    const entry = entries.get(path);
    return entry ? entryText(bytes, entry) : undefined;
  };
  // Sayfa adları, gizlilik durumu ve dosya yolları workbook ve ilişkilerinden okunur.
  const workbook = await read("xl/workbook.xml");
  const rels = await read("xl/_rels/workbook.xml.rels");
  const relations = rels ? all(xml(rels), "Relationship") : [];
  const listed = workbook
    ? all(xml(workbook), "sheet").map((sheet, index) => {
        const relId = sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || sheet.getAttribute("r:id");
        const target = relations.find((r) => r.getAttribute("Id") === relId)?.getAttribute("Target");
        return {
          name: sheet.getAttribute("name") || `Sayfa${index + 1}`,
          hidden: ["hidden", "veryHidden"].includes(sheet.getAttribute("state") || ""),
          path: target ? (target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`) : `xl/worksheets/sheet${index + 1}.xml`,
        };
      })
    : [{ name: "Sayfa1", hidden: false, path: "xl/worksheets/sheet1.xml" }];
  const shared: string[] = [];
  const sharedText = await read("xl/sharedStrings.xml");
  if (sharedText)
    for (const item of all(xml(sharedText), "si"))
      shared.push(all(item, "t").filter((t) => (t.parentElement?.localName || "") !== "rPh").map((t) => t.textContent || "").join(""));
  const sheets: Sheet[] = [];
  for (const entry of listed) {
    const sheetText = await read(entry.path);
    if (!sheetText) continue;
    const rows: string[][] = [];
    const hiddenRows: number[] = [];
    for (const row of all(xml(sheetText), "row")) {
      const rowIndex = Number(row.getAttribute("r")) - 1 || rows.length;
      if (["1", "true"].includes(row.getAttribute("hidden") || "")) hiddenRows.push(rowIndex);
      const cells: string[] = [];
      for (const cell of all(row, "c")) {
        const ref = cell.getAttribute("r");
        const column = ref ? columnIndex(ref) : cells.length;
        const type = cell.getAttribute("t");
        const raw = all(cell, "v")[0]?.textContent ?? "";
        let value = raw;
        if (type === "s") value = shared[Number(raw)] ?? "";
        else if (type === "inlineStr") value = all(cell, "t").map((t) => t.textContent || "").join("");
        else if (type === "b") value = raw === "1" ? "DOĞRU" : "YANLIŞ";
        else if (type === "e") value = "";
        cells[column] = value;
      }
      rows[rowIndex] = Array.from(cells, (value) => value ?? "");
    }
    sheets.push({ name: entry.name, hidden: entry.hidden, rows: Array.from(rows, (row) => row ?? []), hiddenRows });
  }
  if (!sheets.length) throw new Error("Excel dosyasında çalışma sayfası bulunamadı.");
  return sheets;
}

function readCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = [";", "\t", ","].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Excel (.xlsx / .xls) veya CSV dosyasının bütün sayfalarını hücre metinleri olarak döndürür. */
export async function readWorkbook(file: File): Promise<Sheet[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name.toLocaleLowerCase("tr-TR");
  if (name.endsWith(".csv")) {
    const utf8 = new TextDecoder("utf-8").decode(bytes);
    // Excel'in Türkçe CSV çıktısı çoğunlukla Windows-1254'tür.
    const invalidUtf8 = utf8.includes(String.fromCharCode(0xfffd));
    const withoutBom = utf8.charCodeAt(0) === 0xfeff ? utf8.slice(1) : utf8;
    return [{ name: "CSV", hidden: false, rows: readCsv(invalidUtf8 ? new TextDecoder("windows-1254").decode(bytes) : withoutBom), hiddenRows: [] }];
  }
  // Uzantıya değil içeriğe bakılır: .xls (OLE2) ile .xlsx (zip) imzaları farklıdır.
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return readXls(bytes);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return readXlsx(bytes);
  throw new Error("Dosya biçimi tanınmadı. Excel (.xlsx, .xls) veya CSV dosyası seçin.");
}

const hasData = (sheet: Sheet) => sheet.rows.some((row) => row.some((cell) => cell.trim()));

/** Kullanıcıya varsayılan olarak gösterilecek sayfa: ilk görünür ve dolu sayfa. */
export const defaultSheetIndex = (sheets: Sheet[]) => {
  const index = sheets.findIndex((sheet) => !sheet.hidden && hasData(sheet));
  return index >= 0 ? index : Math.max(0, sheets.findIndex(hasData));
};

/** Geriye dönük uyumluluk: varsayılan sayfanın hücreleri. */
export async function readSpreadsheet(file: File): Promise<string[][]> {
  const sheets = await readWorkbook(file);
  return sheets[defaultSheetIndex(sheets)]?.rows ?? [];
}
