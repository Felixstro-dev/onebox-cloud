# Persistenz & Upgrade-Sicherheit

## Daten, die erhalten bleiben (nicht gelöscht bei Upgrade):
- `.env` — Konfiguration (Port und Datenverzeichnisse)
- `data/` — SQLite-Datenbank (`onebox.db`), Uploads, Thumbnails, Snapshots
- `files/` — Objekte (File-Storage)
- `dist/` — Gebauter Web-Client (wird bei jeder `npm run build` neu erzeugt)

## Upgrade-Verhalten:
- `npm run build` überschreibt nur `dist/`, nicht `data/` oder `files/`
- `npm install` aktualisiert `node_modules/`, berührt nicht `data/`
- Migrationen (`server/db/migrations/`) werden über `__drizzle_migrations` getrackt und nur einmal ausgeführt
- Neue Spalten (z. B. `storage_locations.source`) werden via `ALTER TABLE` hinzugefügt

## Docker-Deployment (Persistenz via Volumes):
```bash
docker run -d \
  -v onebox-data:/data \
  -v onebox-files:/files \
  -e DATA_DIR=/data \
  -e FILES_DIR=/files \
  -e PORT=8080 \
  onebox
```

## Laufwerks-Erkennung (auto-mount):
- `lsblk --json` liest alle Block-Geräte korrekt (inkl. Label wie `Felix-Daten`)
- `blkid -o export` ergänzt fehlende Labels
- `/dev/sdb1` (Felix-Daten) wird als `Unmounted` erkannt — bei Auswahl als Speicher wird automatisch `mount` ausgeführt
