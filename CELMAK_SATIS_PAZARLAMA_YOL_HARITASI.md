# Çelmak Satış ve Pazarlama Modülü

## Ürün Kapsamı, Tasarım Planı ve Geliştirme Yol Haritası

**Doküman durumu:** İlk kapsam ve planlama taslağı  
**Tarih:** 24 Ağustos 2026  
**Amaç:** Müşteri, satış, ödeme, çek, tahsilat ve sevkiyat süreçlerini mümkün olan en az manuel veri girişiyle, kontrollü onay akışları ve eksiksiz denetim kayıtları üzerinden yönetmek.

---

## 1. Projenin amacı

Çelmak Satış ve Pazarlama Modülü; bir müşteriye yapılan satışın oluşturulmasından tahsilatına ve ürünlerin sevk edilmesine kadar geçen süreci tek sistemde takip edecektir.

Sistemin temel hedefleri:

- Müşteri bilgilerinin tek merkezden yönetilmesi
- Kime, hangi ürünün, kaç adet ve hangi fiyatla satıldığının izlenmesi
- Peşinat, vadeli ödeme, çek ve diğer tahsilat yöntemlerinin takip edilmesi
- Çek vadelerinin, tahsil durumlarının ve gecikmelerin izlenmesi
- KDV oranlarının merkezi ve kontrollü biçimde uygulanması
- Satılan, sevk edilen ve sevk edilmesi kalan miktarların takip edilmesi
- Parçalı sevkiyat yapılabilmesi
- Çalışanın mümkün olduğunca veri yazmak yerine hazır seçimler kullanması
- Kullanıcı hatalarının sistem kurallarıyla engellenmesi
- Riskli veya kritik işlemlerin yönetici onayından sonra uygulanması
- Her kritik hareketin değiştirilemez denetim kayıtlarında tutulması
- Yönetimin güncel finansal ve operasyonel durumu tek ekrandan görebilmesi

---

## 2. Ana ürün prensipleri

### 2.0. Kesinleşen mimari kararlar — 24 Ağustos 2026

Bu kararlar Bölüm 26'daki açık soruların yerini alır ve geliştirmede esas alınır:

1. **e-Belge entegrasyonu:** Çelmak modülü e-Fatura, e-Arşiv Fatura ve e-İrsaliye için bir `Belge Sağlayıcı Adaptörü` kullanır. Kaynak; Logo, Mikro, Netsis, izinli özel entegratör veya ileride doğrudan GİB entegrasyonu olabilir. Satış/sevkiyat verisi Çelmak'ta hazırlanır; mali belge numarası, UUID/ETTN ve resmî durum kaynak sistemden döndüğünde kesinleşir. Sağlayıcı seçilmeden sistem resmî belge oluşturmuş sayılmaz.
2. **Kıymetli evrak:** Veri modeli yalnızca çeke özel değildir. `Çek` ve `Senet`, ortak `Kıymetli Evrak` varlığının türleridir.
3. **Ciro ve temlik:** Kıymetli evrak; portföy, bankaya verildi, tahsil edildi, karşılıksız/protestolu, iade, ciro edildi ve temlik edildi durumlarını destekler. Her devir ayrı hareket kaydıdır; geçmiş durum değiştirilmez.
4. **Döviz:** Satış, ödeme planı ve kıymetli evrak TRY, USD ve EUR destekler. Belge para birimi, işlem kuru, kur tarihi ve TL karşılığı işlem anında sabitlenir. Sonraki kur değişiklikleri geçmiş belgeyi değiştirmez; tahsilat kuru ile kayıt kuru arasındaki fark ayrı `Kur Farkı` cari hareketidir.
5. **Stok sahipliği:** Stok için varsayılan mimari `Harici Ana Kaynak`tır. Logo/Mikro/Netsis/ERP varsa stok oradan okunur; entegrasyon yoksa Çelmak yerel stok moduna alınabilir. Satış modülü stok miktarını doğrudan değiştirmez; rezervasyon/sevkiyat hareketi stok adaptörüne iletilir.
6. **Müşteri kodu:** `Çelmak iç kimliği` her zaman sistem tarafından üretilir; görünen müşteri kodu ise `Otomatik`, `Elle`, veya `Muhasebe/ERP Kaynaklı` olabilir. Entegrasyonda eşleştirme kod metniyle değil `external_system + external_id` alanlarıyla yapılır.
7. **Çek/senet vade planı:** Satışta kaç adet çek/senet kullanılacağı, ilk vade tarihi ve vadeler arasındaki gün sayısı seçilir. Sistem toplam kalan tutarı eşit taksitlere böler; yuvarlama farkını son evraka ekler. Kullanıcı isterse özel planla tutar ve vadeleri tek tek değiştirebilir.

GİB kapsamı ve geçiş zorunluluğu mükellefin durumu ile güncel mevzuata bağlı olduğundan, canlıya geçişte mali müşavir ve seçilen entegratörle doğrulanacaktır.

### 2.1. Bir bilgi yalnızca bir kez girilir

Müşteri, ürün, adres, KDV, ödeme koşulu ve sevkiyat bilgileri tekrar tekrar yazılmamalıdır. Sistem daha önce girilen bilgileri sonraki işlemlerde otomatik kullanmalıdır.

### 2.2. Yazmak yerine seçmek

Serbest metin mümkün olduğunca azaltılacaktır. Kullanıcılar aşağıdaki bilgileri tanımlı listelerden seçecektir:

- Müşteri
- Ürün
- KDV oranı
- Ödeme yöntemi
- Vade planı
- Banka
- Sevkiyat yöntemi
- Araç ve şoför
- İptal veya ret nedeni
- Teslimat adresi

Serbest metin yalnızca gerekli açıklama ve not alanlarında kullanılacaktır.

### 2.3. Varsayılan değerler

Sistem, kullanıcıdan istemeden önce uygun varsayılanı getirecektir:

- Müşterinin varsayılan ödeme koşulu
- Ürünün varsayılan KDV oranı
- Müşteriye özel veya standart satış fiyatı
- Son kullanılan teslimat adresi
- Satış tarihine göre hesaplanan vade
- Kalan ürünlerin tamamı için önerilen sevkiyat miktarı
- Tahsilat işleminde günün tarihi ve beklenen tutar

### 2.4. Satış, finans ve sevkiyat ayrı durumlarda takip edilir

Bir satışın finansal ve lojistik durumları birbirinden bağımsızdır. Örneğin ürün teslim edilmiş ancak tahsilat yapılmamış olabilir. Benzer şekilde peşinat alınmış ancak sevkiyat henüz başlamamış olabilir.

### 2.5. Silme yerine iptal veya ters kayıt

Finansal ve operasyonel kayıtlar fiziksel olarak silinmeyecektir. Hatalı kayıtlar yetkili onayıyla iptal edilecek veya ters hareket oluşturulacaktır. Eski kayıt ve işlem geçmişi korunacaktır.

