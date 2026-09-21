# Çelmak Satış ve Pazarlama Sistemi — Durum ve Eksik Analizi

**Rapor tarihi:** 31 Ağustos 2026  
**İncelenen kapsam:** React arayüzü, Express API, SQLite veri modeli, satış/onay/cari/tahsilat/çek-senet/sevkiyat/e-belge/güvenlik akışları

## 1. Yönetici özeti

Sistem bugün itibarıyla bir satış operasyonunun temel omurgasını çalıştıran güçlü bir prototiptir. Müşteri seçimi, satış oluşturma, elle satış fiyatı belirleme, taksit ve kıymetli evrak planı, yönetici onayı, cari borçlandırma, tahsilat, çek/senet hareketleri, parçalı sevkiyat, rol bazlı erişim ve denetim kaydı aynı uygulamada birbirine bağlanmıştır.

Ancak sistem henüz canlı üretim için muhasebesel ve operasyonel olarak güvenli değildir. En kritik nedenler şunlardır:

1. Stok satışta ayrılmıyor ve sevkiyatta fiziksel stoktan düşmüyor.
2. Risk limiti ile minimum satış fiyatı yalnızca bilgi olarak bulunuyor; satışa veya onaya bağlayıcı kural uygulanmıyor.
3. Vadeden bağımsız çek, gerçek bir çek portföy kaydı oluşturmadan cariyi hemen kapatıyor.
4. Satış taslağını düzeltme, satırları güncelleme, iptal/iade ve fiyat revizyonu akışları eksik.
5. Taksit tarihleri ve tutarları tek tek düzenlenemiyor; yalnızca eşit tutar ve sabit gün aralığı destekleniyor.
6. ERP, e-Belge ve e-posta entegrasyonları gerçek servislerle bağlı değil.
7. Otomatik test, yedekleme, felaket kurtarma, gözlemleme ve üretim güvenliği katmanları tamamlanmamış.

Bu nedenle mevcut sürüm demo, süreç doğrulama ve kullanıcı kabul çalışması için uygundur; finansal kayıtların tek ve resmî kaynağı olarak kullanılmadan önce aşağıdaki P0 maddeleri tamamlanmalıdır.

## 2. Mevcut durumda çalışan özellikler

### Müşteri ve yetkilendirme

- Müşteri kartı oluşturma, otomatik/manuel/ERP kaynaklı müşteri kodu
- Vergi numarası, iletişim, şehir, varsayılan vade, risk limiti ve cari bakiye
- Yönetici, satış, muhasebe, sevkiyat ve denetçi rolleri
- Kullanıcı bazında modül izinleri
- Parola, HttpOnly oturum, TOTP iki aşamalı doğrulama ve passkey altyapısı
- Yönetici vekâleti ve cihaz oturumu kapatma

### Satış ve onay

- Ürün ve miktar seçerek satış taslağı oluşturma
- Satış satırında birim fiyatı elle belirleme
- TRY, USD ve EUR işlemleri ile işlem kuru
- KDV, ara toplam ve genel toplam hesabı
- Peşin, vadeli, çek/senet ve peşinat + evrak seçenekleri
- Onaya gönderme; onay, ret ve düzeltme isteme
- İşlemi oluşturan kişinin kendi satışını onaylamasını engelleme
- Onaylanan satışın müşteri carisine borç yazılması

### Vade, cari ve kıymetli evrak

- Taksit adedi, ilk vade ve elle gün cinsinden vade aralığı
- Onay sonrası çek/senet planından evrak üretme
- Nakit, havale/EFT ve vadeden bağımsız çek yöntemi seçimi
- Vadeye bağlı kısmi tahsilat ve kalan tutar kontrolü
- Tahsilat ters kaydı
- Çek/senet portföy, banka, tahsil, karşılıksız, protesto, iade, ciro ve temlik durumları
- Dövizli evrakta tahsilat kuru ve kur farkı cari hareketi
- Müşteri mutabakat kaydı

### Sevkiyat ve e-Belge

- Onaylı satıştan parçalı sevkiyat planlama
- Satış miktarından fazla sevkiyatı engelleme
- Hazırlanıyor, hazır, yolda, kısmi teslim, teslim ve iptal durumları
- e-Fatura, e-Arşiv ve e-İrsaliye için sağlayıcı/kuyruk veri modeli

### İzlenebilirlik

- Kritik hareketlerde kullanıcı, IP, korelasyon numarası ve eski/yeni değer içeren denetim kaydı
- Denetim kayıtlarının güncellenmesini ve silinmesini engelleyen veritabanı tetikleyicileri
- Bildirim ve onay kaydı altyapısı

## 3. Kritik eksikler ve riskler

### P0 — Canlı kullanımdan önce zorunlu

