# Kurulum — Kendi Sunucunuz (Docker, Webmin/Linux)

Uygulama **tek bir servistir**: aynı süreç hem arayüzü (`dist/`) hem de API'yi
(`/api`) yayınlar, veriler gömülü **SQLite** olarak kalıcı bir volume'de tutulur.
Önüne bir Nginx reverse proxy ve HTTPS koyulur.

Önerilen yol **Docker Compose**'tur (aşağıda). Docker'sız doğrudan kurulum için
en sondaki *Alternatif* bölümüne bakın.

Hazır dosyalar: `Dockerfile`, `docker-compose.yml`, `deploy/celmak.env.example`,
`deploy/nginx-celmak.conf`.

---

## A. Docker Compose ile kurulum (önerilen)

### 1. Docker'ı kurun

```bash
# Docker Engine + Compose (Debian/Ubuntu resmi script)
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker
docker --version && docker compose version
```

> Node sürümü, SQLite derlemesi gibi dertler yoktur — hepsi imajın içindedir
> (Node 24 tabanı). Webmin tarafında host Nginx'i Webmin yönetmeye devam eder;
> konteyneri aşağıdaki komutlarla ya da (kuruluysa) Webmin'in Docker modülüyle
> yönetirsiniz.

### 2. Kodu alın ve ortam değişkenlerini girin

```bash
sudo git clone https://github.com/bcilak/celmak-satis-pazarlama.git /opt/celmak
cd /opt/celmak

cp deploy/celmak.env.example deploy/celmak.env
nano deploy/celmak.env      # alan adınızı doldurun (WEBAUTHN_*, WEB_ORIGIN)
chmod 600 deploy/celmak.env
```

`DATA_DIR`, `PORT`, `NODE_ENV` değerleri Compose tarafından konteyner içinde
sabitlenir; env dosyasında asıl doldurmanız gerekenler **alan adı** satırlarıdır.

### 3. Başlatın

```bash
docker compose up -d --build
docker compose ps              # durum: healthy olmalı
docker compose logs -f         # canlı log
curl -s http://127.0.0.1:3001/api/health   # {"status":"ok","database":"sqlite"}
```

Uygulama yalnızca `127.0.0.1:3001`'e yayınlanır (dışarıya kapalı) — dış erişim
sonraki adımdaki Nginx üzerinden olur.

### 4. Güncelleme

```bash
cd /opt/celmak && git pull
docker compose up -d --build   # yeniden derler ve kesintisize yakın değiştirir
```

Veriler `celmak-data` adlı Docker volume'ünde kalır; güncellemede silinmez.

### 5. Yedekleme

```bash
# Volume'deki veritabanını bir dosyaya yedekle
docker run --rm -v celmak_celmak-data:/data -v "$PWD":/backup busybox \
  sh -c "cp /data/celmak.db /backup/celmak-$(date +%F).db"
```

> Volume adı genelde `<proje>_celmak-data` olur; `docker volume ls` ile doğrulayın.

---

## B. Nginx reverse proxy + HTTPS (her iki yöntemde ortak)

```bash
sudo cp deploy/nginx-celmak.conf /etc/nginx/sites-available/celmak.conf
sudo ln -s /etc/nginx/sites-available/celmak.conf /etc/nginx/sites-enabled/
# server_name değerini alan adınızla değiştirin
sudo nginx -t && sudo systemctl reload nginx
```

HTTPS sertifikası:

- **Webmin ile:** *Servers > Nginx Webserver* ya da Let's Encrypt aracıyla alın.
- **certbot ile:** `sudo certbot --nginx -d celmak.ornekalanadi.com`
  (443 bloğunu ve 80→443 yönlendirmesini otomatik ekler).

> Uygulama `trust proxy` açık geldiği için proxy arkasındaki HTTPS'i doğru
> algılar; Secure/HttpOnly çerezler bu sayede düzgün çalışır.

---

## C. Yayına almadan önce (zorunlu)

- **Tüm başlangıç/demo parolalarını değiştirin.** `Celmak!2026` ortak demo
  parolası ve demo hesaplar canlıya taşınmamalıdır.
- **Parola sıfırlama e-postası henüz bağlı değildir:** şu an sıfırlama bağlantısı
  uygulama loguna (`docker compose logs`) yazılır. Gerçek kullanım için bir SMTP/
  e-posta sağlayıcısı eklenmesi planlanmalıdır.
- **`celmak-data` volume'ünü düzenli yedekleyin** — tüm veri oradaki `celmak.db`
  dosyasındadır.

---

## D. Giriş kontrolü

Alan adınıza tarayıcıdan girin; `/api/auth/login` isteği `200` dönmeli ve
`celmak_session` adlı Secure/HttpOnly çerez oluşmalıdır. `/api/health`
`{"status":"ok"}` döndürüyorsa servis ayaktadır.

---

## Alternatif: Docker'sız (systemd ile doğrudan)

Docker kullanmak istemezseniz uygulamayı doğrudan Node ile çalıştırabilirsiniz.
**Node.js 22.5+** (tercihen 24) gerekir.

```bash
# Node 24 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash - && sudo apt-get install -y nodejs
# Kullanıcı ve dizinler
sudo useradd --system --home /opt/celmak --shell /usr/sbin/nologin celmak
sudo mkdir -p /opt/celmak /var/lib/celmak/data /etc/celmak
sudo chown -R celmak:celmak /opt/celmak /var/lib/celmak
# Kod + derleme
sudo -u celmak git clone https://github.com/bcilak/celmak-satis-pazarlama.git /opt/celmak
cd /opt/celmak && sudo -u celmak npm ci && sudo -u celmak npm run build
# Ortam değişkenleri
sudo cp deploy/celmak.env.example /etc/celmak/celmak.env   # DATA_DIR=/var/lib/celmak/data, alan adı
sudo chmod 600 /etc/celmak/celmak.env && sudo chown celmak:celmak /etc/celmak/celmak.env
# systemd servisi
sudo cp deploy/celmak.service /etc/systemd/system/celmak.service
sudo systemctl daemon-reload && sudo systemctl enable --now celmak
sudo systemctl status celmak
```

Ardından yukarıdaki **B** (Nginx) ve **C** (yayın öncesi) bölümlerini uygulayın.
Güncelleme: `git pull && npm ci && npm run build && sudo systemctl restart celmak`.
