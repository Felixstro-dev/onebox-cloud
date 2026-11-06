# Onebox

Selbst gehostete Cloud in einem Container: Dateien, Fotos, Dokumente, Freigaben,
Chat und Backups. Fertige Images gibt es auf
[GitHub Container Registry](https://github.com/Felixstro-dev/onebox-cloud/pkgs/container/onebox-cloud).

Unterstützte Architekturen: `linux/amd64` (PC/Server) und `linux/arm64`
(Raspberry Pi 4/5, Odroid N2 und andere moderne ARM-Boards). 32-Bit-ARM
(`linux/arm/v7`) wird nicht mehr gebaut.

## Schnellstart mit Docker Compose

Voraussetzungen: Docker 24+ mit Compose v2 und ein Linux-Server.

```bash
mkdir -p onebox && cd onebox
curl -fsSLO https://raw.githubusercontent.com/Felixstro-dev/onebox-cloud/master/docker-compose.yml
# Update-Token setzen (schützt die interne Update-API):
echo "UPDATE_API_TOKEN=$(openssl rand -hex 24)" > .env
docker compose pull
docker compose up -d
```

Onebox ist danach unter `http://<server-ip>:8090` erreichbar. Beim ersten
Aufruf führt `/setup` durch die Einrichtung des Admin-Kontos.

Alle Daten liegen im Ordner `./data` neben der `docker-compose.yml`:
SQLite-Datenbank, Uploads, Vorschaubilder und Migrations-Snapshots. Sichere
diesen Ordner regelmäßig.

### Sicherheitshinweis zur Ersteinrichtung

Onebox verwendet keinen separaten Setup-Token mehr.

Das bedeutet, dass eine Person, die während der offenen Ersteinrichtung Zugriff
auf die Setup-Seite erhält, möglicherweise das erste Administratorkonto
erstellen und die Kontrolle über die Installation übernehmen kann.

**Sicherheitsmaßnahmen:**

- Onebox vor der Ersteinrichtung nicht ungeschützt öffentlich erreichbar machen.
- Den Zugriff auf `/setup` während der Ersteinrichtung durch eine Firewall, VPN
  oder HTTP-Authentifizierung des Reverse-Proxys beschränken.
- Die Ersteinrichtung möglichst unmittelbar nach der Installation durchführen.
- Nach erfolgreicher Einrichtung prüfen, dass keine erneute
  Administratorregistrierung möglich ist.
- HTTPS für den regulären Betrieb aktivieren.

Die Ersteinrichtung verlangt nur Benutzername, Passwort und optionalen
Anzeigenamen. Sie kann nur einmal erfolgreich abgeschlossen werden; bestehende
Administratorkonten und Daten werden nicht überschrieben.

### Ohne Compose starten

```bash
docker run -d \
  --name onebox \
  --restart unless-stopped \
  -p 8090:8080 \
  -v "$PWD/onebox-data:/data" \
  ghcr.io/felixstro-dev/onebox-cloud:latest
```

Für Ein-Klick-Updates wird zusätzlich der Watchtower-Container aus der
`docker-compose.yml` benötigt (siehe [Updates](#updates)).

## Die richtige Festplatte wählen und einbinden

Onebox kann Daten auf einer zweiten Festplatte ablegen. Der Container sieht nur
Ordner, die ausdrücklich als Volume eingebunden wurden. Deshalb wird die
Platte **auf dem Host** gemountet und anschließend in den Container
durchgereicht.

### 1. Platte auf dem Host finden und mounten

```bash
lsblk -f
# Beispiel: /dev/sdb1 ist die gewünschte Platte
sudo mkdir -p /mnt/onebox-drive
sudo mount /dev/sdb1 /mnt/onebox-drive
```

Damit der Mount einen Neustart übersteht, per UUID in `/etc/fstab` eintragen:

```bash
sudo blkid /dev/sdb1          # UUID notieren
# /etc/fstab ergänzen:
# UUID=<uuid>  /mnt/onebox-drive  ext4  defaults,nofail  0  2
sudo mount -a
```

Das Dateisystem sollte `ext4` oder `xfs` sein. **NTFS/exFAT** funktionieren
zwar, verlieren aber Besitzer- und Rechteinformationen und sind für die
Datenbank nicht geeignet. Für die Onebox-Daten immer ein Linux-Dateisystem
verwenden.

### 2. Ordner anlegen und einbinden

Der Container initialisiert den Bind-Mount beim Start automatisch. Der
Entrypoint läuft dafür kurz als Root, legt die benötigten Unterordner an und
überträgt den Besitz auf `node:node` (**UID/GID 1000**). Der Node-Prozess läuft
danach weiterhin als Nicht-Root. Vorhandene Dateien werden nicht gelöscht oder
überschrieben:

```bash
sudo mkdir -p /mnt/onebox-drive/onebox
```

### 3. Volume in `docker-compose.yml` eintragen

```yaml
    volumes:
      - ./data:/data
      - /mnt/onebox-drive/onebox:/mnt/onebox-drive/onebox
```

Danach neu starten:

```bash
docker compose up -d
```

Bei einem Read-only-, Netzwerk- oder nicht-POSIX-Dateisystem kann Docker den
Besitz nicht übertragen. Onebox beendet sich dann mit dem betroffenen Pfad
und dem Hinweis auf `1000:1000`; passe in diesem Fall den Host-Mount an. Ein
pauschales `chmod 777` ist nicht erforderlich.

### 4. Speicherort in Onebox aktivieren

Unter **Speicher → Neuer Speicherort** den Pfad aus dem Container eintragen,
z. B. `/mnt/onebox-drive/onebox`, und „Als Standardspeicher verwenden“
aktivieren. Neue Uploads landen dann auf der großen Platte. Bestehende Dateien
bleiben am alten Ort; sie werden nicht automatisch verschoben.

> **Hinweis:** Ein Mount aus der Onebox-Oberfläche heraus ist nur mit
> zusätzlichen Rechten (`privileged`, `/dev`-Durchreichung) möglich und wird
> nicht empfohlen. Der Host-Mount oben ist der robuste Weg.

Für **Backups** kann derselbe Ordner genutzt werden. Als Zielverzeichnis im
Backup-Dialog z. B. `/mnt/onebox-drive/onebox/backups` eintragen; der Ordner
wird bei Bedarf angelegt. Das Verzeichnis muss im Container sichtbar und
beschreibbar sein.

## Updates

### Manuell

```bash
docker compose pull
docker compose up -d
```

Die Daten in `./data` bleiben erhalten. Vor größeren Updates empfiehlt sich
eine Kopie des Ordners.

### Ein-Klick-Update aus der Oberfläche

Die mitgelieferte `docker-compose.yml` startet einen kleinen
Watchtower-Container (`onebox-updater`). Er beobachtet nur Container mit dem
Label `com.centurylinklabs.watchtower.enable=true` und wird ausschließlich
über eine interne HTTP-API ausgelöst.

Ablauf beim Klick auf **Jetzt aktualisieren**:

1. Onebox prüft das neueste GitHub-Release.
2. Die Instanz geht für mindestens 30 Sekunden in den Wartungsmodus
   (`/maintenance`) und führt ausstehende Datenbank-Migrationen aus.
3. Der Updater zieht das neue Image und startet den Container neu.
4. Sobald der neue Container läuft und keine Wartung mehr aktiv ist, leitet die
   Wartungsseite automatisch zurück zur Startseite.

Damit die Prüfung funktioniert, wird `ONEB_VERSION` beim Bauen des Images aus
dem Git-Tag gesetzt (bei Branch-Builds `0.2.8`). Die Variable kann bei Bedarf in
Compose überschrieben werden, normalerweise ist das nicht nötig.

Wichtige Variablen:

| Variable | Standard | Beschreibung |
| --- | --- | --- |
| `ONEB_VERSION` | `0.2.8` | Installierte Version für die Update-Prüfung |
| `UPDATE_API_URL` | – | Interne Updater-URL, in Compose vorbelegt |
| `UPDATE_API_TOKEN` | – | Token für die Updater-API (in `.env` setzen) |
| `DOCKER_API_VERSION` | `1.44` | Docker-API-Version, die der Updater per CLI-Flag verwendet; nur für ältere Daemons absenken |
| `UPDATE_DELAY_SECONDS` | `30` | Wartezeit vor dem Neustart (mindestens 30) |
| `UPDATE_CHECK_REPO` | `Felixstro-dev/onebox-cloud` | Repository für Release-Prüfungen |

Ohne laufenden Updater bleibt der Button deaktiviert und die Oberfläche zeigt
einen Hinweis. Das manuelle Update über `docker compose pull` funktioniert
weiterhin.

Der Updater verwendet `nickfedor/watchtower:1.24.0` mit festem Digest. Die
gepflegte Fork unterstützt die explizite Docker-API-Version per `--api-version`;
das alte `containrrr/watchtower:1.7.1` fällt auf einen veralteten Client zurück
und ist für Docker Engine 29 nicht geeignet. Der Updater benötigt den
lesenden und schreibenden Docker-Socket, um Container zu inspizieren, Images zu
ziehen und Container mit Cleanup bzw. Rolling Restart neu zu erzeugen.

## Konfiguration

| Variable | Standard | Beschreibung |
| --- | --- | --- |
| `PORT` | `8080` | Port im Container |
| `HOST` | `0.0.0.0` | Bind-Adresse |
| `DATA_DIR` | `/data` | SQLite-DB, Uploads und Metadaten |
| `FILES_DIR` | `/data/files` | Ablage der Datei-Objekte |
| `BASE_URL` | – | Öffentliche URL, z. B. `https://cloud.example.com` |
| `SECURE_COOKIES` | `0` | Hinter HTTPS auf `1` setzen |
| `TRUST_PROXY` | `0` | Hinter Reverse-Proxy auf `1` setzen |
| `SESSION_DAYS` | `30` | Gültigkeit der Sitzung |
| `MAX_UPLOAD_BYTES` | `0` | Upload-Limit, `0` = unbegrenzt |

## Reverse Proxy und HTTPS

Beispiel für Caddy:

```
cloud.example.com {
    reverse_proxy 127.0.0.1:8090
}
```

Beim Betrieb hinter HTTPS in Compose setzen:

```env
BASE_URL=https://cloud.example.com
SECURE_COOKIES=1
TRUST_PROXY=1
```

## Backups

Unter **Backups** gibt es zwei Wege:

- **Ordner in Onebox** sichert einen Ordner aus Onebox auf eine lokale Platte
  (Pfad im Container, z. B. `/data/backups`) oder an eine andere
  Onebox-Instanz.
- **Rechner verbinden** legt einen Agenten für einen externen Rechner an. Der
  Agent lädt dessen Ordner direkt nach Onebox; ein separater Backup-Auftrag ist
  nicht nötig.

Beim lokalen Ziel wird pro Lauf ein Ordner unter
`<Ziel>/onebox/<Auftrags-ID>/<Lauf-ID>/` angelegt. Er enthält die Dateien,
ein `manifest.json` und einen Datenbank-Snapshot. Die Aufbewahrung löscht nur
ältere Läufe desselben Auftrags.

## Lokal bauen

```bash
docker build -t onebox:latest .
```

Bei jedem Push auf `master` und für Tags (`v*`) baut die GitHub Action ein
Multi-Arch-Image und veröffentlicht es als `latest`, `master` und
`sha-<commit>` bzw. als Versions-Tag.

## Entwicklung und Releases

Hinweise für Mitwirkende und KI-Agenten stehen in [`AGENTS.md`](AGENTS.md).
Für ein neues Release immer zuerst die Version an allen Stellen setzen:

```bash
npm run version:bump -- 0.2.0
```

Danach committen, Tag `v0.2.0` pushen **und** ein GitHub-Release anlegen –
ohne Release findet die Update-Prüfung keine neue Version.

## Fehlersuche

- **Seite nicht erreichbar:** `docker compose logs -f onebox` prüfen.
- **Update-Button deaktiviert:** Läuft `onebox-updater`? Ist
  `UPDATE_API_TOKEN` in `.env` gesetzt und gleich für beide Container?
- **`onebox-updater` startet ständig neu:** Prüfe, ob noch ein alter
  `containrrr/watchtower:1.7.1`-Container existiert. Die aktuelle Compose-Datei
  verwendet `nickfedor/watchtower:1.24.0` mit Docker-API-Version `1.44`.
  Aktualisiere und erzwinge die Neuerstellung des Updaters:

  ```bash
  docker compose pull onebox-updater
  docker compose up -d --force-recreate onebox-updater
  docker inspect onebox-updater --format '{{.Config.Image}}'
  ```

  Die letzte Ausgabe muss mit `nickfedor/watchtower:1.24.0@sha256:` beginnen.
- **Speicherort nicht akzeptiert:** Pfad muss im Container existieren und für
  UID 1000 beschreibbar sein.
- **Nach einem Update hängt die Wartungsseite:** `docker compose ps` prüfen und
  bei Bedarf `docker compose up -d` erneut ausführen.
