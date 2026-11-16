// Firma adı benzerliği: farklı yazılmış aynı cariyi bulmak için ("ALABAŞ TİC." ≈ "ALABAŞ TİCARET").
// Ünvan ekleri yok sayılır, sektör kelimeleri düşük ağırlık alır, kısaltmalar tek biçime çevrilir.

const canonical: Record<string, string> = {
  TİC: "TİCARET", TIC: "TİCARET", TİCARETİ: "TİCARET",
  MAK: "MAKİNA", MAKİNE: "MAKİNA", MAKİNALARI: "MAKİNA", MAKİNELERİ: "MAKİNA", MAKINA: "MAKİNA",
  KOOP: "KOOPERATİF", KOOPERATİFİ: "KOOPERATİF", KOOPERATIFI: "KOOPERATİF",
  ZİRAİ: "ZİRAAT", MOT: "MOTORLU", OTO: "OTOMOTİV",
  İNŞ: "İNŞAAT", MAL: "MALZEME", MALZEMELERİ: "MALZEME", ARAÇ: "ARAÇLAR",
};
const ignored = new Set(["LTD", "LİMİTED", "LIMITED", "ŞTİ", "STI", "ŞİRKETİ", "ŞİRKET", "SAN", "SANAYİ", "SANAYI", "VE", "AŞ", "AS", "A", "Ş", "İÇ", "DIŞ", "İTH", "İHR", "PAZ", "PAZARLAMA", "SAYILI", "SAY", "S", "T", "K", "KK", "TKK"]);
const generic = new Set(["TİCARET", "TARIM", "TARIMSAL", "MAKİNA", "ZİRAAT", "KOOPERATİF", "OTOMOTİV", "TRAKTÖR", "ALET", "ALETLERİ", "PANCAR", "GIDA", "İNŞAAT", "PETROL", "HAYVANCILIK", "MOTORLU", "ARAÇLAR", "YEDEK", "PARÇA", "KALKINMA", "ÜRÜNLERİ", "BAYİSİ", "GALERİ", "SERVİS", "MALZEME"]);

export function nameTokens(name: string): Map<string, number> {
  const tokens = new Map<string, number>();
  const words = name
    .toLocaleUpperCase("tr-TR")
    .replace(/[^0-9A-ZÇĞİÖŞÜ]+/g, " ")
    .split(" ")
    .filter(Boolean);
  for (const raw of words) {
    const word = canonical[raw] || raw;
    if (ignored.has(word)) continue;
    tokens.set(word, generic.has(word) ? 0.35 : 1);
  }
  return tokens;
}

/** 0–1 arası benzerlik (ağırlıklı Dice katsayısı). */
export function nameSimilarity(a: Map<string, number>, b: Map<string, number>) {
  let common = 0;
  let total = 0;
  for (const [token, weight] of a) {
    total += weight;
    if (b.has(token)) common += weight;
  }
  for (const weight of b.values()) total += weight;
  return total ? (2 * common) / total : 0;
}

export const exactNameKey = (name: string) => name.replace(/\s+/g, " ").trim().toLocaleUpperCase("tr-TR");

export type Candidate<T> = { item: T; score: number };

/** Boşluk ve noktalama farkı ("ÖZ TEKNİK İŞ" / "ÖZTEKNİK İŞ") için anlamlı kelimelerin bitişik hali. */
const compactKey = (tokens: Map<string, number>) => [...tokens.keys()].join("");

/** Her aday için benzerlik puanını hesaplayıp en iyileri döndürür. */
export function rankCandidates<T>(name: string, items: { item: T; tokens: Map<string, number>; key: string }[], limit = 6): Candidate<T>[] {
  const key = exactNameKey(name);
  const tokens = nameTokens(name);
  const compact = compactKey(tokens);
  return items
    .map((entry) => ({ item: entry.item, score: entry.key === key ? 1 : compact && compactKey(entry.tokens) === compact ? 0.95 : nameSimilarity(tokens, entry.tokens) }))
    .filter((c) => c.score >= 0.4)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}