### 2.6. Yetki verilmedikçe işlem yapılamaz

Her kullanıcı yalnızca görevini yapmak için gereken ekranlara, müşterilere ve işlemlere erişecektir.

---

## 3. Modül yapısı

Sistem aşağıdaki ana modüllerden oluşacaktır:

1. Kullanıcı ve yetki yönetimi
2. Müşteri ve cari hesap
3. Ürün ve fiyat yönetimi
4. Satış ve sipariş yönetimi
5. Ödeme planı, çek ve tahsilat
6. Sevkiyat yönetimi
7. Onay ve bildirim merkezi
8. Raporlama ve yönetim paneli
9. Güvenlik ve denetim kayıtları
10. Sistem tanımları ve ayarlar

Temel iş akışı:

```text
Müşteri
   ↓
Satış / Sipariş
   ├── Ürün, miktar, fiyat, indirim ve KDV
   ├── Peşinat
   ├── Vadeli ödeme / çek planı
   └── Sevkiyat planı
              ↓
       Yönetici onayı
              ↓
   ┌──────────┴──────────┐
Cari ve tahsilat     Sevkiyat
```

---

## 4. Kullanıcı rolleri ve yetkiler

İlk sürüm için önerilen roller:

### 4.1. Yönetici

- Tüm modülleri görüntüler
- Onay taleplerini sonuçlandırır
- Fiyat, indirim ve risk limitlerini yönetir
- Kullanıcı ve yetki tanımlarını yönetir
- Kritik log ve raporlara erişir

### 4.2. Satış personeli

- Yetkili olduğu müşterileri görüntüler
- Müşteri ve satış oluşturur
- Yetki sınırı içindeki fiyat ve indirimleri uygular
- Satışları onaya gönderir
- Kendi satışlarının ödeme ve sevkiyat durumlarını görüntüler

### 4.3. Muhasebe personeli

- Cari hesapları görüntüler
- Tahsilat ve çek kayıtlarını oluşturur
- Ödeme planlarını takip eder
- İptal veya düzeltme talebi açar
- Finansal raporları görüntüler

### 4.4. Sevkiyat personeli

- Onaylanmış satışların sevkiyatlarını görür
- Sevkiyat hazırlar
- Araç, şoför ve irsaliye bilgilerini seçer
- Sevkiyat durumunu ilerletir
- Teslim bilgisi ve belgesi ekler

### 4.5. Denetçi / görüntüleyici

- Verileri değiştiremez
- İzin verilen raporları ve denetim geçmişini görüntüler

### 4.6. Yetki kapsamları

Yetkiler yalnızca role değil aşağıdaki kapsamlara göre de sınırlandırılabilir:

- Şube
- Bölge
- Satış temsilcisi
- Müşteri grubu
- İşlem türü
- Tutar limiti
- İndirim limiti
- Veri görüntüleme ve dışa aktarma yetkisi

---

## 5. Ana navigasyon ve ekran mimarisi

Ana menü sade tutulacaktır:

```text
Ana Sayfa
Müşteriler
Satışlar
Tahsilatlar
Sevkiyatlar
Onaylar
Raporlar
Tanımlar ve Ayarlar
```

Her ekrandan ulaşılabilen bir `+ Yeni İşlem` butonu bulunacaktır:

- Yeni satış
- Yeni müşteri
- Tahsilat kaydet
- Çek ekle
- Sevkiyat oluştur

Liste ekranlarında standart olarak şu özellikler bulunacaktır:

- Hızlı arama
- Tarih aralığı filtresi
- Durum filtresi
- Müşteri ve sorumlu personel filtresi
- Kayıtlı filtreler
- Sütun seçimi
- Yetkili kullanıcılar için Excel/PDF dışa aktarma
- Sayfalama
- Mobil ve tablet uyumu

---

## 6. Ana sayfa ve görev merkezi

Kullanıcı giriş yaptığında yalnızca yetkili olduğu bilgiler ve yapması gereken işler gösterilecektir.

### 6.1. Yönetim kartları

- Toplam müşteri alacağı
- Vadesi geçmiş alacak
- Bugün tahsil edilecek tutar
- Önümüzdeki 7/30 gün içindeki çekler
- Bugünkü sevkiyatlar
- Sevki bekleyen satışlar
- Onay bekleyen işlemler
- Bu ayın satış ve tahsilat toplamı

### 6.2. Bugünün işleri

```text
3 gecikmiş ödeme
2 bugün vadeli çek
4 hazırlanacak sevkiyat
7 yönetici onayı bekleyen işlem
```

Her karta tıklandığında ilgili liste gerekli filtreler uygulanmış şekilde açılacaktır.

### 6.3. Kullanıcıya göre görünüm

- Satış personeli kendi satışlarını ve bekleyen düzeltmelerini görür.
- Muhasebe vadeleri, çekleri ve tahsilatları görür.
- Sevkiyat personeli hazırlanacak ve teslim edilecek kayıtları görür.
- Yönetici onay, risk ve toplam performans kartlarını görür.

---

## 7. Müşteri ve cari hesap modülü

### 7.1. Müşteri kartı

Her müşteriye benzersiz ve otomatik bir müşteri kodu verilecektir. Örnek: `MUS-000123`.

Müşteri kartında:

- Müşteri kodu
- Firma/unvan
- Müşteri grubu
- Yetkili kişi
- Telefon ve e-posta
- Fatura ve teslimat adresleri
- Vergi dairesi
- Vergi veya T.C. kimlik numarası
- Varsayılan ödeme yöntemi
- Varsayılan vade günü
- Cari risk limiti
- Satış temsilcisi
- Aktif/pasif durumu
- Açıklama ve notlar

bulunacaktır.

### 7.2. Müşteri merkezi

Müşteri detay ekranının üst bölümünde:

- Güncel bakiye
- Vadesi geçmiş tutar
- Açık çekler
- Risk limiti ve kullanılabilir limit
- Açık satışlar
- Sevki bekleyen ürünler

gösterilecektir.

Hızlı işlem butonları:

- Yeni satış
- Tahsilat al
- Çek ekle
- Sevkiyat oluştur
- Cari ekstre al

Sekmeler:

- Genel bakış
- Satışlar
- Ödemeler ve çekler
- Sevkiyatlar
- Cari ekstre
- Belgeler
- İşlem geçmişi

### 7.3. Cari hesap hareketleri

Cari hareket türleri:

- Satış borcu
- Peşinat
- Nakit tahsilat
- Havale/EFT tahsilatı
- Çek tahsilatı
- İade
- İptal veya ters kayıt
- Yetkili bakiye düzeltmesi

Her hareket bağlı olduğu kaynak kaydı gösterecektir. Kullanıcılar sistemin hesapladığı bakiyeyi elle değiştiremeyecektir.

---

## 8. Ürün, fiyat ve KDV yönetimi

### 8.1. Ürün kartı

