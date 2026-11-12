// Küçük, bağımlılıksız .xlsx / .csv okuyucu.
// .xlsx bir zip arşividir: tarayıcının DecompressionStream'i ile açılır, XML'i DOMParser ile okunur.
// Yalnızca ilk çalışma sayfasının hücre metinleri döner (biçim, formül, birleştirme yok sayılır).

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

async function readXlsx(bytes: Uint8Array): Promise<string[][]> {
  const entries = zipEntries(bytes);
  const read = async (path: string) => {
    const entry = entries.get(path);
    return entry ? entryText(bytes, entry) : undefined;
  };
  // İlk sayfanın dosya yolunu workbook ilişkilerinden bul.
  let sheetPath = "xl/worksheets/sheet1.xml";
  const workbook = await read("xl/workbook.xml");
  const rels = await read("xl/_rels/workbook.xml.rels");
  if (workbook && rels) {
    const firstSheet = all(xml(workbook), "sheet")[0];
    const relId = firstSheet?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || firstSheet?.getAttribute("r:id");
    const target = all(xml(rels), "Relationship").find((r) => r.getAttribute("Id") === relId)?.getAttribute("Target");
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  const shared: string[] = [];
  const sharedText = await read("xl/sharedStrings.xml");
  if (sharedText)
    for (const item of all(xml(sharedText), "si"))
      shared.push(all(item, "t").filter((t) => (t.parentElement?.localName || "") !== "rPh").map((t) => t.textContent || "").join(""));
  const sheetText = await read(sheetPath);
  if (!sheetText) throw new Error("Excel dosyasında çalışma sayfası bulunamadı.");
  const rows: string[][] = [];
  for (const row of all(xml(sheetText), "row")) {
    const rowIndex = Number(row.getAttribute("r")) - 1 || rows.length;
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
  return Array.from(rows, (row) => row ?? []);
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

/** Excel (.xlsx) veya CSV dosyasının ilk sayfasını hücre metinleri olarak döndürür. */
export async function readSpreadsheet(file: File): Promise<string[][]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name.toLocaleLowerCase("tr-TR");
  if (name.endsWith(".csv")) {
    const utf8 = new TextDecoder("utf-8").decode(bytes);
    // Excel'in Türkçe CSV çıktısı çoğunlukla Windows-1254'tür.
    const invalidUtf8 = utf8.includes(String.fromCharCode(0xfffd));
    const withoutBom = utf8.charCodeAt(0) === 0xfeff ? utf8.slice(1) : utf8;
    return readCsv(invalidUtf8 ? new TextDecoder("windows-1254").decode(bytes) : withoutBom);
  }
  if (name.endsWith(".xls")) throw new Error("Eski .xls biçimi desteklenmiyor. Excel'de “Farklı kaydet → Excel Çalışma Kitabı (.xlsx)” ile kaydedip tekrar deneyin.");
  return readXlsx(bytes);
}
