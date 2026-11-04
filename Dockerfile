FROM node:22-alpine
WORKDIR /app

# SQLite-CLI für Wartung und Backup-Jobs, poppler-utils für PDF-Thumbnails.
RUN apk add --no-cache sqlite poppler-utils

# Abhängigkeiten zuerst (besseres Layer-Caching).
COPY package*.json ./
RUN npm ci

# Anwendungscode und Build.
COPY . .
RUN npm run build
# Dev-Abhängigkeiten nach dem Build entfernen, um das Image schlank zu halten.
RUN npm prune --production

ENV PORT=8080
ENV HOST=0.0.0.0
ENV DATA_DIR=/data
ENV FILES_DIR=/data/files
RUN mkdir -p /data /data/files /data/uploads /data/thumbs /data/snapshots /data/backups /data/agent /data/runtime \
  && addgroup -S onebox \
  && adduser -S -G onebox -h /app onebox \
  && chown -R onebox:onebox /data

# Der Container läuft als Nicht-Root-Nutzer. Beschreibbar ist nur /data.
USER onebox
VOLUME ["/data"]

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/v1/system/health >/dev/null 2>&1 || exit 1

CMD ["node", "server/index.js"]
