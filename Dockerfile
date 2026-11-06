# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage
# ---------------------------------------------------------------------------
# Debian (glibc) statt Alpine: sharp, better-sqlite3 und argon2 liefern für
# linux/amd64 und linux/arm64 zuverlässige glibc-Prebuilds.
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Build-Werkzeuge als Fallback, falls für eine Zielarchitektur kein Prebuild
# existiert (z. B. zukünftige Dependency-Updates).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Abhängigkeiten zuerst (besseres Layer-Caching).
COPY package*.json ./
RUN npm ci

# Anwendungscode und Build.
COPY . .
RUN npm run build \
  && npm prune --omit=dev \
  && npm cache clean --force

# ---------------------------------------------------------------------------
# Runtime stage
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# SQLite-CLI für Wartung und Backup-Jobs, poppler-utils für PDF-Thumbnails.
RUN apt-get update \
  && apt-get install -y --no-install-recommends gosu sqlite3 poppler-utils \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data/files /data/uploads /data/thumbs /data/snapshots /data/backups /data/agent /data/runtime \
  && chown -R node:node /data

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    FILES_DIR=/data/files

# Die Version wird beim Bauen aus dem Git-Tag gesetzt und für die
# Update-Prüfung verwendet. Ein gesetztes ENV überschreibt den Wert.
ARG ONEB_VERSION=0.2.3
ENV ONEB_VERSION=${ONEB_VERSION}

COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/addons ./addons
COPY --from=build --chown=node:node /app/agent ./agent
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh

# Der Entrypoint läuft kurz als Root, um Bind-Mounts zu initialisieren, und
# startet den Node-Prozess anschließend dauerhaft als Nicht-Root-Nutzer.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
VOLUME ["/data"]

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["gosu", "node:node", "node", "-e", "fetch('http://127.0.0.1:8080/api/v1/system/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "server/index.js"]