- Ürün kodu
- Ürün adı
- Kategori
- Barkod
- Birim
- Varsayılan satış fiyatı
- Minimum satış fiyatı
- Varsayılan KDV oranı
- Aktif/pasif durumu
- Stok veya kullanılabilir miktar bilgisi

### 8.2. Fiyatlandırma

Sistem aşağıdaki fiyat kaynaklarını desteklemelidir:

- Standart satış fiyatı
- Müşteri grubu fiyatı
- Müşteriye özel fiyat
- Kampanya veya tarih aralıklı fiyat
- Yetkiyle girilen özel fiyat

Uygulanacak fiyat otomatik olarak önerilecek, fiyat değişiklikleri yetki limitine göre kontrol edilecektir.

### 8.3. KDV yönetimi

- Merkezi KDV oranları tanımlanacaktır.
- Her ürünün varsayılan KDV oranı bulunacaktır.
- KDV dahil/hariç fiyat seçeneği desteklenecektir.
- Satış satırında kullanılan oran satış kaydı içinde ayrıca korunacaktır.
- Ürün KDV oranının daha sonra değiştirilmesi geçmiş satışları etkilemeyecektir.
- Varsayılan KDV değişikliği gerektiğinde onay kuralı çalıştırılabilecektir.

---

## 9. Satış oluşturma deneyimi

Satış oluşturma üç kısa adımdan oluşacaktır.

### 9.1. Adım 1 — Müşteri seçimi

Müşteri aşağıdaki bilgilerle aranabilir:

- Müşteri kodu
- Firma adı
- Telefon
- Vergi numarası

Müşteri seçildiğinde sistem otomatik olarak:

- Adresleri
- Satış temsilcisini
- Varsayılan ödeme koşulunu
- Güncel bakiyeyi
- Vadesi geçmiş borcu
- Risk limitini
- Kullanılabilir limiti
- Son satışları

getirecektir.

Müşteri bulunmuyorsa satış ekranından çıkmadan hızlı müşteri oluşturulabilecektir.

### 9.2. Adım 2 — Ürün seçimi

Ürünler arama, kategori, barkod, son satılanlar ve sık kullanılanlar üzerinden seçilebilecektir.

Ürün seçildiğinde:

- Birim
- Fiyat
- KDV
- Stok/kullanılabilir miktar
- Müşteriye özel fiyat

otomatik getirilecektir. Kullanıcı çoğunlukla sadece miktar seçecektir.

### 9.3. Adım 3 — Ödeme ve özet

Hazır ödeme seçenekleri:

- Tamamı peşin
- 30 gün vadeli
- 60 gün vadeli
- 90 gün vadeli
- Peşinat + vadeli
- Çek ile ödeme
- Peşinat + çek
- Özel ödeme planı

Sistem toplam tutarı seçilen plana göre otomatik dağıtacaktır.

Onay öncesi özet:

```text
Ara toplam
İndirim
KDV
Genel toplam
Peşinat
Vadeli kalan
Ödeme tarihleri
Risk limiti sonucu
Planlanan sevkiyat
```

Ana işlem butonları:

- `Yönetici Onayına Gönder`
- `Taslak Olarak Kaydet`

### 9.4. Onay sonrası otomatik işlemler

Satış onaylandıktan sonra sistem:

- Satış numarası üretir
- Satışı kesinleştirir
- Cari borç hareketini oluşturur
- Peşinat varsa tahsilat kaydı oluşturur
- Vadeli ödeme planını aktifleştirir
- Çek kayıtlarını oluşturur
- Sevk edilecek miktarları hazırlar
- Müşteri geçmişini günceller

---

## 10. Ödeme planı, çek ve tahsilat

### 10.1. Karma ödeme

Bir satış birden fazla yöntemle ödenebilir. Örnek:

```text
Satış toplamı: 500.000 TL
Peşinat:       100.000 TL
60 gün çek:    200.000 TL
90 gün çek:    200.000 TL
```

Ödeme planı toplamı ile satış genel toplamı eşit değilse işlem onaya gönderilemeyecektir.

### 10.2. Kıymetli evrak kaydı (çek/senet)

- Müşteri
- Bağlı satış
- Evrak türü: çek veya senet
- Evrak/seri numarası
- Banka ve şube
- Keşideci
- Alınma tarihi
- Vade tarihi
- Tutar
- Durum
- Tahsil tarihi
- Açıklama
- Çek görseli veya belgesi

Kıymetli evrak durumları:

```text
Planlandı → Portföyde → Bankaya Verildi → Tahsil Edildi
                  ├── Ciro Edildi
                  ├── Temlik Edildi
                  ├── Karşılıksız / Protestolu
                  └── İade / İptal
```

Her durum değişikliği ayrı bir kıymetli evrak hareketi oluşturur. Ciro/temlik işleminde devredilen tedarikçi veya kurum, işlem tarihi, tutar, açıklama ve belge kaydedilir. Ciro edilen evrak müşterinin asıl ödeme bağlantısından koparılmaz.

### 10.4. Döviz ve kur farkı

- Desteklenen ilk para birimleri TRY, USD ve EUR'dur.
- Kur kaynağı bir adaptör üzerinden TCMB, ERP veya yetkili manuel kur olabilir.
- Satışta kullanılan kur ve kur tarihi belgeyle birlikte sabitlenir.
- Ödeme planı satış dövizinde hazırlanır ve TL karşılığı ayrıca saklanır.
- Dövizli çek/senet tahsil edildiğinde tahsilat kuru kaydedilir.
- Kayıt kuru ile tahsilat kuru arasındaki fark otomatik kur farkı cari hareketi oluşturur.
- Manuel kur girişi yetkiye ve yönetici onayına tabidir.

### 10.3. Tahsilat ekranı

Listeler:

- Bugün tahsil edilecekler
- Yaklaşanlar
- Gecikenler
- Tahsil edilenler
- Tümü

Her satırda yetkili kullanıcı için `Tahsil Edildi` işlemi bulunacaktır. Sistem tarih ve tutarı otomatik getirecek; kullanıcı yalnızca yöntemi seçip onaya gönderecektir.

Kısmi tahsilat desteklenecektir. Tahsilat beklenen tutarı aşarsa işlem engellenecek veya yetkili onayı istenecektir.

---

## 11. Sevkiyat modülü

### 11.1. Parçalı sevkiyat

Bir satışın tamamı tek seferde veya parça parça sevk edilebilir.

```text
Ürün       Satılan   Önceki sevk   Kalan   Bu sevkiyat
Motor          100             40      60              60
Pompa           20              0      20              20
```

Sistem varsayılan olarak kalan miktarın tamamını önerecektir. Kullanıcı sadece parçalı sevkiyat halinde miktarı değiştirecektir.

### 11.2. Sevkiyat alanları

- Sevkiyat numarası
- Müşteri ve bağlı satış
- Planlanan tarih
- Gerçekleşen tarih
- Sevk edilen ürün ve miktarlar
- Teslimat adresi
- Araç/plaka
- Şoför/kargo bilgisi
- İrsaliye numarası
- Teslim alan kişi
- Açıklama
- İrsaliye veya teslim belgesi

