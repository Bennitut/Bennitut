# FoodTracker-Server als Container – für einen Server im Internet (z. B. ein Cloud-Dienst mit Docker oder ein eigener
# Server). Zum Testen auf dem Laptop braucht es das nicht: dort start-test.cmd bzw. npm start.
#
# Bauen (im Ordner FoodTracker/server):  docker build -t foodtracker-server .
# Starten:  docker run -d --name foodtracker -p 3000:3000 -v foodtracker-data:/app/data foodtracker-server
# Prüfen:   http://localhost:3000/api/health – und docker ps zeigt nach einer halben Minute „(healthy)“.
#
# Einstellungen als Umgebungsvariablen (docker run -e NAME=Wert bzw. in den Einstellungen des Hosters), alle erklärt in
# .env.example. Eine .env kommt nie ins Image (.dockerignore). Wichtig für einen Server im Internet:
# - Ohne DATABASE_URL liegen Datenbank (SQLite) und Fotos in /app/data – dafür das Volume (-v), sonst sind sie weg,
#   sobald der Container ersetzt wird. Dienste ohne dauerhafte Dateien brauchen DATABASE_URL (Postgres, z. B. Neon).
# - CORS_ORIGINS: Vorgabe ist die Web-Version auf GitHub Pages. Wer sie ändert, ersetzt die Vorgabe – also für eigene
#   Domains die Pages-Adresse mit aufzählen, z. B. CORS_ORIGINS=https://bennitut.github.io,https://www.example.org
# - Hinter dem HTTPS-Proxy des Hosters zusätzlich TRUST_PROXY=1, damit das Rate-Limit die echten Adressen sieht.
# - ALLOW_DEV_LOGIN wirkt hier nicht (NODE_ENV=production, siehe src/runtime.ts).

# 1. Bauen: TypeScript → JavaScript (dist/), danach nur die Pakete für den Betrieb behalten.
FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

# 2. Betrieb: Node.js (LTS) mit dem fertigen JavaScript, ohne Quelltext, Tests und Werkzeuge zum Bauen.
FROM node:26-slim
ENV NODE_ENV=production \
    FOODTRACKER_CONTAINER=1 \
    PORT=3000 \
    CORS_ORIGINS=https://bennitut.github.io
WORKDIR /app
# package.json: "type": "module" – ohne sie liest Node dist/*.js nicht als ES-Module.
COPY package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# Beschreiben darf der Server nur data/ (SQLite-Datei und Fotos), und er läuft nicht als root.
RUN mkdir -p data && chown node:node data
USER node
EXPOSE 3000
# Lebenszeichen ohne Datenbank und KI (GET /api/health/live, siehe src/app.ts). Beim Hoster denselben Pfad als
# Health-Check eintragen.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "dist/healthcheck.js"]
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/index.js"]
