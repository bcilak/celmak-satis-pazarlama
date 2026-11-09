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


## Yedek parça, bağlantı avansı ve sipariş düzenleme

- **Yedek Parçalar** ekranında standart parça, hazır parça, yarı mamul ve diğer parça kaydedilebilir; cari seçilerek parça siparişi oluşturulur. Siparişler mevcut onay ve sevkiyat akışını kullanır.
- Kaynak sitenin API bağlantısı kullanıcı talebiyle ertelenmiştir; otomatik veri aktarımı yapılmaz. Gelecek adaptör `products.part_category`, `inventory_source`, `external_system` ve `external_id` alanlarını kullanabilir. Endpoint, kimlik doğrulama, sayfalama ve alan eşlemesi API dokümanı sağlandığında belirlenecektir. Mevcut ürünler makine olarak sınıflandırılır; yerel parça kayıtları ayrı tutulur.
- Sipariş belli olmadan alınan yıllık bağlantı ödemesi **Tahsilatlar → Genel cari ödemesi / yıllık bağlantı avansı** üzerinden nakit veya havale olarak kaydedilir. Yıl ve bağlantı açıklaması nota yazılabilir. Mevcut borçlar düşüldükten sonra kalan cari alacak bakiyesi avans olarak kullanılabilir.
- Yeni siparişte **Cari avansından kullanılacak tutar** girilir. Kalan tutar nakit veya vade/evrak planıyla tamamlanır. Mevcut avans ikinci bir tahsilat kaydı üretmez. Avansın TL karşılığı, siparişin sabit kuru üzerinden kontrol edilir. Taslaklar bakiyeyi rezerve etmez; onay anında bakiye tekrar kontrol edilir.
- **Düzenle** ile taslak ve düzeltme istenen siparişin cari, ürün, miktar, fiyat, KDV, not, avans ve ödeme planı değiştirilebilir. Sipariş numarası korunur, düzenleme denetim kaydına yazılır ve sipariş tekrar onaya gönderilir. Onay bekleyen veya onaylanmış sipariş doğrudan değiştirilemez.
- Onay kartındaki **Sipariş içeriğini ve ödeme planını gör** bağlantısı ürün satırlarını, toplamları, avansı ve notu açar. Yalnızca Onaylar ekranına erişimi olan yetkililer de bu detayı okuyabilir.

Akış testi (önce derleme gerekir):

```bash
npm run build
node tests/order-workflows.mjs
```

Test, ayrı geçici veritabanında 2 milyon TL avans, makine/parça siparişleri, kısmi mahsup, düzenleme/revizyon, mükerrer onay ve yetersiz bakiye kontrollerini çalıştırır.


### Birden fazla çek ile bağlantı avansı

Avanslar ekranında cari seçildikten sonra **Yöntem → Çek / birden fazla çek** kullanılır. **Çek ekle** ile her çekin tutarı, keşidecisi, banka/seri bilgileri, düzenleme tarihi ve vadesi ayrı girilir. Aynı bağlantıda tutarlar eşit olmak zorunda değildir; para birimi ve teslim alma kuru ortaktır. Farklı para birimleri ayrı bağlantı gruplarıyla kaydedilir.

İsteğe bağlı bağlantı hedefi, çek toplamıyla karşılaştırılır. Fark kaydı engellemez; cari avansa yalnızca çeklerin gerçek toplamı işlenir. Örneğin 500.000 + 500.000 + 1.000.000 + 1.000.000 TL toplam 3.000.000 TL'dir. 2.000.000 TL hedef girilirse 1.000.000 TL aşım gösterilir.

Çekler tek veritabanı işlemiyle kaydedilir; hatalı veya mükerrer çek tüm grubu geri alır. Tekrar gönderilen aynı işlem anahtarı ikinci bir kayıt oluşturmaz. Çekler portföye alınır; banka tahsilatı ayrıca Çek ve Senetler ekranından yapılır. Çekli bağlantı geçmişi grup, hedef, toplam ve her çekin güncel durumunu gösterir.
