# syntax=docker/dockerfile:1

# Çelmak Sipariş Yönetimi — tek servis (arayüz + API), gömülü SQLite.
# Node 24 taban: node:sqlite bu sürümde bayraksız stabil çalışır.

# --- Derleme aşaması: arayüzü (dist/) ve sunucuyu (dist-server/) üretir ---
FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Çalışma aşaması: yalnızca üretim bağımlılıkları + derleme çıktıları ---
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/data
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server

# Kalıcı veri dizini; volume buraya bağlanır. node kullanıcısı yalnızca buraya
# yazar (/app salt okunur çalışır), bu yüzden yalnızca /data chown'lanır.
RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist-server/index.js"]
