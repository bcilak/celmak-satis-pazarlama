# Vercel ön inceleme kurulumu

Bu uygulamada Vercel arayüzü, Railway ise Express API ve kalıcı SQLite diski için kullanılır.

## 1. Railway API

1. Railway'de **New Project > Deploy from GitHub repo** ile bu depoyu seçin.
2. Servise bir **Volume** ekleyin ve mount path değerini `/app/data` yapın.
3. Aşağıdaki environment variable değerlerini ekleyin:

```text
NODE_ENV=production
DATA_DIR=/app/data
WEB_ORIGIN=https://VERCEL-ADRESINIZ.vercel.app
CROSS_ORIGIN_COOKIES=true
WEBAUTHN_RP_ID=VERCEL-ADRESINIZ.vercel.app
WEBAUTHN_ORIGIN=https://VERCEL-ADRESINIZ.vercel.app
```

4. Railway servisinde **Generate Domain** seçeneğini kullanın.
5. `https://RAILWAY-ADRESINIZ/api/health` adresinin `{"status":"ok"}` döndürdüğünü kontrol edin.

> Volume olmadan SQLite kayıtları yeni deploy veya servis yeniden başlatmasında kaybolabilir.

## 2. Vercel arayüzü

Vercel projesinin **Settings > Environment Variables** bölümüne şunu ekleyin:

```text
VITE_API_BASE_URL=https://RAILWAY-ADRESINIZ
```

Değeri Production, Preview ve Development ortamlarına uygulayın. Ardından Vercel'de son deployment için **Redeploy** çalıştırın. Vite ortam değişkenlerini derleme anında aldığı için yalnızca değişkeni eklemek yetmez; yeniden deploy gerekir.

## 3. Giriş kontrolü

```text
E-posta: selin@celmak.com
Parola: Celmak!2026
```

Yönetici onayı testi için `mehmet@celmak.com` veya `ayse@celmak.com` kullanılabilir. Başlangıç parolası aynıdır.

Tarayıcı geliştirici araçlarında `/api/auth/login` isteği `200` dönmeli ve `celmak_session` adlı Secure/HttpOnly çerez oluşmalıdır.

## 4. Güvenlik notu

Bu hesaplar ve ortak başlangıç parolası yalnızca anonim demo verisiyle yapılan ön inceleme içindir. Gerçek kullanım öncesinde parolalar değiştirilmeli, gerçek e-posta servisi bağlanmalı ve ayrı bir üretim veritabanına geçilmelidir.
