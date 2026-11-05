# Onebox

Selbst gehostete Cloud in einem Container: Dateien, Fotos, Dokumente, Freigaben
und Backups. Fertige Multi-Arch-Images gibt es auf
[GitHub Container Registry](https://github.com/Felixstro-dev/onebox-cloud/pkgs/container/onebox-cloud).

Unterstützte Architekturen: `linux/amd64`, `linux/arm64`, `linux/arm/v7`
(z. B. Odroid XU4).

## Deployment per Docker Compose

```bash
mkdir -p onebox && cd onebox
curl -fsSLO https://raw.githubusercontent.com/Felixstro-dev/onebox-cloud/master/docker-compose.yml
docker compose pull
docker compose up -d
```

Onebox ist danach unter `http://<server-ip>:8090` erreichbar. Beim ersten
Aufruf von `/setup` wird der Admin-Benutzer angelegt.

Das Image kann auch direkt gestartet werden:

```bash
docker run -d \
  --name onebox \
  --restart unless-stopped \
  -p 8090:8080 \
  -v onebox-data:/data \
  -e SETUP_TOKEN=<mindestens-16-zeichen> \
  ghcr.io/felixstro-dev/onebox-cloud:latest
```

## Konfiguration

| Variable | Standard | Beschreibung |
| --- | --- | --- |
| `PORT` | `8080` | Port im Container |
| `HOST` | `0.0.0.0` | Bind-Adresse |
| `DATA_DIR` | `/data` | SQLite-DB und Metadaten |
| `FILES_DIR` | `/data/files` | Ablage der Datei-Objekte |
| `BASE_URL` | – | Öffentliche URL, z. B. `https://cloud.example.com` |
| `SECURE_COOKIES` | `0` | Hinter HTTPS auf `1` setzen |
| `TRUST_PROXY` | `0` | Hinter Reverse-Proxy auf `1` setzen |
| `SESSION_DAYS` | `30` | Gültigkeit der Sitzung |
| `MAX_UPLOAD_BYTES` | `0` | Upload-Limit, `0` = unbegrenzt |
| `SETUP_TOKEN` | – | Optionaler Schutz der Ersteinrichtung (min. 16 Zeichen) |

## Update

```bash
docker compose pull
docker compose up -d
```

Die Daten in `./data` bleiben dabei erhalten. Vor großen Updates empfiehlt sich
eine Sicherung des Ordners.

## Lokal bauen

```bash
docker build -t onebox:latest .
```

Für Updates wird bei jedem Push auf `master` automatisch ein neues Image
gebaut und als `latest`, `master` und `sha-<commit>` veröffentlicht.