#### 3.1 Vadeden bağımsız çek muhasebe olarak yanlış erken kapanıyor

Serbest tahsilat formunda “Çek” seçilebiliyor; fakat bu işlem şu anda doğrudan tamamlanmış tahsilat gibi cariye alacak yazıyor. Banka, keşideci, seri numarası, düzenleme tarihi ve vade alınmıyor; `negotiable_instruments` kaydı oluşmuyor. Çek karşılıksız çıktığında cariyi güvenli şekilde geri açacak ilişki de bulunmuyor.

**Olması gereken:** Serbest çek alındığında önce portföy evrakı oluşturulmalı. Politika seçimine göre cari ya çek alındığında “müşteri çeki” ara hesabına aktarılmalı ya da yalnızca çek gerçekten tahsil edildiğinde kapanmalıdır. Karşılıksız/iade halinde otomatik ters cari hareket oluşmalıdır.

#### 3.2 Stok rezervasyonu ve stok hareket defteri yok

Taslak oluştururken ürünün o anki stok miktarı kontrol ediliyor; ancak stok rezerve edilmiyor. Aynı stok birden fazla satışa ayrılabilir. Sevkiyat kaydı da ürün kartındaki `stock_quantity` değerini azaltmıyor. Depo, lot, seri numarası ve stok hareket geçmişi bulunmuyor.

**Olması gereken:** `inventory_movements`, `stock_reservations`, depo ve gerekirse lot/seri tabloları kurulmalı. Onayda rezervasyon, sevk/teslim aşamasında stok çıkışı, iptalde rezervasyon çözme atomik işlemle yapılmalıdır.

#### 3.3 Risk ve fiyat politikaları uygulanmıyor

Müşteride risk limiti ve üründe minimum fiyat mevcut, fakat sunucu satış oluşturma/onaylama sırasında bunları engelleyici veya ek onaya yönlendirici kural olarak kullanmıyor. Elle fiyat girişi bu açığı daha önemli hale getirdi.

**Olması gereken:** Minimum fiyat altı, iskonto oranı, brüt kâr, müşteri açık bakiye + açık sipariş + portföy riski ve gecikmiş borç kuralları hesaplanmalı. İhlaller yetki matrisine göre engellenmeli veya ikinci/kademeli onaya gitmelidir.

#### 3.4 Satış düzeltme ve değişiklik yönetimi eksik

Yönetici “düzeltme iste” diyebiliyor, ancak satışın satırlarını, fiyatını, vadesini ve notunu düzenleyen tam bir API/arayüz akışı yok. Taslak silme/iptal, onay sonrası değişiklik emri ve revizyon sürümü de bulunmuyor.

**Olması gereken:** Taslak düzenleme, revizyon numarası, değişiklik karşılaştırması, yeniden onay ve onay sonrası iptal/değişiklik belgesi eklenmelidir. Finansal kayıtlar silinmemeli; ters kayıtla düzeltilmelidir.

#### 3.5 Gerçek esnek ödeme planı eksik

Vade aralığı artık elle gün olarak girilebilir; ancak bütün taksitler eşit tutarlı ve aralıkları aynıdır. İş dünyasında her taksidin tarihi, tutarı ve ödeme türü farklı olabilir.

**Olması gereken:** Kullanıcı satır bazında “tarih + tutar + ödeme türü” girebilmeli; toplam plan satışın vadeli kalanına tam eşit olmalıdır. Son taksitte kuruş düzeltmesi, balon ödeme, ara ödeme ve farklı çek vadeleri desteklenmelidir.

#### 3.6 Resmî entegrasyonlar bağlı değil

e-Belge modülü kuyruk kaydı üretse de gerçek GİB/özel entegratör gönderimi yoktur. ERP müşteri, ürün, stok ve cari verisi gerçek zamanlı eşitlenmiyor. Parola sıfırlama e-postası üretimde teslim edecek bir servisle bağlı değildir.

**Olması gereken:** Sağlayıcı adaptörü, kimlik bilgisi kasası, idempotency anahtarı, retry/backoff, hata kuyruğu, durum sorgulama, belge XML/PDF saklama ve mutabakat işleri tamamlanmalıdır.

#### 3.7 Yedekleme ve geri yükleme yok

SQLite dosyası tek operasyonel veridir. Otomatik şifreli yedek, uzak kopya, geri yükleme testi ve felaket kurtarma hedefi tanımlı değildir.

**Olması gereken:** En az günlük yedek + sık WAL snapshot, farklı lokasyonda şifreli saklama, periyodik geri yükleme testi, RPO/RTO hedefleri ve büyüme halinde PostgreSQL geçiş planı hazırlanmalıdır.

#### 3.8 Otomatik test paketi yok

