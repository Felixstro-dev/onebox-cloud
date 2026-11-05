# Onebox auf Odroid (Docker & Docker Compose)

## 1. Image bauen (einmalig, nach Code-Änderung)

```bash
cd /home/felix/Dokumente/Programmieren/onebox-cloud
docker build -t onebox:latest .
```

## 2. Docker Compose Datei erstellen

Erstelle `docker-compose.yml` in deinem Home-Verzeichnis (oder wo auch immer):

```yaml
version: '3.8'

services:
  onebox:
    image: onebox:latest
    container_name: onebox
    restart: unless-stopped
    ports:
      - "8080:8080"       # Host-Port 8080 → Container 8080
    environment:
      - PORT=8080
      - HOST=0.0.0.0
      - DATA_DIR=/data      # <- persists inside volume
      - FILES_DIR=/data/files
      - LOG_LEVEL=info
      - TRUST_PROXY=0
      - SECURE_COOKIES=0
      - SESSION_DAYS=30
      - MAX_UPLOAD_BYTES=0
      - SETUP_TOKEN=dein-16-stelliges-token  # <-- beim ersten Start setzen!
    volumes:
      - onebox-data:/data   # <-- WICHTIG: DB, Uploads, Settings bleiben erhalten
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8080/api/v1/system/health"]
      interval: 30s
      timeout: 5s
      start_period: 20s
      retries: 3
```

## 3. Erststart

```bash
docker compose up -d
```

- Container startet, richtet SQLite-DB ein
- Du erreichst Onebox unter `http://<odroid-ip>:8080`
- **Erstes Setup:** Rufe die Setup-URL auf oder nutze die API, um den ersten Admin-User zu erstellen:
  ```
  curl -X POST http://odroid-ip:8080/api/v1/system/setup \
    -H 'content-type: application/json' -H 'x-onebox-csrf: 1' \
    -d '{"username":"admin","password":"Passwort123!","displayName":"Admin","setupToken":"dein-16-stelliges-token"}'
  ```

## 4. Daten persistence

- Das Volume `onebox-data` (von Docker Compose automatisch erstellt) enthält:
  - `data/onebox.db` (SQLite mit User, Settings, Jobs, Speicherorte)
  - `data/uploads/` (abgeschlossene Upload-Sessions)
  - `data/files/objects/` (hochgeladene Dateien)
  - `data/thumbs/` (Miniaturen)
  - `data/snapshots/` (DB-Backups vor Migrationen)

Der Container initialisiert neue und bestehende Mounts beim Start und setzt
deren Besitz auf `node:node` (UID/GID 1000). **Ändere das Volume nicht manuell.**
Bei Updates einfach den Container neu starten – die Daten bleiben erhalten.

## 5. Updates durchführen

### A) Nur Code-Änderung (Image neu bauen + neu starten)

```bash
cd /home/felix/Dokumente/Programmieren/onebox-cloud
docker compose build        # Image neu bauen (cacht Layers)
docker compose up -d        # Container neustarten mit neuem Image
```

- `data/` und `files/` bleiben im Volume erhalten ✅
- Migrationen laufen beim ersten Start automatisch (Drizzle erkennt, welche schon liefen)
- **Keine Datenverlust** bei normalen Änderungen (User, Uploads, Settings bleiben erhalten)

### B) Wenn du das Docker-Image ersetzt (z. B. aus Registry)

```bash
docker compose pull      # Falls Image in Registry verfügbar
docker compose up -d
```

### C) Backup vor großem Update (optional)

```bash
# Container stoppen, Daten kopieren, dann updaten
docker compose stop
cp -r data onebox-backup-$(date +%Y%m%d)
docker compose up -d
```

## 6. Häufige Fragen

| Frage | Antwort |
|------|----------|
| **Sehe ich meine HDD / Speicherorte nach Update?** | Ja, weil `/data` im Volume liegt. Nur bei `docker compose down -v` würde der gesamte lokale Datenordner gelöscht werden – lass das weg! |
| **Muss ich nach jedem `npm run build` neu bauen?** | Nur wenn du `web/` Code geändert hast. `server/` Änderungen erfordern `docker compose build`. |
| **Wie setze ich ein Passwort zurück, wenn ich es vergessen habe?** | Du kannst die DB direkt bearbeiten: `docker exec onebox sqlite3 /data/onebox.db "UPDATE users SET passwordHash='...'"` – oder neu aufsetzen mit neuem `SETUP_TOKEN`. |
| **ODROID-Architektur?** | Das Dockerfile nutzt `node:22-alpine`, das auf ARM (Odroid) läuft. Prüfe mit `docker compose config` ob `platform: linux/arm64` gesetzt ist, falls der Odroid 64-Bit nutzt. |

## 7. Update-Protokoll (kurz)

1. Code ändern → `git add . && git commit -m "..."`
2. `docker compose build && docker compose up -d`
3. Testen: `curl http://odroid-ip:8080/api/v1/system/health` → `200`
4. Daten sind da (DB, Uploads, Settings).

Alles klar? Soll ich die `docker-compose.yml` Datei automatisch für dich erstellen?