### 11.3. Sevkiyat durumları

```text
Planlandı → Hazırlanıyor → Sevke Hazır → Yola Çıktı → Teslim Edildi
                                             ├── Kısmi teslim
                                             └── İptal talebi
```

Satış miktarından fazla sevkiyat engellenecektir. Onaylanmamış satış için kesin sevkiyat başlatılamayacaktır.

### 11.4. Mobil kullanım

- Büyük dokunma alanları
- Barkod/karekod okutma
- Araç ve şoför seçimi
- Tek butonla durum ilerletme
- Teslim alan kişi girişi
- İrsaliye veya teslim fotoğrafı yükleme

---

## 11A. e-Fatura, e-Arşiv ve e-İrsaliye mimarisi

### 11A.1. Sağlayıcı adaptörü

Uygulama mali belgeleri doğrudan belirli bir muhasebe yazılımına bağlamaz. Ortak adaptör sözleşmesi aşağıdaki sağlayıcılarla uygulanabilir:

- Logo
- Mikro
- Netsis
- GİB'den izinli özel entegratör
- GİB Portalı için kontrollü dışa aktarma
- Şartları karşılandığında doğrudan entegrasyon

### 11A.2. Belge yaşam döngüsü

```text
Taslak → Onay Bekliyor → Gönderim Kuyruğunda → Sağlayıcıya Gönderildi
                                         ├── GİB Onaylı / Tamamlandı
                                         ├── Red / İptal
                                         └── Teknik Hata → Yeniden Dene
```

Her e-belgede şu alanlar bulunur:

- Belge türü: e-Fatura, e-Arşiv Fatura, e-İrsaliye
- Kaynak satış/sevkiyat numarası
- Sağlayıcı ve harici kayıt numarası
- UUID/ETTN
- Belge numarası ve senaryo
- Düzenlenme ve gönderilme zamanı
- Son resmî durum ve durum zamanı
- XML/PDF erişim referansı
- Hata kodu ve hata açıklaması
- Tekrar deneme sayısı

### 11A.3. İş kuralları

- Sevkiyat için gerekli belge türü müşteri/mükellef ve süreç kuralına göre belirlenir.
- Resmî belge numarası uygulama tarafından tahmin edilmez; sağlayıcı cevabından alınır.
- Aynı satış veya sevkiyat için yanlışlıkla iki belge oluşması benzersiz işlem anahtarıyla engellenir.
- Sağlayıcı erişilemezse belge kuyrukta tutulur, tekrar denenir ve kullanıcıya açık hata gösterilir.
- İptal/itiraz/ret işlemleri sağlayıcının ve güncel mevzuatın desteklediği akış üzerinden yapılır.
- Gönderilen/alınan bütün isteklerin hassas veri içermeyen teknik özeti loglanır.

---

## 12. Merkezi onay mekanizması

### 12.1. Temel onay akışı

```text
Çalışan işlemi hazırlar
        ↓
Yönetici onayına gönderir
        ↓
Sistem kaydı kilitler
        ↓
Uygulama bildirimi ve e-posta gönderilir
        ↓
 ┌──────┴────────────┐
Onayla           Düzeltme iste / Reddet
   ↓                       ↓
İşlem uygulanır       Çalışana geri döner
```

### 12.2. Ortak işlem durumları

- Taslak
- Onay bekliyor
- Görüntülendi
- Düzeltme istendi
- Yeniden onay bekliyor
- Reddedildi
- Onaylandı
- Uygulanıyor
- Tamamlandı
- Uygulama hatası
- İptal onayı bekliyor
- İptal edildi

`Onaylandı` ile `Tamamlandı` ayrı tutulacaktır. Yönetici onayından sonra teknik hata oluşursa kayıt yanlışlıkla tamamlanmış görünmeyecektir.

### 12.3. Onay beklerken uygulanacak kurallar

- İşlem kilitlenir ve içeriği değiştirilemez.
- Cari hesaba kesin hareket oluşmaz.
- Tahsilat tamamlanmış sayılmaz.
- Çek tahsil edildi durumuna geçmez.
- Sevkiyat kesin teslim edilemez.
- Kesin/resmî belge üretilemez.
- Yapılan değişiklik için yeni sürüm ve yeniden onay gerekir.

### 12.4. Yönetici onay merkezi

Onay kartında:

- İşlem türü
- İşlemi yapan çalışan
- Müşteri
- Tutar
- Fiyat, indirim ve KDV
- Ödeme planı
- Güncel cari bakiye
- Risk limiti
- Sevkiyat özeti
- Uyarı ve risk göstergeleri
- Çalışanın açıklaması
- Onay bekleme süresi

gösterilecektir.

Yönetici seçenekleri:

- Onayla
- Düzeltme iste
- Reddet
- Yetkili başka yöneticiye yönlendir

Ret ve düzeltme nedenleri tanımlı listeden seçilecek, gerekirse ek açıklama yazılacaktır.

### 12.5. Onay politikaları

Her zaman onay gerektirecek örnek işlemler:

- Satış/tahsilat iptali
- Cari bakiye düzeltmesi
- Tahsil edilmiş çek değişikliği
- Geçmiş tarihli finansal işlem
- Onaylanmış kaydın yeniden açılması
- Kullanıcı rolü veya yetki değişikliği
- Toplu veri dışa aktarma

Koşullu onay gerektirecek işlemler:

- Satış tutarı belirlenen sınırı aşarsa
- İndirim yetki limitini aşarsa
- Müşteri risk limiti aşılırsa
- Ürün minimum fiyat altında satılırsa
- Ürün KDV oranı değiştirilirse
- Vade sınırı aşılırsa
- Peşinatsız satış yapılırsa
- Olağan dışı miktarda sevkiyat yapılırsa

Standart, düşük riskli ve yetki sınırı içindeki işlemler politika izin veriyorsa otomatik onaylanabilir.

### 12.6. Çok seviyeli onay

```text
Satış personeli
      ↓
Satış müdürü
      ↓
Finans / muhasebe
      ↓
Genel müdür
      ↓
İşlem uygulanır
```

Örnek matris:

| Koşul | Onay akışı |
|---|---|
| Standart ve düşük tutarlı satış | Otomatik veya satış müdürü |
| Orta tutarlı satış | Satış müdürü |
| Yüksek tutarlı satış | Satış müdürü + genel müdür |
| Risk limiti aşımı | Finans + genel müdür |
| Yetki üstü indirim | Satış müdürü |
| Tahsilat iptali | Muhasebe müdürü |
| Cari bakiye düzeltmesi | Muhasebe + yönetici |

Tutar sınırları ve roller yönetim ekranından değiştirilebilecektir.

### 12.7. Görevlerin ayrılığı