TypeScript, lint ve üretim derlemesi çalışıyor; ancak birim, API entegrasyon ve uçtan uca test komutu bulunmuyor. Finansal akışlarda regresyon riski yüksektir.

**Olması gereken:** Özellikle çift onay, eşzamanlı stok, tahsilat/ters kayıt, çek karşılıksız, kur farkı, kuruş yuvarlama ve yetkisiz erişim senaryoları otomatik test edilmelidir.

## 4. Yüksek öncelikli işlevsel eksikler

### P1 — Operasyonun sağlıklı yürütülmesi için

- **Teklif ve sipariş ayrımı:** Teklif, revizyon, geçerlilik tarihi, siparişe dönüşüm ve kaybedilme nedeni yok.
- **Ürün yönetimi:** Arayüzden ürün ekleme/düzenleme, fiyat listesi, müşteri özel fiyatı, kampanya ve tarihçeli fiyat yok.
- **Müşteri yönetimi:** Müşteri düzenleme, pasife alma, çoklu adres, yetkili kişiler ve ödeme/teslimat adresleri yok.
- **İskonto modeli:** Satır ve belge iskonto oranı/tutarı, kampanya ve onay eşiği yok.
- **Maliyet ve kârlılık:** Ürün maliyeti, kur etkisi, satış brüt kârı ve satışçı marj görünümü yok.
- **Vergi ayrıntıları:** Tevkifat, istisna, ÖTV, farklı KDV senaryoları, vergi dairesi ve gerçek kişi/tüzel kişi ayrımı yok.
- **İade ve alacak dekontu:** Satış iadesi, kısmi iade, sevkiyat iadesi, fiyat farkı ve cari alacaklandırma akışı yok.
- **İptal kuralları:** Satış, sevkiyat, evrak ve e-Belge arasında zincirleme iptal/geri alma politikası tamamlanmamış.
- **Tahsilat eşleştirme:** Banka ekstresi içe aktarma, otomatik eşleştirme, açık hesap kapama ve mahsuplaşma yok.
- **Çek ayrıntıları:** Şube, hesap/IBAN, çek sahibi vergi no, ciro zinciri görsel geçmişi, fiziksel kasa yeri ve teslim tutanağı yok.
- **Kur politikası:** Kur kaynağı/saat bilgisi, satış kuru yetkisi, kur marjı ve geçmiş kur değişiklik onayı yok.
- **Satış tamamlanma kuralı:** Satışın ne zaman `COMPLETED` olacağını otomatik belirleyen net bir süreç görünmüyor.
- **Bildirim yönetimi:** Okundu işaretleme, tercih, e-posta/SMS, gecikmiş vade ve yaklaşan çek bildirimleri yok.
- **Belge ve dosya ekleri:** Teklif PDF'i, sözleşme, dekont, çek görüntüsü, teslim tutanağı ve ek dosya yönetimi yok.
- **Arama ve filtreleme:** Büyük veri hacmi için sunucu tarafı sayfalama, gelişmiş filtre, kayıtlı görünüm ve dışa aktarma yok.

## 5. Ticari sistemlerde genellikle gereken fakat kapsam dışında kalanlar

### P2 — Ölçekleme ve yönetim

- CRM fırsat, potansiyel müşteri, aktivite, ziyaret, görev ve hatırlatma
- Satış hedefi, kota, prim/komisyon ve bölge/temsilci performansı
- Tedarik, satın alma, tedarikçi ve minimum stok planlama
- Çoklu şirket, şube, depo, kasa ve banka hesabı
- Masraf merkezi, proje ve kârlılık boyutları
- Bütçe–gerçekleşen karşılaştırması
- Yaşlandırma raporu (0–30, 31–60, 61–90, 90+ gün)
- Nakit akış tahmini ve beklenen tahsilat takvimi
- Ürün, müşteri, şehir, temsilci ve kanal bazlı satış analizi
- İade oranı, teslimat performansı ve tahsilat performansı KPI'ları
- Excel/PDF raporları ve zamanlanmış e-posta raporları
- Mobil/PWA kullanım, barkod/QR ve depo el terminali
- KVKK saklama, anonimleştirme, açık rıza ve veri sahibi talep süreçleri
- Muhasebe hesap planı ve ERP fiş numarası eşleştirmesi

## 6. Teknik ve güvenlik eksikleri

