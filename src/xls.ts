// Eski Excel (.xls, BIFF8) okuyucu — bağımlılıksız.
// Dosya bir OLE2 "Compound File" kabıdır; içindeki "Workbook" akışı BIFF kayıtlarından oluşur.
// Yalnızca hücre değerleri okunur (metin, sayı, formül sonucu); biçim ve formüller yok sayılır.

/** hiddenRows: Excel'de gizlenmiş satırların 0 tabanlı sıra numaraları. */
export type Sheet = { name: string; hidden: boolean; rows: string[][]; hiddenRows: number[] };

const END_OF_CHAIN = 0xfffffffe;
const FREE_SECTOR = 0xffffffff;

function readCompoundStream(bytes: Uint8Array, wanted: string[]): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0xe011cfd0 || view.getUint32(4, true) !== 0xe11ab1a1) throw new Error("Bu dosya geçerli bir .xls dosyası değil.");
  const sectorSize = 1 << view.getUint16(0x1e, true);
  const miniSectorSize = 1 << view.getUint16(0x20, true);
  const firstDirSector = view.getUint32(0x30, true);
  const miniCutoff = view.getUint32(0x38, true);
  const firstMiniFat = view.getUint32(0x3c, true);
  let difatSector = view.getUint32(0x44, true);
  const sectorOffset = (sid: number) => (sid + 1) * sectorSize;

  // FAT sektörlerinin listesi: başlıktaki 109 kayıt + DIFAT zinciri.
  const fatSectors: number[] = [];
  for (let i = 0; i < 109; i++) {
    const sid = view.getUint32(0x4c + i * 4, true);
    if (sid !== FREE_SECTOR) fatSectors.push(sid);
  }
  const perSector = sectorSize / 4;
  for (let guard = 0; difatSector !== END_OF_CHAIN && difatSector !== FREE_SECTOR && guard < 10000; guard++) {
    const base = sectorOffset(difatSector);
    for (let i = 0; i < perSector - 1; i++) {
      const sid = view.getUint32(base + i * 4, true);
      if (sid !== FREE_SECTOR) fatSectors.push(sid);
    }
    difatSector = view.getUint32(base + (perSector - 1) * 4, true);
  }
  const fat: number[] = [];
  for (const sid of fatSectors) {
    const base = sectorOffset(sid);
    for (let i = 0; i < perSector; i++) fat.push(view.getUint32(base + i * 4, true));
  }
  const chain = (start: number, table: number[]) => {
    const out: number[] = [];
    for (let sid = start; sid !== END_OF_CHAIN && sid < table.length && out.length <= table.length; sid = table[sid]) out.push(sid);
    return out;
  };
  const readChain = (start: number) => {
    const sids = chain(start, fat);
    const out = new Uint8Array(sids.length * sectorSize);
    sids.forEach((sid, i) => out.set(bytes.subarray(sectorOffset(sid), sectorOffset(sid) + sectorSize), i * sectorSize));
    return out;
  };

  const directory = readChain(firstDirSector);
  const dirView = new DataView(directory.buffer);
  type Entry = { name: string; type: number; start: number; size: number };
  const entries: Entry[] = [];
  for (let offset = 0; offset + 128 <= directory.length; offset += 128) {
    const nameLength = dirView.getUint16(offset + 0x40, true);
    const name = new TextDecoder("utf-16le").decode(directory.subarray(offset, offset + Math.max(0, nameLength - 2)));
    entries.push({ name, type: directory[offset + 0x42], start: dirView.getUint32(offset + 0x74, true), size: dirView.getUint32(offset + 0x78, true) });
  }
  const root = entries.find((e) => e.type === 5);
  const entry = entries.find((e) => e.type === 2 && wanted.includes(e.name));
  if (!entry) throw new Error("Excel dosyasında çalışma kitabı bulunamadı.");
  if (entry.size >= miniCutoff || !root) return readChain(entry.start).subarray(0, entry.size);

  // Küçük akışlar "mini stream" içinde tutulur.
  const miniStream = readChain(root.start);
  const miniFatBytes = readChain(firstMiniFat);
  const miniFatView = new DataView(miniFatBytes.buffer);
  const miniFat = Array.from({ length: miniFatBytes.length / 4 }, (_, i) => miniFatView.getUint32(i * 4, true));
  const sids = chain(entry.start, miniFat);
  const out = new Uint8Array(sids.length * miniSectorSize);
  sids.forEach((sid, i) => out.set(miniStream.subarray(sid * miniSectorSize, (sid + 1) * miniSectorSize), i * miniSectorSize));
  return out.subarray(0, entry.size);
}

const latin1 = new TextDecoder("windows-1252");
const utf16 = new TextDecoder("utf-16le");

function decodeRk(rk: number) {
  let value: number;
  if (rk & 2) value = rk >> 2; // 30 bitlik işaretli tam sayı
  else {
    const buffer = new DataView(new ArrayBuffer(8));
    buffer.setUint32(4, rk & 0xfffffffc, true);
    value = buffer.getFloat64(0, true);
  }
  return rk & 1 ? value / 100 : value;
}

const numberText = (value: number) => (Number.isFinite(value) ? String(value) : "");

