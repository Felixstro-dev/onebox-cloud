FROM node:22-alpine
WORKDIR /app

# SQLite-CLI für Wartung und Backup-Jobs.
RUN apk add --no-cache sqlite

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
RUN mkdir -p /data /data/files /data/uploads /data/thumbs /data/snapshots /data/backups /data/agent /data/runtime

EXPOSE 8080
CMD ["node", "server/index.js"]