- Kullanıcı kendi işlemini onaylayamaz.
- İşlemi oluşturan ile nihai onaylayan aynı kişi olamaz.
- Gerekirse belirli işlem türlerinde iki farklı bölümün onayı zorunlu tutulur.
- Onay yetkisi geçici vekâletle devredilebilir.
- Vekâlet başlangıç/bitiş tarihi ve kapsamı kaydedilir.

### 12.8. İşlem değişikliği ve sürümleme

Onay bekleyen işlem değiştirilirse:

- Mevcut onay geçersiz olur.
- Yeni işlem sürümü oluşturulur.
- Önceki ve yeni değerler korunur.
- Yöneticiye değişen alanlar gösterilir.
- İşlem tekrar onaya gönderilir.

### 12.9. Eşzamanlı onay koruması

- İki yönetici aynı işlemi aynı anda sonuçlandıramaz.
- İlk geçerli karar sonrası diğer açık ekranlar güncellenir.
- Her onay isteği yalnızca bir kez uygulanabilir.
- Teknik tekrar denemeleri çift cari hareket veya çift sevkiyat oluşturmamalıdır.

---

## 13. Bildirim ve e-posta sistemi

### 13.1. Uygulama içi bildirimler

Bildirim merkezi şu olayları destekleyecektir:

- Yeni onay talebi
- İşlem onaylandı
- Düzeltme istendi
- İşlem reddedildi
- İşlem başka yöneticiye aktarıldı
- Onay gecikti
- İşlem uygulanırken hata oluştu
- Çek vadesi yaklaştı
- Tahsilat gecikti
- Sevkiyat tarihi yaklaştı

Bildirim tıklandığında doğrudan ilgili kayıt açılacaktır.

### 13.2. E-posta bildirimleri

Onay e-postasında:

- İşlem türü
- Müşteri
- Tutar
- İşlemi oluşturan
- Özet risk bilgileri
- Gönderilme zamanı
- Güvenli onay ekranını açan bağlantı

bulunacaktır.

E-posta içinden tek bağlantıyla giriş yapılmadan doğrudan onay verilemeyecektir. Kullanıcı güvenli şekilde sisteme giriş yapacak ve onay ekranından karar verecektir.

### 13.3. Hatırlatma ve eskalasyon

Örnek politika:

- İlk bildirim: Hemen
- İlk hatırlatma: 2 saat sonra
- İkinci hatırlatma: 8 saat sonra
- Üst yöneticiye eskalasyon: 24 saat sonra

Finansal işlem süre dolduğu için otomatik onaylanmayacaktır. İşlem onay beklemeye devam edecek ve yetkili üst yöneticiye aktarılacaktır.

### 13.4. Teslimat güvenilirliği

- Gönderilemeyen bildirimler otomatik yeniden denenecektir.
- E-posta başarısızlığı işlemin kaybolmasına neden olmayacaktır.
- Bildirim gönderme durumu loglanacaktır.
- Kritik bildirim hataları yönetici ekranında gösterilecektir.

---

## 14. Güvenlik planı

### 14.1. Hesap güvenliği

- Ortak kullanıcı hesabı kullanılmayacaktır.
- Her çalışan kişisel hesabıyla giriş yapacaktır.
- Yönetici ve muhasebe için iki aşamalı doğrulama zorunlu olacaktır.
- Güçlü parola ve güvenli parola sıfırlama uygulanacaktır.
- Parolalar açık şekilde veya geri döndürülebilir biçimde saklanmayacaktır.
- Başarısız girişler sınırlandırılacak ve geçici kilitleme uygulanacaktır.
- Uzun süre kullanılmayan oturum kapatılacaktır.
- Rol/yetki değiştiğinde mevcut oturumlar yenilenecektir.
- İşten ayrılan kullanıcının hesabı derhal pasife alınacaktır.

### 14.2. Uygulama ve API güvenliği

- Tüm bağlantılar HTTPS kullanacaktır.
- Yetki kontrolleri yalnızca ekranda değil sunucu tarafında uygulanacaktır.
- Her API isteğinde kullanıcı ve veri kapsamı kontrol edilecektir.
- Girdi doğrulama ve güvenli çıktı kodlama uygulanacaktır.
- SQL enjeksiyonu, XSS, CSRF ve yetkisiz nesne erişimine karşı kontroller bulunacaktır.
- Hız sınırlama uygulanacaktır.
- Gizli anahtarlar kaynak kodunda tutulmayacaktır.
- Bağımlılık ve güvenlik açığı taramaları yapılacaktır.

### 14.3. Veri güvenliği

- Veritabanı ve yedekler şifrelenecektir.
- Veritabanı internete doğrudan açılmayacaktır.
- Uygulama veritabanında yalnızca ihtiyaç duyduğu yetkilere sahip olacaktır.
- Test ortamında gerçek kişisel veriler kullanılmayacak veya anonimleştirilecektir.
- Hassas alanlar ekranda ve çıktılarda maskelenebilecektir.
- Verilerin toplu dışa aktarımı ayrı yetkiye ve gerektiğinde onaya tabi olacaktır.

### 14.4. Belge güvenliği

- Çek ve irsaliye dosyaları herkese açık adreslerde tutulmayacaktır.
- Belge görüntüleme ve indirme sırasında yetki kontrolü yapılacaktır.
- Dosya türü ve boyutu kontrol edilecektir.
- Zararlı dosya taraması yapılacaktır.
- Belge erişimleri loglanacaktır.

---

## 15. Log ve denetim kayıtları

### 15.1. Denetim logu

İş kullanıcılarının hareketleri:

- Müşteri oluşturma/değiştirme
- Satış oluşturma/değiştirme
- Fiyat, indirim veya KDV değişikliği
- Tahsilat ve çek hareketleri
- Sevkiyat hareketleri
- Onay, ret ve düzeltme kararları
- İptal ve ters kayıtlar
- Rapor görüntüleme ve dışa aktarma
- Belge görüntüleme ve indirme

### 15.2. Güvenlik logu

- Başarılı/başarısız giriş
- Hesap kilitlenmesi
- Parola veya iki aşamalı doğrulama değişikliği
- Yetkisiz erişim denemesi
- Rol/yetki değişikliği
- Olağan dışı görüntüleme veya veri indirme
- Tanınmayan cihaz/konum girişleri
- Log ekranına erişim

### 15.3. Sistem ve hata logu

- Uygulama hataları
- Veritabanı veya performans sorunları
- Bildirim/e-posta hataları
- Entegrasyon hataları
- Arka plan görevleri
- Yedekleme ve geri yükleme sonuçları

### 15.4. Zorunlu log alanları

- Benzersiz log numarası
- Tarih ve saat
- Kullanıcı numarası ve rolü
- Oturum numarası
- İşlem türü
- Modül
- Etkilenen kayıt türü ve numarası
- Önceki değer
- Yeni değer
- İşlem nedeni
- Onaylayan kullanıcı
- IP ve cihaz bilgisi
- Başarılı/başarısız sonucu
- Hata veya korelasyon numarası