export function readXls(bytes: Uint8Array): Sheet[] {
  const book = readCompoundStream(bytes, ["Workbook", "Book"]);
  const view = new DataView(book.buffer, book.byteOffset, book.byteLength);
  const records: { type: number; offset: number; length: number }[] = [];
  for (let pos = 0; pos + 4 <= book.length; ) {
    const type = view.getUint16(pos, true);
    const length = view.getUint16(pos + 2, true);
    records.push({ type, offset: pos + 4, length });
    pos += 4 + length;
  }
  const byOffset = new Map<number, number>();
  records.forEach((r, i) => byOffset.set(r.offset - 4, i));

  // Çalışma kitabı bölümü: sayfa listesi ve paylaşılan metinler (SST).
  const sheets: { name: string; hidden: boolean; bofOffset: number }[] = [];
  const shared: string[] = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r.type === 0x0085) {
      const nameLength = book[r.offset + 6];
      const high = book[r.offset + 7] & 1;
      const start = r.offset + 8;
      const name = high ? utf16.decode(book.subarray(start, start + nameLength * 2)) : latin1.decode(book.subarray(start, start + nameLength));
      sheets.push({ name, hidden: book[r.offset + 4] !== 0, bofOffset: view.getUint32(r.offset, true) });
    } else if (r.type === 0x00fc) {
      // SST ve ardından gelen CONTINUE kayıtlarını, sınırlarını hatırlayarak birleştir.
      const parts = [r];
      for (let j = i + 1; j < records.length && records[j].type === 0x003c; j++) parts.push(records[j]);
      const total = parts.reduce((s, p) => s + p.length, 0);
      const data = new Uint8Array(total);
      const boundaries = new Set<number>();
      let cursor = 0;
      for (const p of parts) {
        if (cursor) boundaries.add(cursor);
        data.set(book.subarray(p.offset, p.offset + p.length), cursor);
        cursor += p.length;
      }
      const dv = new DataView(data.buffer);
      const unique = dv.getUint32(4, true);
      let pos = 8;
      const nextBoundary = (from: number) => {
        let best = data.length;
        for (const b of boundaries) if (b > from && b < best) best = b;
        return best;
      };
      for (let n = 0; n < unique && pos < data.length; n++) {
        const count = dv.getUint16(pos, true);
        let flags = data[pos + 2];
        pos += 3;
        let runs = 0;
        let ext = 0;
        if (flags & 0x08) { runs = dv.getUint16(pos, true); pos += 2; }
        if (flags & 0x04) { ext = dv.getUint32(pos, true); pos += 4; }
        let text = "";
        let remaining = count;
        while (remaining > 0) {
          const width = flags & 1 ? 2 : 1;
          const limit = nextBoundary(pos);
          const fit = Math.min(remaining, Math.floor((limit - pos) / width));
          const chunk = data.subarray(pos, pos + fit * width);
          text += width === 2 ? utf16.decode(chunk) : latin1.decode(chunk);
          pos += fit * width;
          remaining -= fit;
          if (remaining > 0) {
            // Metin bir CONTINUE kaydına taşıyor: yeni kaydın ilk baytı genişlik bayrağıdır.
            flags = (flags & ~1) | (data[pos] & 1);
            pos += 1;
          }
        }
        pos += runs * 4 + ext;
        shared.push(text);
      }
    }
  }

  const xlString = (offset: number) => {
    const count = view.getUint16(offset, true);
    const high = book[offset + 2] & 1;
    const start = offset + 3;
    return high ? utf16.decode(book.subarray(start, start + count * 2)) : latin1.decode(book.subarray(start, start + count));
  };

  return sheets.map((sheet) => {
    const rows: string[][] = [];
    const set = (row: number, col: number, value: string) => {
      (rows[row] ||= [])[col] = value;
    };
    const hiddenRows = new Set<number>();
    const first = byOffset.get(sheet.bofOffset);
    let pendingFormula: { row: number; col: number } | null = null;
    if (first !== undefined)
      for (let i = first + 1; i < records.length; i++) {
        const r = records[i];
        const o = r.offset;
        if (r.type === 0x000a) break; // EOF
        if (r.type === 0x0208) {
          // ROW kaydı: seçenek bayraklarındaki fDyZero (0x20) satırın gizli olduğunu belirtir.
          if (view.getUint16(o + 12, true) & 0x20) hiddenRows.add(view.getUint16(o, true));
          continue;
        }
        if (r.type === 0x00fd) set(view.getUint16(o, true), view.getUint16(o + 2, true), shared[view.getUint32(o + 6, true)] ?? "");
        else if (r.type === 0x0203) set(view.getUint16(o, true), view.getUint16(o + 2, true), numberText(view.getFloat64(o + 6, true)));
        else if (r.type === 0x027e) set(view.getUint16(o, true), view.getUint16(o + 2, true), numberText(decodeRk(view.getInt32(o + 6, true))));
        else if (r.type === 0x00bd) {
          const row = view.getUint16(o, true);
          const firstCol = view.getUint16(o + 2, true);
          const count = (r.length - 6) / 6;
          for (let k = 0; k < count; k++) set(row, firstCol + k, numberText(decodeRk(view.getInt32(o + 4 + k * 6 + 2, true))));
        } else if (r.type === 0x0204) set(view.getUint16(o, true), view.getUint16(o + 2, true), xlString(o + 6));
        else if (r.type === 0x0006) {
          const row = view.getUint16(o, true);
          const col = view.getUint16(o + 2, true);
          if (view.getUint16(o + 12, true) === 0xffff) {
            const kind = book[o + 6];
            if (kind === 0) pendingFormula = { row, col }; // metin sonucu sonraki STRING kaydında
            else if (kind === 1) set(row, col, book[o + 8] ? "DOĞRU" : "YANLIŞ");
          } else set(row, col, numberText(view.getFloat64(o + 6, true)));
        } else if (r.type === 0x0207 && pendingFormula) {
          set(pendingFormula.row, pendingFormula.col, xlString(o));
          pendingFormula = null;
        }
      }
    return { name: sheet.name, hidden: sheet.hidden, rows: Array.from(rows, (row) => Array.from(row || [], (v) => v ?? "")), hiddenRows: [...hiddenRows].sort((a, b) => a - b) };
  });
}
