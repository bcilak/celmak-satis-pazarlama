# Çelmak Satış ve Pazarlama Sistemi

## Sistem Tanıtım ve Kullanım Raporu

**Rapor tarihi:** 24 Ağustos 2026  
**Uygulama adresi:** `http://localhost:3000`

---

## 1. Sistemin amacı

Çelmak Satış ve Pazarlama Sistemi; müşterinin oluşturulmasından satışın onaylanmasına, tahsilatın alınmasından ürünün sevk edilmesine kadar bütün süreci tek yerde takip etmek için geliştirilmiştir.

Sistemin temel hedefleri:

- Çalışanın mümkün olduğunca seçim yaparak ilerlemesi
- Elle veri girişini ve kullanıcı hatasını azaltmak
- Kimin, ne zaman, hangi işlemi yaptığını kaydetmek
- Yetkili onayı olmadan kritik işlemleri kesinleştirmemek
- Müşteri borcunu, vadeleri, çek/senetleri ve sevkiyatları birlikte izlemek
- TRY, USD ve EUR işlemlerini satış ve tahsilat kurlarıyla ayrı ayrı takip etmek

---

## 2. Kullanıcı rolleri

| Rol | Temel yetkiler |
|---|---|
| Yönetici | Satış onayı, ret/düzeltme kararı, yapılandırma, vekâlet, genel görüntüleme |
| Satış | Müşteri ve satış oluşturma, taslağı onaya gönderme |
| Muhasebe | Cari hesap, tahsilat, çek/senet, TCMB kuru ve mutabakat işlemleri |
| Sevkiyat | Sevkiyat oluşturma ve teslimat durumlarını ilerletme |
| Denetçi | Finansal ve operasyonel kayıtları değiştirmeden inceleme |

Kritik işlemler sunucu tarafında da rol kontrolünden geçer. Yalnızca menünün gizlenmesine güvenilmez.

---

## 3. Giriş ekranı

Kullanıcı sisteme kişisel e-posta ve parolasıyla giriş yapar.

Desteklenen güvenlik özellikleri:

- Güvenli, HttpOnly oturum çerezi
- Parola sıfırlama akışı
- Authenticator ile iki aşamalı doğrulama
- Windows Hello veya cihaz PIN'iyle passkey
- Açık cihaz oturumlarını görüntüleme ve kapatma
- Tarihli yönetici vekâleti

İlk geliştirme parolası `Celmak!2026` değeridir. Canlı ortamda başlangıç parolaları değiştirilmelidir.

---

## 4. Ana Sayfa

Ana Sayfa, kullanıcının günlük çalışma özetidir.

Gösterilen bilgiler:

- Toplam müşteri alacağı
- Onay bekleyen işlem sayısı
- Bekleyen satışlar
- Onaylanmış satış hacmi
- Son satışlar
- Kullanıcının bildirimleri

Yeni satış düğmesiyle satış oluşturma ekranına doğrudan geçilebilir.

---

## 5. Müşteriler ekranı

Bu ekranda bütün aktif müşteriler listelenir. Her müşteri için müşteri kodu, iletişim bilgileri, bakiye ve risk bilgileri görülebilir.

### Yeni müşteri

Müşteri kodu üç yöntemle oluşturulabilir:

- Otomatik Çelmak kodu: `MUS-000123`
- Kullanıcının belirlediği manuel kod
- Logo, Mikro, Netsis veya başka ERP'den gelen harici kod

Vergi numarası, telefon, e-posta, şehir, varsayılan vade ve risk limiti kaydedilir.

### Müşteri detay sayfası

Müşteri detayının üst kısmında doğrudan şu sorular cevaplanır:

- Müşterinin bugünkü borcu ne kadar?
- Risk limiti aşılmış mı?
- Gecikmiş ödeme var mı?
- Sıradaki ödeme ne zaman?
- Son tahsilat ne zaman ve ne kadar?
- Açık ödeme planının TL karşılığı ne kadar?

Sekmeler:

1. **Borç özeti:** Toplam borçlandırma eksi tahsilatlar eşittir kalan borç hesabı ve son cari hareketler.
2. **Satışlar:** Müşteriye ait bütün satışlar.
3. **Vadeler ve tahsilatlar:** Normal vadeler, çek/senetler ve alınan ödemeler.
4. **Sevkiyatlar:** Müşteriye yapılan bütün sevkiyatlar.

---

## 6. Yeni Satış ekranı

Satış oluşturma adımları:

1. Müşteri seçilir.
2. Ürünler listeden seçilir.
3. Miktar girilir.
4. TRY, USD veya EUR para birimi seçilir.
5. Sistem ürün fiyatını işlem kuruyla dönüştürür.
6. Ödeme yöntemi ve vade planı seçilir.
7. Taslak oluşturulur.

Sistem otomatik hesaplar:

- Birim fiyat
- Ara toplam
- KDV
- Genel toplam
- Dövizli işlemin TL karşılığı
- Peşinat sonrası kalan tutar
- Taksit veya çek/senet vade dağılımı

Ödeme seçenekleri:

- Tamamı peşin
- Normal vadeli/taksitli ödeme
- Çek veya senet
- Peşinat + çek/senet

Satış kuru belge üzerinde sabitlenir; daha sonraki kur değişiklikleri geçmiş satış tutarını değiştirmez.

---

## 7. Satışlar ekranı

Taslak, onay bekleyen, onaylanan, reddedilen ve düzeltme istenen satışlar listelenir.

Satış personeli taslağı **Onaya gönder** düğmesiyle yöneticiye iletir. Onaylanmamış satış cari borç ve sevkiyat oluşturmaz.

---

## 8. Onaylar ekranı

Yönetici bu ekranda bekleyen satış taleplerini inceler.

Kararlar:

- Onayla
- Reddet
- Düzeltme iste

Kontroller:

- Kullanıcı kendi oluşturduğu kritik işlemi kendisi onaylayamaz.
- Aktif ve tarih aralığı geçerli vekâletler dikkate alınır.
- Karar, açıklama ve işlemi yapan kullanıcı denetim kaydına yazılır.
- Talebi açan kullanıcıya uygulama içi bildirim oluşturulur.

Onaylanan satış otomatik olarak müşteri cari hesabına borç yazar. Çek/senet planı varsa planlanan evraklar oluşturulur.

---

## 9. Kıymetli Evrak ekranı

Çek ve senetler ortak bir ekrandan yönetilir.

Üst özet:

- Bugün vadesi gelen evrak sayısı
- Açık portföyün TL karşılığı
- Geciken evrak sayısı

Filtreler:

- İşlem gerekenler
- Bugün
- Geciken
- Yaklaşan
- Tahsil edilen
- Tümü

Her kapalı kartta yalnızca müşteri, evrak numarası, satış numarası, çek/senet türü, para birimi, tutar, vade ve durum gösterilir.

Para birimi gösterimi:

- `USD`, `EUR` veya `TRY` etiketi kartın başında açıkça gösterilir.
- Ana tutar evrakın gerçek para birimidir.
- Dövizli evrakta TL tutarı yalnızca **TL karşılığı** açıklamasıyla ikinci bilgi olarak gösterilir.
- Açık portföy özeti farklı para birimlerini karşılaştırabilmek için TL karşılığıdır.

**İşlem yap** düğmesi yalnızca seçilen kartın ayrıntılarını açar.

Evrak bilgileri:

- Keşideci veya borçlu
- Seri/evrak numarası
- Çek için banka
- Düzenleme tarihi
- Vade tarihi

Evrak hareketleri:

- Portföye alındı
- Bankaya verildi
- Tahsil edildi
- Karşılıksız
- Protestolu
- İade
- Ciro edildi
- Temlik edildi
- İptal

Dövizli tahsilatta her evrak kendi gerçekleşen tahsilat tarihi ve kuruyla kaydedilir. Satış kuru, tahsilat kuru, tahsil edilen TL ve kur farkı ayrı gösterilir. Kur farkı cari hesaba ayrı hareket olarak işlenir.

---

## 10. Cari ve Tahsilat ekranı

Müşteri seçildiğinde cari ekstre açılır.

Ekstrede:

- Satış borçları
- Peşinatlar
- Nakit tahsilatlar
- Havale/EFT tahsilatları
- Çek/senet tahsilatları
- Kur farkları
- Ters kayıtlar
- İşlem sonrası çalışan bakiye

görülebilir.

Muhasebe kullanıcısı nakit veya havale tahsilatı kaydedebilir. Dövizli tahsilatta tahsilat kuru ayrıca girilir. Hatalı tahsilat silinmez; ters kayıtla iptal edilir.

Tahsilat iki farklı şekilde yapılır:

- **Bir vadeyi tahsil et:** Açık normal taksit seçilir; kalan tutar, para birimi ve satış kuru otomatik gelir. Kısmi ödeme yapılabilir ve taksit ancak kalan tutarın tamamı ödendiğinde kapanır.
- **Çek/senet tahsil et:** Müşterinin yaklaşan veya geciken bütün evrakları aynı vade alanında görünür. Vade beklenmeden erken tahsilat yapılabilir; evrak durumu ve tahsilat kuru birlikte kaydedilir.
- **Vadeden bağımsız ödeme:** Belirli bir taksiti kapatmaz; girilen tutarı müşterinin genel cari borcundan düşer.

Eksik çek/senet bilgileri `Kıymetli Evrak` ekranında tamamlanır; tamamlanmış evrakın tahsilatı hem cari tahsilat ekranından hem kıymetli evrak ekranından yapılabilir.