### 15.5. Log bütünlüğü

- Normal kullanıcılar ve yöneticiler logları değiştiremeyecektir.
- Log deposu mümkün olduğunca yalnızca ekleme yapılabilir olacaktır.
- Kritik kayıtlar ayrı merkezi log ortamına aktarılacaktır.
- Log bütünlüğü için hash zinciri veya dijital imza değerlendirilecektir.
- Log erişimleri de ayrıca loglanacaktır.
- Kritik işlem sırasında log sistemi kullanılamıyorsa işlem sessizce tamamlanmayacaktır.

### 15.6. Loglarda tutulmayacak bilgiler

- Parola ve parola özetleri
- Oturum anahtarları
- API anahtarları
- İki aşamalı doğrulama kodları
- Tam kart bilgileri
- Gereksiz kimlik bilgileri
- Belge dosyasının içeriği

Gerekli hassas bilgiler maskeli gösterilecektir.

### 15.7. İşlem geçmişi ekranı

Filtreler:

- Tarih aralığı
- Kullanıcı
- Müşteri
- Satış/çek/sevkiyat numarası
- Modül ve işlem türü
- Başarılı/başarısız
- Kritik işlem
- Cihaz/IP

Her müşteri, satış, tahsilat, çek ve sevkiyat kaydında o kayda özel `İşlem Geçmişi` sekmesi bulunacaktır.

---

## 16. Otomatik güvenlik ve risk uyarıları

Sistem şu olaylarda uyarı üretecektir:

- Art arda başarısız giriş
- Mesai dışı olağan dışı giriş
- Kısa sürede çok sayıda müşteri görüntüleme
- Toplu Excel/PDF indirme
- Çok sayıda iptal veya düzeltme
- Sürekli sınırda indirim uygulama
- Kendi işlemini onaylama girişimi
- Log servisinin durması
- Yedekleme hatası
- Yetkisiz API veya sayfa erişimi
- Aynı çek numarasının tekrar girilmesi
- Risk limitini aşan satış

İlk sürümde uygulama içi bildirim ve e-posta; sonraki aşamada merkezi güvenlik izleme kullanılabilir.

---

## 17. Yedekleme ve felaket kurtarma

- Günlük tam yedek alınacaktır.
- Gün içinde periyodik değişiklik yedekleri alınacaktır.
- En az bir şifreli yedek farklı ortamda tutulacaktır.
- Yedekleme sonuçları otomatik kontrol edilecektir.
- Yedekleme başarısızlığında yöneticiye bildirim gönderilecektir.
- Aylık geri yükleme testi yapılacaktır.
- Geri yükleme adımları yazılı hale getirilecektir.
- Kabul edilebilir veri kaybı ve kesinti süresi işletme ile birlikte belirlenecektir.

---

## 18. KVKK ve veri yaşam döngüsü

- Gereksiz kişisel veri toplanmayacaktır.
- Toplanan verinin amacı ve erişim kapsamı belirlenecektir.
- Kişisel veri işleme envanteri hazırlanacaktır.
- Saklama ve imha süreleri tanımlanacaktır.
- Süresi dolan veriler mevzuat ve işletme politikasına göre silinecek, yok edilecek veya anonimleştirilecektir.
- Veri dışa aktarma ve belge görüntüleme işlemleri loglanacaktır.
- Çalışanlara veri güvenliği farkındalık eğitimi verilecektir.
- Veri ihlali müdahale ve bildirim prosedürü hazırlanacaktır.
- Kesin hukuki kapsam işletmenin hukuk/KVKK danışmanıyla doğrulanacaktır.

---

## 19. Raporlar

İlk rapor seti:

- Müşteri bazında satış raporu
- Ürün bazında satış ve adet raporu
- Tarih aralığına göre satış raporu
- Müşteri cari ekstresi
- Vadesi geçen alacaklar
- Yaklaşan çek vadeleri
- Tahsil edilen/edilmeyen çekler
- Satılan, sevk edilen ve kalan ürünler
- Sevkiyat performansı
- KDV oranlarına göre satış özeti
- Onay bekleme süresi ve sonuçları
- Kullanıcı işlem ve iptal raporu
- Kritik güvenlik olayları raporu

Excel/PDF dışa aktarma işlemleri yetkiye tabi olacak ve loglanacaktır.

---

## 20. Kullanıcı hatasını azaltacak kontroller

- Satış miktarından fazla sevkiyat engellenir.
- Ödeme planı toplamı ile satış toplamı eşit değilse kayıt ilerlemez.
- Beklenen tutardan fazla tahsilat kontrol edilir.
- Aynı çek numarası tekrar kaydedilemez.
- Geçmiş tarihli vade veya işlem uyarılır/onaya gönderilir.
- Risk limiti aşımı otomatik hesaplanır.
- KDV ve toplamlar elle girilmez, sistem tarafından hesaplanır.
- Müşteri ve ürün silinmez; pasife alınır.
- Finansal kayıtlar silinmez; iptal veya ters kayıt oluşturulur.
- İptal/ret nedeni seçmek zorunludur.
- Onay bekleyen kayıt değiştirilemez.
- Değişiklik yapılırsa önceki onay geçersiz olur.
- Onaydan sonra aynı işlem ikinci kez uygulanamaz.
- Kritik işlemlerde açık ve anlaşılır onay özeti gösterilir.

Uyarı mesajları teknik değil, yönlendirici olacaktır. Örnek:

> Bu satıştan sevk edilebilecek en fazla 60 adet kaldı.

---

## 21. Fonksiyonel olmayan gereksinimler

### 21.1. Kullanılabilirlik

- Masaüstü, tablet ve mobil uyumlu tasarım
- En sık kullanılan işlemlerde minimum tıklama
- Hızlı arama ve klavye desteği
- Büyük ve açık işlem butonları
- Renkle birlikte metin ve ikon kullanımı

### 21.2. Performans

- Normal liste ve detay ekranları kabul edilebilir ağ koşullarında hızlı açılmalıdır.
- Büyük raporlar arka planda hazırlanmalı ve hazır olduğunda kullanıcıya bildirilmelidir.
- Aramalar müşteri kodu, firma, ürün kodu ve belge numaralarında indeksli olmalıdır.

### 21.3. İzlenebilirlik

- Her işlem benzersiz numaraya sahip olmalıdır.
- Kullanıcı işlemi ile oluşan finansal/operasyonel kayıtlar birbirine bağlanmalıdır.
- Teknik hata kullanıcıya takip numarasıyla gösterilmelidir.

### 21.4. Erişilebilirlik

- Durumlar yalnızca renk ile anlatılmamalıdır.
- Klavye ile temel ekranlar kullanılabilmelidir.
- Form hata mesajları ilgili alanla birlikte gösterilmelidir.

---

## 22. Önerilen temel veri varlıkları

