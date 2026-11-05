# AGENTS.md

Anleitung für Menschen und KI-Agenten, die an Onebox arbeiten. **Wichtigster
Punkt: Bei jedem neuen Release muss die Version an allen Stellen aktualisiert
werden** – siehe [Versionierung und Releases](#versionierung-und-releases).

## Projektüberblick

Onebox ist eine selbst gehostete Cloud als einzelner Docker-Container:

- **Backend:** Node.js 22, Fastify, SQLite (better-sqlite3), Drizzle ORM
- **Frontend:** Svelte 5 (Legacy-Syntax, kein TypeScript) + Vite
- **Deployment:** Docker Multi-Arch (`linux/amd64`, `linux/arm64`) auf GHCR
- **Updates:** GitHub-Releases + Watchtower-Seit container (`onebox-updater`)

Wichtige Ordner:

| Pfad | Inhalt |
| --- | --- |
| `server/` | Fastify-App, Routen, Services, DB-Schema und Migrationen |
| `server/db/migrations/` | Drizzle-Migrationen (nicht manuell bearbeiten) |
| `web/src/` | Svelte-Frontend (Views, Components, Styles) |
| `agent/` | Backup-Agent für externe Rechner |
| `scripts/` | Hilfsskripte (u. a. Versions-Bump) |
| `tests/` | Node-Tests inkl. E2E |

Nicht ins Repository gehören: `data/`, `backups/`, `files/`, `.env`, `dist/`,
`node_modules/`. Diese sind in `.gitignore`/`.dockerignore` ausgeschlossen.

## Qualitäts-Gates

Vor jedem Commit bzw. Push:

```bash
npm run build       # Vite-Build (bricht bei Svelte-Fehlern ab)
npm run lint        # ESLint, 0 Fehler erwartet
npm run typecheck   # svelte-check, 0 Fehler erwartet
npm test            # Node-Tests
```

`svelte-check` und ESLint melden bestehende Warnungen; neue **Fehler** sind
immer zu beheben. Warnungen nicht ohne Grund erhöhen.

## Versionierung und Releases

Die Version existiert an mehreren Stellen und muss synchron bleiben:

| Datei | Stelle |
| --- | --- |
| `package.json` | `"version"` |
| `package-lock.json` | Top-Level und `packages[""]` |
| `server/config.js` | Fallback von `process.env.ONEB_VERSION` |
| `Dockerfile` | `ARG ONEB_VERSION=…` (Fallback für lokale Builds) |
| `.env.example` | `ONEB_VERSION=…` |
| `README.md` | „bei Branch-Builds …“ und die Variablentabelle |

### Version erhöhen

Immer das Skript verwenden, damit keine Stelle vergessen wird:

```bash
npm run version:bump -- 0.2.0
```

Das Skript akzeptiert `MAJOR.MINOR.PATCH` (optional mit Pre-release, z. B.
`0.2.0-beta.1`) und aktualisiert alle oben genannten Dateien.

Danach prüfen:

```bash
git diff
grep -rn "$(node -p "require('./package.json').version")" \
  package.json package-lock.json server/config.js Dockerfile .env.example README.md
```

### Release veröffentlichen

1. Gates ausführen (siehe oben).
2. Version committen:
   ```bash
   git add package.json package-lock.json server/config.js Dockerfile .env.example README.md
   git commit -m "chore(release): v0.2.0"
   ```
3. Tag setzen und pushen:
   ```bash
   git tag -a v0.2.0 -m "Onebox v0.2.0"
   git push origin master
   git push origin v0.2.0
   ```
4. **GitHub-Release anlegen.** Das ist Pflicht, weil die Update-Prüfung
   `GET /repos/Felixstro-dev/onebox-cloud/releases/latest` liest:
   ```bash
   gh release create v0.2.0 --generate-notes
   ```
5. Warten, bis die Action „Docker image“ erfolgreich ist. Sie baut
   `linux/amd64` und `linux/arm64` und veröffentlicht Tags wie `0.2.0`,
   `latest` und `sha-<commit>` auf GHCR.

### Warum das wichtig ist

- Die Version wird beim Image-Build aus dem Git-Tag als `ONEB_VERSION`
  eingebacken (siehe `.github/workflows/docker.yml`).
- `server/services/updates.js` vergleicht `config.version` mit dem neuesten
  GitHub-Release. Ohne neues Release und ohne Versions-Bump bleibt der
  Update-Hinweis aus.
- Ein Tag ohne Release oder ein Release ohne Tag führt zu falschen
  Update-Ergebnissen.

### Regeln

- Version **niemals** nur in `package.json` ändern.
- Kein `linux/arm/v7` wieder hinzufügen; unterstützt werden nur `amd64` und
  `arm64`.
- Keine echten Secrets, `.env`-Dateien oder Backup-Daten committen.
- Keine manuellen Änderungen an generierten Migrationsdateien; stattdessen
  `npm run db:generate`.

## Update-Mechanik (Kurzfassung)

1. Admin prüft unter **Einstellungen → Updates** oder über das Popup unten
   links.
2. `POST /api/v1/system/update` startet den Wartungsmodus
   (`/maintenance`, mindestens 30 s) und führt Migrationen aus.
3. Nach `UPDATE_DELAY_SECONDS` ruft Onebox die Watchtower-HTTP-API auf.
4. Watchtower zieht das neue Image und startet den Container neu.
5. Die Wartungsseite prüft `/api/v1/system/maintenance` und leitet zurück,
   sobald die Wartung beendet ist.

Relevante Dateien:

- `server/services/updates.js` – Versionsvergleich, Wartungsstatus, Updater
- `server/routes/system.js` – Update-Endpunkte
- `server/app.js` – Wartungs-Middleware
- `web/src/components/UpdateNotice.svelte` – Popup unten links
- `web/src/views/Settings.svelte` – Admin-Karte „Updates“
- `docker-compose.yml` – `onebox-updater` (Watchtower)

## Backups

- `server/services/backups.js` – lokale und Remote-Läufe, Retention, Restore
- `server/routes/backups.js` – Aufträge und Agenten
- Lokale Läufe liegen unter `<Ziel>/onebox/<jobId>/<runId>/`.

Beim Ändern der Pfadlogik immer `localRunDir()` verwenden, damit Retention und
Restore denselben Ordner finden.

## Stil und Konventionen

- UI-Texte auf Deutsch, Code und Kommentare auf Deutsch oder Englisch – im
  Zweifel an die umgebende Datei anpassen.
- Bestehende Design-Tokens aus `web/src/styles/` verwenden, keine neuen
  Rohfarben.
- A11y: interaktive Elemente brauchen Labels, Dialoge Fokus-Handling,
  Statusmeldungen `aria-live`.
- Performance: große Listen paginieren (`limit`/`cursor`), keine
  `select()`-Vollabfragen nur zum Zählen (`count(*)` nutzen).
- Neue Abhängigkeiten nur, wenn nötig; das Image soll klein bleiben.
