import type { DatabaseSync } from 'node:sqlite'

// Illustrative catalog only: names are generic, prices/stocks are demo values,
// and compatibility with any specific manufacturer's model is not certified.
const groups: { code: string; machine: string; parts: [string, number, number, 'STANDARD' | 'READY', string?][] }[] = [
  { code: 'TMB', machine: '165 Tamburlu', parts: [
    ['Biçme bıçağı', 180, 120, 'READY'],
    ['Bıçak bağlantı pimi', 95, 80, 'READY'],
    ['Bıçak tutucu', 420, 36, 'READY'],
    ['Alt kaydırma diski', 2450, 12, 'READY'],
    ['Tambur göbeği', 1850, 16, 'READY'],
    ['Tahrik kayışı takımı', 1650, 18, 'STANDARD', 'Takım'],
    ['Tambur mili rulmanı', 620, 30, 'STANDARD'],
    ['Mil keçesi', 140, 45, 'STANDARD'],
    ['Koruyucu branda', 3200, 8, 'READY'],
    ['Gergi kasnağı', 950, 14, 'READY'],
  ] },
  { code: 'SLJ', machine: '3 Sıralı Silaj Makinası', parts: [
    ['Doğrama bıçağı', 1450, 48, 'READY'],
    ['Sabit karşı bıçak', 2850, 15, 'READY'],
    ['Besleme merdanesi', 8750, 6, 'READY'],
    ['Besleme zinciri', 2450, 20, 'STANDARD'],
    ['Zincir tahrik dişlisi', 1650, 18, 'READY'],
    ['Sıra ayırıcı burun', 3200, 9, 'READY'],
    ['Üfleme fanı kanadı', 1950, 16, 'READY'],
    ['Baca yönlendirme halatı', 780, 14, 'READY'],
    ['Şaft istavrozu', 1250, 22, 'STANDARD'],
    ['Emniyet kavraması balata takımı', 2250, 10, 'READY', 'Takım'],
  ] },
  { code: 'KLT', machine: 'Kültivatör', parts: [
    ['Kazayağı uç demiri', 480, 90, 'READY'],
    ['Dar uç demiri', 340, 75, 'READY'],
    ['Yaylı ayak', 1850, 24, 'READY'],
    ['Ayak bağlantı kelepçesi', 520, 40, 'READY'],
    ['Uç demiri cıvata-somun takımı', 85, 150, 'STANDARD', 'Takım'],
    ['Derinlik tekeri', 2950, 10, 'READY'],
    ['Teker aks burcu', 280, 32, 'READY'],
    ['Üç nokta askı pimi', 320, 45, 'STANDARD'],
    ['Merdane yatak rulmanı', 680, 26, 'STANDARD'],
    ['Tesviye tırmığı yayı', 240, 65, 'READY'],
  ] },
  { code: 'RMK', machine: 'Römork', parts: [
    ['Teker poryası', 2850, 12, 'READY'],
    ['Porya rulman takımı', 1350, 20, 'STANDARD', 'Takım'],
    ['Bijon ve somun takımı', 160, 100, 'STANDARD', 'Takım'],
    ['Yaprak makas paketi', 4650, 8, 'READY'],
    ['Arka stop lambası', 650, 24, 'READY'],
    ['Yedi kutuplu elektrik fişi', 220, 36, 'STANDARD'],
    ['Kasa kapak menteşesi', 380, 40, 'READY'],
    ['Kapak kilit mandalı', 450, 35, 'READY'],
    ['Damper hidrolik hortumu', 1150, 16, 'READY'],
    ['Çeki oku bağlantı pimi', 720, 20, 'READY'],
  ] },
]

export function seedDemoSpareParts(db: DatabaseSync) {
  const insert = db.prepare(`INSERT INTO products
    (code,name,unit,unit_price,minimum_price,vat_rate,stock_quantity,part_category,inventory_source)
    VALUES (?,?,?,?,?,20,?,?,'LOCAL') ON CONFLICT(code) DO NOTHING`)
  for (const group of groups) {
    group.parts.forEach(([name, price, stock, category, unit], index) => {
      insert.run(`CLM-YP-${group.code}-${String(index + 1).padStart(3, '0')}`,
        `${group.machine} · ${name}`, unit || 'Adet', price, Math.round(price * 0.9), stock, category)
    })
  }
}
