# Kurulum — Kendi Sunucunuz (Webmin / Linux)

Uygulama **tek bir Node servisidir**: aynı süreç hem arayüzü (`dist/`) hem de
API'yi (`/api`) yayınlar. Önüne bir Nginx reverse proxy ve HTTPS koyulur,
veriler SQLite olarak kalıcı bir dizinde (`DATA_DIR`) tutulur.

> **Node sürümü:** En az **Node.js 22.5.0** gerekir (uygulama yerleşik
> `node:sqlite` modülünü kullanır). Daha eski sürüm çalışmaz.

Hazır şablonlar `deploy/` klasöründedir: `celmak.service`, `celmak.env.example`,
`nginx-celmak.conf`.

---

## 1. Sunucuyu hazırlayın

```bash
# Node 22.x (NodeSource ile; Debian/Ubuntu örneği)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # v22.5.0 veya üzeri olmalı

# Uygulama için ayrı bir kullanıcı ve dizinler
sudo useradd --system --home /opt/celmak --shell /usr/sbin/nologin celmak
sudo mkdir -p /opt/celmak /var/lib/celmak/data /etc/celmak
sudo chown -R celmak:celmak /opt/celmak /var/lib/celmak
```

## 2. Kodu sunucuya alın ve derleyin

```bash
# Depoyu /opt/celmak içine klonlayın (ya da dosyaları oraya kopyalayın)
sudo -u celmak git clone <DEPO_URL> /opt/celmak
cd /opt/celmak

sudo -u celmak npm ci
sudo -u celmak npm run build   # dist/ (arayüz) + dist-server/ (API) üretir
```

> Güncellemelerde: `git pull && npm ci && npm run build && sudo systemctl restart celmak`

## 3. Ortam değişkenlerini girin

```bash
sudo cp deploy/celmak.env.example /etc/celmak/celmak.env
sudo nano /etc/celmak/celmak.env     # alan adını ve yolları doldurun
sudo chmod 600 /etc/celmak/celmak.env
sudo chown celmak:celmak /etc/celmak/celmak.env
```

En az şunları ayarlayın: `NODE_ENV=production`, `PORT=3001`,
`DATA_DIR=/var/lib/celmak/data`, `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`,
`WEB_ORIGIN` (hepsi gerçek alan adınız).

## 4. systemd servisi olarak çalıştırın

```bash
sudo cp deploy/celmak.service /etc/systemd/system/celmak.service
sudo systemctl daemon-reload
sudo systemctl enable --now celmak
sudo systemctl status celmak          # active (running) olmalı
curl -s http://127.0.0.1:3001/api/health   # {"status":"ok","database":"sqlite"}
```

> Webmin'de de görünür: **System > Bootup and Shutdown** altında `celmak`
> servisini durdurup başlatab, loglarını **Others > System Logs** veya
> `journalctl -u celmak -f` ile izleyebilirsiniz.

## 5. Nginx reverse proxy + HTTPS

```bash
sudo cp deploy/nginx-celmak.conf /etc/nginx/sites-available/celmak.conf
sudo ln -s /etc/nginx/sites-available/celmak.conf /etc/nginx/sites-enabled/
# nginx-celmak.conf içindeki server_name değerini alan adınızla değiştirin
sudo nginx -t && sudo systemctl reload nginx
```

HTTPS sertifikası:

- **Webmin yoluyla:** *Servers > Nginx Webserver* (veya *Webmin > Networking*
  altındaki Let's Encrypt aracı) ile alan adına sertifika alın.
- **Komut satırıyla:** `sudo certbot --nginx -d celmak.ornekalanadi.com`
  (certbot 443 bloğunu ve 80→443 yönlendirmesini otomatik ekler).

> Uygulama `trust proxy` açık geldiği için proxy arkasındaki HTTPS'i doğru
> algılar; Secure/HttpOnly çerezler bu sayede düzgün çalışır.

## 6. Yayına almadan önce (zorunlu)

- **Tüm başlangıç/demo parolalarını değiştirin.** `Celmak!2026` ortak demo
  parolası ve demo hesaplar canlıya taşınmamalıdır.
- **Parola sıfırlama e-postası henüz bağlı değildir:** şu an sıfırlama bağlantısı
  sunucu loguna (`journalctl -u celmak`) yazılır. Gerçek kullanım için bir SMTP/
  e-posta sağlayıcısı eklenmesi planlanmalıdır.
- `DATA_DIR` dizinini (`/var/lib/celmak/data`) düzenli **yedekleyin** — tüm veri
  oradaki `celmak.db` dosyasındadır.

## 7. Giriş kontrolü

Alan adınıza tarayıcıdan girin; `/api/auth/login` isteği `200` dönmeli ve
`celmak_session` adlı Secure/HttpOnly çerez oluşmalıdır. `/api/health`
`{"status":"ok"}` döndürüyorsa servis ayaktadır.