- Kullanıcı
- Rol
- Yetki
- Kullanıcı kapsamı
- Vekâlet
- Müşteri
- Müşteri adresi
- Müşteri yetkilisi
- Ürün
- Ürün kategorisi
- Fiyat listesi
- KDV oranı
- Satış
- Satış satırı
- Satış sürümü
- Ödeme planı
- Cari hareket
- Tahsilat
- Çek
- Sevkiyat
- Sevkiyat satırı
- Belge/dosya
- Onay talebi
- Onay adımı
- Onay kararı
- Bildirim
- E-posta gönderimi
- Denetim logu
- Güvenlik olayı
- Sistem ayarı

Kritik tablolarda standart alanlar bulunmalıdır:

- Oluşturan kullanıcı
- Oluşturma zamanı
- Son değiştiren kullanıcı
- Son değişiklik zamanı
- Durum
- Sürüm numarası
- İptal eden/onaylayan kullanıcı
- İptal/onay zamanı

---

## 23. Geliştirme yol haritası

### Faz 0 — Analiz ve kararlar

Amaç: İş kurallarını netleştirmek ve yanlış mimariyle geliştirmeye başlamamak.

- Mevcut satış, çek, tahsilat ve sevkiyat süreçlerini çıkarmak
- Kullanıcı rolleri ve şubeleri belirlemek
- Kullanılan ödeme yöntemlerini listelemek
- Satış/indirim/risk limitlerini belirlemek
- Onay matrisi ve vekâlet kurallarını netleştirmek
- KDV ve fiyat politikalarını belirlemek
- Cari hesap başlangıç verisini planlamak
- Rapor ve çıktı örneklerini toplamak
- KVKK veri envanteri ve saklama ihtiyaçlarını değerlendirmek

**Çıktı:** Onaylanmış gereksinim listesi, işlem akışları ve rol-yetki matrisi.

### Faz 1 — Altyapı, kullanıcı ve güvenlik

- Uygulama temel mimarisi
- Kullanıcı giriş sistemi
- Rol ve yetki altyapısı
- İki aşamalı doğrulama
- Oturum yönetimi
- Denetim ve güvenlik log altyapısı
- Merkezi hata yönetimi
- Temel sistem ayarları
- Otomatik yedekleme planı

**Çıktı:** Güvenli giriş, yetkilendirme ve loglama altyapısı.

### Faz 2 — Müşteri, ürün ve temel tanımlar

- Müşteri listesi ve müşteri kartı
- Müşteri kodu üretimi
- Adres ve yetkili kişi yönetimi
- Ürün ve kategori yönetimi
- Fiyat listeleri
- KDV tanımları
- Banka, ödeme, araç, şoför ve durum tanımları

**Çıktı:** Satışta kullanılacak güvenilir ana veriler.

### Faz 3 — Satış ve otomatik hesaplamalar

- Üç adımlı satış ekranı
- Otomatik müşteri bilgileri
- Ürün/fiyat/KDV seçimi
- İndirim ve toplam hesapları
- Peşin/vadeli/karma ödeme planı
- Risk limiti kontrolü
- Taslak ve sürümleme
- Satış işlem geçmişi

**Çıktı:** Hızlı ve kontrollü satış oluşturma.

### Faz 4 — Onay ve bildirim merkezi

- Onay politikaları
- Tek ve çok seviyeli onay
- Yönetici onay ekranı
- Düzeltme ve ret akışları
- İşlem kilitleme ve sürüm yenileme
- Uygulama içi bildirim
- E-posta bildirimi
- Hatırlatma, eskalasyon ve vekâlet
- Onay logları

**Çıktı:** Yönetici onayı olmadan kritik işlemlerin uygulanmadığı kontrollü süreç.

### Faz 5 — Cari hesap, çek ve tahsilat

- Cari hareket altyapısı
- Peşinat ve tahsilat
- Vadeli ödeme planları
- Çek yönetimi
- Yaklaşan/geciken vade ekranları
- Tahsilat onayları
- İptal ve ters kayıt
- Cari ekstre

**Çıktı:** Satıştan tahsilata kadar izlenebilir finansal süreç.

### Faz 6 — Sevkiyat

- Satıştan otomatik sevkiyat oluşturma
- Parçalı sevkiyat
- Satılan/sevk edilen/kalan kontrolü
- Araç, şoför ve irsaliye
- Mobil/tablet sevkiyat ekranı
- Teslim onayı ve belge yükleme
- Sevkiyat iptal/onay süreçleri

**Çıktı:** Satış miktarlarıyla bağlantılı uçtan uca sevkiyat takibi.

### Faz 7 — Yönetim paneli ve raporlar

- Rol bazlı ana sayfa
- Satış ve tahsilat göstergeleri
- Vade/çek uyarıları
- Sevkiyat göstergeleri
- Onay performansı
- Cari, satış, ürün ve sevkiyat raporları
- Yetkili Excel/PDF çıktıları

**Çıktı:** Operasyon ve yönetim için ölçülebilir görünürlük.

### Faz 8 — Güvenlik sertleştirmesi ve yayına hazırlık

- Yetki testleri
- Onay atlatma testleri
- Güvenlik açığı taraması
- Kritik akışların negatif testleri
- Yük ve performans testleri
- Yedekten geri dönüş testi
- Log bütünlüğü kontrolü
- Kullanıcı kabul testleri
- Personel eğitimi
- Canlıya geçiş ve geri dönüş planı

**Çıktı:** Kontrollü canlıya geçiş.

### Faz 9 — İleri geliştirmeler

- Barkod/karekod desteği
- Muhasebe/ERP entegrasyonu
- Banka hareketleriyle tahsilat eşleştirme
- WhatsApp/SMS bildirimleri
- Gelişmiş güvenlik izleme
- Olağan dışı kullanıcı davranışı analizi
- Müşteri portalı
- Gelişmiş mobil teslimat deneyimi

---

## 24. Test ve kabul kriterleri

### 24.1. Satış

- Müşteri seçildiğinde varsayılan bilgiler otomatik gelmelidir.
- Ürün seçildiğinde fiyat, birim ve KDV otomatik gelmelidir.
- Toplamlar doğru ve canlı hesaplanmalıdır.
- Risk limiti aşımı doğru onay akışını başlatmalıdır.
- Onay bekleyen satış cari hesaba yansımamalıdır.
- Onaylanan satış yalnızca bir kez uygulanmalıdır.

### 24.2. Tahsilat ve çek

- Karma ödeme toplamı satış toplamıyla eşleşmelidir.
- Aynı çek numarası tekrar kaydedilememelidir.
- Çek vadesinin gelmesi otomatik tahsilat oluşturmamalıdır.
- Tahsil edildi işlemi gerekli onaydan sonra cari bakiyeyi azaltmalıdır.
- İptal edilen tahsilat geçmişten silinmemelidir.

### 24.3. Sevkiyat

- Yalnızca kalan miktar sevk edilebilmelidir.
- Parçalı sevkiyat sonrası kalan miktar doğru hesaplanmalıdır.
- Onaylanmamış satış teslim edildi durumuna geçememelidir.
- Teslim durumu, teslim alan kişi ve zamanla birlikte loglanmalıdır.

