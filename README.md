# Çelmak Satış ve Pazarlama

Yol haritasının ilk çalışan sürümü. Bu sürüm müşteri ve ürün ana verilerini, satış taslağı oluşturmayı, yönetici onayına göndermeyi, onay/ret/düzeltme kararlarını, bildirimleri ve değiştirilemez denetim kayıtlarını içerir.

## Çalıştırma

```bash
npm install
npm run dev
```

- Web arayüzü: `http://localhost:3000`
- API: `http://127.0.0.1:3001/api`
- Yerel veritabanı: `data/celmak.db` (ilk çalıştırmada otomatik oluşur)

## Demo kullanıcıları

Arayüzün sağ üstündeki kullanıcı seçicisinden rol değiştirilebilir:

- Selin Yılmaz — Satış
- Mehmet Kaya — Yönetici
- Zeynep Demir — Muhasebe
- Ali Çetin — Sevkiyat

Bu seçici yalnızca ilk geliştirme sürümündeki rol ve onay akışını kolay test etmek içindir. Canlı sürümde kişisel kullanıcı hesabı, parola/passkey ve iki aşamalı doğrulama ile değiştirilecektir.

## Temel demo akışı

1. Satış kullanıcısı ile yeni satış taslağı oluşturun.
2. Satışlar ekranından `Onaya gönder` seçeneğini kullanın.
3. Sağ üstten yönetici kullanıcısına geçin.
4. Onaylar ekranında satışa onay, ret veya düzeltme kararı verin.
5. Denetim Kayıtları ekranından bütün hareketleri inceleyin.

## Kontroller

```bash
npm run typecheck
npm run lint
npm run build
npm audit
```

## Mevcut kapsam

- React + TypeScript responsive arayüz
- Node.js/Express API
- Node.js yerleşik SQLite veritabanı
- Sunucu tarafında rol bazlı yetki kontrolü
- Müşteri ve ürün örnek verileri
- Yeni müşteri oluşturma ve otomatik/manuel/ERP kaynaklı müşteri kodu
- Müşteri detay merkezi: satış, ödeme planı, çek/senet ve sevkiyat geçmişi
- Otomatik fiyat/KDV/toplam hesaplama
- Satış taslağı ve onaya gönderme
- Yönetici onay, ret ve düzeltme kararı
- Kullanıcı bildirimleri
- TRY, USD ve EUR satış para birimleri ile sabit işlem kuru
- Otomatik çek/senet adet ve vade planı
- Onay sonrası planlı kıymetli evrak üretimi
- Çek/senet portföy, banka, tahsilat, karşılıksız, protesto, ciro ve temlik hareketleri
- Logo/Mikro/Netsis/özel entegratör için e-Belge adaptör kuyruğu ve sağlayıcı seçimi
- Yerel veya harici stok kaynağı ayarı
- Onaylı satıştan otomatik ve parçalı sevkiyat oluşturma
- Satılan/sevk edilen/kalan miktar kontrolü
- Hazırlanıyor, sevke hazır, yolda, kısmi teslim ve teslim edildi durumları
- Çift kayıt korumalı gerçek cari hareket defteri
- Onaylı satış borcu, peşinat, nakit ve banka tahsilatı
- Tahsilat ters kayıt ve müşteri mutabakatı
- Normal vadeli satışlarda otomatik taksit planı
- TCMB günlük döviz satış kuru adaptörü
- Dövizli kıymetli evrakta tahsilat kuru ve kur farkı cari hareketi
- Kişisel e-posta/parola girişi ve HttpOnly oturum çerezi
- TOTP iki aşamalı doğrulama
- WebAuthn/passkey kayıt ve giriş
- Cihaz oturumları, parola sıfırlama tokenları ve tarihli yönetici vekâleti
- Otomatik, elle veya ERP kaynaklı müşteri kodu mimarisi
- Güncellenmesi ve silinmesi veritabanı tetikleyicileriyle engellenen denetim kayıtları
- Korelasyon numaralı API işlemleri

## Sonraki geliştirme adımı

Gerçek kimlik doğrulama ve iki aşamalı doğrulama tamamlandıktan sonra cari hareket ve kur farkı muhasebeleştirmesi, sevkiyat tabloları, gerçek e-posta sağlayıcısı ve seçilecek ERP/e-Belge servisinin kimlik bilgileri bağlanacaktır.

> e-Belge ekranındaki sağlayıcı seçimi adaptör ve kuyruk katmanını test eder. Logo/Mikro/Netsis veya özel entegratörün gerçek API kimlik bilgileri tanımlanmadan GİB'e resmî belge gönderilmez.

## İlk giriş

- Kullanıcı e-postalarından biriyle giriş yapılır (`selin@celmak.com`, `mehmet@celmak.com`, `zeynep@celmak.com`, `ali@celmak.com`, `ayse@celmak.com`).
- İlk geliştirme parolası: `Celmak!2026`
- Canlıya geçişten önce bütün başlangıç parolaları değiştirilmelidir.
- Yerel geliştirmede parola sıfırlama bağlantısı API terminaline yazılır. Canlı ortamda e-posta sağlayıcısına teslim edilecektir.
- Passkey `localhost` üzerinde çalışır; canlıda `WEBAUTHN_RP_ID` ve `WEBAUTHN_ORIGIN` HTTPS alan adına ayarlanmalıdır.