Mutabakat işlemiyle sistem bakiyesi ve müşterinin bildirdiği bakiye karşılaştırılır.

---

## 11. Sevkiyatlar ekranı

Yalnızca onaylanmış ve sevk edilecek miktarı bulunan satışlardan sevkiyat oluşturulur.

Sistem satıştaki ürünleri ve kalan miktarları otomatik getirir. Kullanıcı:

- Sevk miktarını
- Planlanan tarihi
- Teslimat adresini
- Araç plakasını
- Şoförü
- Açıklamayı

belirler.

Desteklenen durumlar:

- Planlandı
- Hazırlanıyor
- Sevke hazır
- Yola çıktı
- Kısmi teslim
- Teslim edildi
- İptal

Satış miktarından fazla sevkiyat sunucu tarafından engellenir. Parçalı sevkiyat desteklenir.

---

## 12. e-Belgeler ekranı

e-Fatura, e-Arşiv Fatura ve e-İrsaliye talepleri bu ekrandan izlenir.

Desteklenen sağlayıcı mimarileri:

- Logo
- Mikro
- Netsis
- Özel entegratör

Mevcut sürüm sağlayıcı seçimi, adaptör ve kuyruk altyapısını içerir. Gerçek GİB gönderimi için seçilecek sağlayıcının API bilgileri ayrıca bağlanmalıdır.

---

## 13. Denetim Kayıtları ekranı

Kritik işlemlerin tamamı denetim kaydına yazılır:

- İşlemi yapan kullanıcı
- İşlem türü
- Etkilenen kayıt
- Eski ve yeni değer
- Tarih ve saat
- IP bilgisi
- Korelasyon numarası

Denetim kayıtlarının güncellenmesi ve silinmesi veritabanı seviyesinde engellenmiştir.

---

## 14. Hesap Güvenliği ekranı

Kullanıcı bu ekrandan:

- İki aşamalı doğrulamayı etkinleştirebilir
- Passkey oluşturabilir
- Açık cihaz oturumlarını görebilir
- İstemediği cihaz oturumunu kapatabilir

Canlı kullanımda HTTPS ve kurumsal alan adı zorunludur.

### Kullanıcı Yetkileri

Yalnızca yönetici rolü bu ekrana erişebilir. Yönetici kullanıcıyı seçerek Ana Sayfa, Müşteriler, Satışlar, Kıymetli Evrak, Cari ve Tahsilat, Onaylar, Sevkiyatlar, e-Belgeler, Denetim Kayıtları ve Hesap Güvenliği modüllerini ayrı ayrı açıp kapatabilir.

Kullanıcı yalnızca kendisine açılan modülleri sol menüde görür. Gizlenen ekrana adres çubuğundan veya doğrudan API çağrısıyla erişim de engellenir. Rol yetkileri temel güvenlik sınırıdır; kullanıcıya bir ekranın seçilmesi, rolünün izin vermediği kritik işlemi yapma hakkı vermez. Yönetici hesapları sistemin kilitlenmesini önlemek amacıyla bütün modüllere erişir.

---

## 15. Uçtan uca örnek işlem

1. Satış personeli müşteriyi seçer veya yeni müşteri oluşturur.
2. Ürünleri ve miktarları seçerek satış taslağı oluşturur.
3. Para birimi, kur, ödeme yöntemi ve vadeleri belirler.
4. Satışı yönetici onayına gönderir.
5. Yönetici onayladığında satış müşteri carisine borç olarak yansır.
6. Çek/senet seçilmişse evraklar ayrı vade ve tutarlarla oluşur.
7. Sevkiyat personeli onaylı satıştan sevkiyat oluşturur.
8. Muhasebe vadede alınan ödeme veya evrak tahsilatını kaydeder.
9. Dövizli tahsilatta gerçekleşen kur kullanılır ve kur farkı otomatik işlenir.
10. Yönetici ve denetçi bütün süreci denetim kayıtlarından takip eder.

---

## 16. Mevcut entegrasyon durumu ve canlıya geçiş işleri

Uygulama içindeki temel satış, cari, tahsilat, çek/senet, onay, sevkiyat ve güvenlik akışları çalışmaktadır.

Canlıya geçmeden önce bağlanması gereken dış servisler:

- Gerçek Logo/Mikro/Netsis veya özel entegratör API'si
- Gerçek e-Fatura/e-Arşiv/e-İrsaliye gönderimi
- SMTP/e-posta sağlayıcısı
- ERP müşteri, ürün, stok ve cari kod eşleştirmesi
- Zamanlanmış günlük TCMB kur görevi
- Otomatik yedekleme ve geri yükleme altyapısı
- Üretim HTTPS alan adı ve gizli anahtar yönetimi

Detaylı geliştirme planı `CELMAK_SATIS_PAZARLAMA_YOL_HARITASI.md` dosyasında tutulmaktadır.