### 24.4. Onay

- Kullanıcı kendi işlemini onaylayamamalıdır.
- Onay bekleyen işlem değiştirilememelidir.
- Değişiklik yapılırsa eski onay geçersiz olmalıdır.
- Eşzamanlı iki onay çift işlem oluşturmamalıdır.
- Ret/düzeltme nedeni zorunlu olmalıdır.
- Bildirim hatası işlem kaybına neden olmamalıdır.

### 24.5. Güvenlik ve log

- Yetkisiz kullanıcı doğrudan bağlantı/API ile veriye ulaşamamalıdır.
- Tüm kritik işlemler önceki/yeni değerlerle loglanmalıdır.
- Loglar normal kullanıcı ve yöneticiler tarafından değiştirilememelidir.
- Parola, anahtar ve oturum bilgileri loglarda bulunmamalıdır.
- Yedek başarıyla geri yüklenebilmelidir.

---

## 25. Canlıya geçiş planı

1. Müşteri, ürün ve başlangıç cari verilerinin temizlenmesi
2. Veri aktarım şablonlarının hazırlanması
3. Deneme aktarımı ve mutabakat
4. Roller, kullanıcılar ve onay matrisinin tanımlanması
5. Anahtar kullanıcı eğitimi
6. Kullanıcı kabul testi
7. Son veri aktarımı
8. Kontrollü canlıya geçiş
9. İlk dönemde günlük veri ve log kontrolü
10. Kullanıcı geri bildirimleriyle hızlı iyileştirme

Canlıya geçiş öncesinde eski ve yeni sistemdeki müşteri bakiyeleri, açık çekler ve sevk bekleyen miktarlar karşılaştırılarak mutabakat yapılmalıdır.

---

## 26. Analiz aşamasında netleştirilecek kararlar

- Kaç kullanıcı, şube ve yönetici olacak?
- Kullanıcıların müşteri görme sınırları nasıl olacak?
- Satış tutarı ve indirim için onay eşikleri nedir?
- Kaç seviyeli onay gerekecek?
- Muhasebe ve genel müdür hangi işlemleri ayrıca onaylayacak?
- Yönetici izinliyken vekâlet kuralı nasıl işleyecek?
- Mevcut müşteri, ürün, çek ve bakiye verileri nerede tutuluyor?
- Stok sistemi bu modülün içinde mi olacak, başka sistemden mi gelecek?
- Fatura/irsaliye bu sistemde mi üretilecek, muhasebe sisteminden mi alınacak?
- Hangi e-posta altyapısı kullanılacak?
- Hangi raporlar ilk gün zorunlu?
- Veri ve log saklama süreleri ne olacak?
- Mobil sevkiyat ekranında fotoğraf, imza veya konum gerekecek mi?

---

## 27. Başarı ölçütleri

Projenin başarısı şu göstergelerle ölçülebilir:

- Bir satışın hazırlanma süresi
- Satış başına manuel girilen alan sayısı
- Hatalı veya geri dönen işlem oranı
- Onayların ortalama tamamlanma süresi
- Geciken çek ve tahsilatların görünürlük oranı
- Satılan/sevk edilen miktar uyuşmazlığı
- Yetkisiz veya logsuz kritik işlem sayısı
- Cari mutabakat farkı
- Kullanıcıların günlük işlem tamamlama süresi
- Bildirim ve e-posta teslim başarısı

---

## 28. Özet ürün kararı

Bu modül yalnızca bir satış kayıt ekranı olmayacaktır. Müşteriden başlayan satış, ödeme, çek, tahsilat, onay ve sevkiyat zincirinin tamamını birbirine bağlayan operasyon sistemi olacaktır.

Ana kararlar:

- Kullanıcı mümkün olduğunca yazmayacak, seçim yapacaktır.
- Sistem bilinen bilgileri otomatik dolduracaktır.
- Standart işlemler hızlı, riskli işlemler kontrollü ilerleyecektir.
- Kritik işlem yönetici onayı olmadan kesinleşmeyecektir.
- Yöneticiye uygulama içi bildirim ve e-posta gönderilecektir.
- Finansal ve operasyonel kayıtlar silinmeyecektir.
- Her değişiklik, onay ve iptal eksiksiz loglanacaktır.
- Satışın finansal durumu ile sevkiyat durumu ayrı izlenecektir.
- Yönetim tüm riskleri ve bekleyen işleri tek panelde görecektir.

---

## 29. Uygulama Durum Kontrolü — 24 Ağustos 2026

### Tamamlanan çek/senet ve döviz akışı

- Her çek/senet ayrı evrak ve ayrı vade olarak izlenir.
- Satış kuru ve TL karşılığı geçmiş belge üzerinde sabit kalır.
- Tahsilat sırasında gerçekleşen tarih ve kur evrak bazında girilir; güncel TCMB kuru varsayılan gelir.
- Her evrakın satış kuru, tahsilat kuru, tahsil edilen TL karşılığı ve kur farkı ayrı gösterilir.
- Fark, silinmeyen ayrı bir cari kur farkı hareketine dönüşür.

### Canlı kullanımdan önce tamamlanacak yüksek öncelikli işler

1. Logo/Mikro/Netsis veya özel entegratör seçimi ve gerçek e-Fatura/e-Arşiv/e-İrsaliye gönderimi.
2. Gerçek SMTP/e-posta sağlayıcısı; onay, parola sıfırlama ve vade bildirimlerinin teslim takibi.
3. Seçilen ERP ile müşteri, ürün, stok, cari ve evrak kodu eşleştirmesi.
4. Otomatik günlük TCMB kur görevi, tatil/hafta sonu için son iş günü kuralı ve kur kaynağı kesinti alarmı.
5. Veritabanı yedekleme, geri yükleme tatbikatı, saklama süresi ve felaket kurtarma prosedürü.
6. Üretim HTTPS alan adı, güvenli çerezler, gizli anahtar kasası ve başlangıç parolalarının zorunlu değişimi.

### İkinci öncelikli ürün işleri

- Ödeme planında taksit tutarı ve vadesini tek tek düzenleme.
- Normal vadeli taksitlerde kısmi tahsilat, kalan tutar ve fazla tahsilat kontrolü.
- Çek/senet tahsilatı için ters kayıt ve yeniden portföye alma akışı.
- Banka ekstresi içe aktarma ve havale/EFT otomatik eşleştirme.
- Satış iadesi, ürün/miktar bazlı iade ve sevkiyat iadesi.
- Kullanıcı/rol yönetim ekranı, vekâlet yönetim ekranı ve zorunlu parola politikaları.
- Yönetim raporları: yaşlandırma, tahsilat performansı, kur farkı, satış kârlılığı ve sevkiyat performansı.
- Otomatik API/iş kuralı testleri, tarayıcı uçtan uca testleri ve yük testi.