- Login ve parola sıfırlama uçlarında hız sınırlama/hesap kilitleme görünmüyor.
- Güvenlik başlıkları için Helmet benzeri katman ve açık CSP politikası yok.
- Cookie tabanlı değiştirici isteklerde açık CSRF token mekanizması yok; SameSite koruması tek başına üretim mimarisine göre yeterli olmayabilir.
- Başlangıç kullanıcıları ortak geliştirme parolasıyla tohumlanıyor; üretim açılışında zorunlu parola değiştirme politikası uygulanmalı.
- Şifreleme anahtarları ve entegrasyon sırları için secrets manager yok.
- Merkezi log, metrik, alarm, hata izleme ve sağlık bağımlılık kontrolü yok.
- API sürümleme, OpenAPI sözleşmesi ve istemci sözleşme testi yok.
- Veritabanı migration sistemi yalnızca kolon ekleme yaklaşımında; geri dönüşlü, sıralı migration aracı yok.
- Büyük listelerde sayfalama olmadığı için veri büyüdükçe performans düşer.
- Finansal tutarlar SQLite `REAL` ve JavaScript `number` ile tutuluyor; kuruş hassasiyeti için integer minor-unit veya kesin decimal yaklaşımı daha güvenlidir.
- Bağımlılıkların çoğu `latest`; tekrarlanabilir ve kontrollü yükseltme politikası gerekir.

## 7. Önerilen hedef iş akışları

### Satış

`Fırsat → Teklif → Revizyon → Sipariş → Fiyat/risk onayı → Stok rezervasyonu → Sevkiyat → Fatura → Tahsilat → Kapanış`

### Çek

`Çek teslim alındı → Evrak bilgileri doğrulandı → Portföye alındı → Bankaya/ciroya/temliğe verildi → Tahsil veya karşılıksız → Cari ve muhasebe hareketi`

### İade

`İade talebi → Yetkili onayı → Mal kabul → Stok girişi → İade faturası/alacak dekontu → Cari düzeltme`

## 8. Önerilen uygulama sırası

### Faz 1 — Finansal ve operasyonel güvenlik

1. Serbest çek alımını gerçek kıymetli evrak akışına dönüştürme
2. Minimum fiyat, iskonto, risk limiti ve gecikmiş borç onay kuralları
3. Satır bazlı esnek ödeme planı
4. Taslak düzenleme ve revizyon geçmişi
5. Stok rezervasyonu ve stok hareket defteri
6. Otomatik API/entegrasyon/E2E testleri

### Faz 2 — Ticari bütünlük

1. Teklif–sipariş ayrımı ve PDF teklif
2. Müşteri/ürün/fiyat listesi yönetimi
3. İade, iptal, fiyat farkı ve alacak dekontu
4. Banka ekstresi ve tahsilat eşleştirme
5. Dosya ekleri ve belge arşivi
6. Yaşlandırma, nakit akışı ve kârlılık raporları

### Faz 3 — Entegrasyon ve canlıya geçiş

1. Seçilen ERP ve e-Belge sağlayıcısının gerçek entegrasyonu
2. SMTP/SMS ve zamanlanmış bildirimler
3. PostgreSQL veya yönetilen veritabanı değerlendirmesi
4. Şifreli yedekleme, geri yükleme ve felaket kurtarma testi
5. HTTPS, secrets manager, rate limit, CSP/CSRF ve güvenlik testi
6. İzleme, alarm, merkezi log ve operasyon runbook'u

## 9. Kabul kriterleri

Sistem ancak aşağıdaki kontroller başarıyla geçtiğinde canlı finansal kayıt sistemi kabul edilmelidir:

- Aynı stok iki eşzamanlı satışa ayrılamıyor.
- Minimum fiyat/risk ihlali yetkisiz kişi tarafından onaylanamıyor.
- Her ödeme planının toplamı satışın kalan tutarına kuruşu kuruşuna eşit.
- Çek alınması, tahsil edilmesi ve karşılıksız çıkması cari hesapta doğru ve terslenebilir kayıt oluşturuyor.
- Satış revizyonunda eski ve yeni değerler denetim kaydında görülebiliyor.
- Tahsilat ve ters kayıt tekrar gönderilse bile çift kayıt oluşmuyor.
- Yetkisiz kullanıcı arayüzden ve doğrudan API'den kritik işleme erişemiyor.
- Yedekten boş ortama geri yükleme testi başarıyla tamamlanıyor.
- ERP/e-Belge tekrar denemelerinde çift belge veya çift fiş oluşmuyor.
- Kritik finansal senaryolar otomatik test paketinde geçiyor.

## 10. Sonuç

Mevcut ürünün en güçlü tarafı, birbirinden kopuk ekranlar yerine satıştan cariye ve sevkiyata uzanan bir omurga kurmuş olmasıdır. En büyük açık ise verilerin bulunmasına rağmen kritik iş kurallarının tamamının henüz zorlayıcı olmamasıdır. Yeni özellik eklemeden önce çek muhasebesi, fiyat/risk kontrolü, stok rezervasyonu, gerçek esnek vade planı ve revizyon akışı sağlamlaştırılırsa sistem güvenilir bir ticari operasyona dönüşebilir.
