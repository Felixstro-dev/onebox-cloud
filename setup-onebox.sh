#!/bin/bash
# =============================================================================
# Onebox frischer Start & Nextcloud löschen (für Odroid mit Docker)
# Voraussetzung: Du bist per SSH als root bei der Zielmaschine eingeloggt.
# =============================================================================

set -euo pipefail  # Fehlerabbruch bei unbekannten Variablen oder fehlgeschlagenen Befehlen

###############################################################################
# 1. NEXTLOCHD COMPLETEM LÖSCHEN
###############################################################################

echo "=== Schritt 1: Nextcloud restlos löschen ==="

# Falls Nextcloud in Docker Compose läuft (vermutlich in /opt/nextcloud oder ähnlich)
if [ -d "/opt/nextcloud" ]; then
    cd /opt/nextcloud
    echo "Nextcloud-Docker-Verzeichnis gefunden – Container stoppen & Volumen entfernen..."
    docker compose down -v 2>/dev/null || true
    docker system prune -a --volumes 2>/dev/null || true
else
    echo "Kein bekanntes Nextcloud-Docker-Verzeichnis gefunden – gehe von nativem Installat aus."
fi

# Nächstecloud-Datenverzeichnisse bereinigen (falls vorhanden)
rm -rf /var/lib/nextcloud /srv/nextcloud /var/www/nextcloud 2>/dev/null
rm -f /var/lib/nextcloud/nextcloud.db 2>/dev/null
rm -f /etc/apache2/sites-available/nextcloud.conf 2>/dev/null
rm -f /etc/nginx/sites-available/nextcloud.conf 2>/dev/null
echo "Nextcloud-Datenverzeichnisse bereinigt."

###############################################################################
# 2. HDD PARTITION FORMATIEREN & EINBINDEN
###############################################################################

echo "=== Schritt 2: HDD partitionieren & einbinden ==="

# Prüfen, ob /dev/sdb1 existiert
if [ ! -b /dev/sdb1 ]; then
    FEHLER "Blockdevice /dev/sdb1 nicht gefunden. Abbruch."
fi

# Partition löschen/neu erstellen & als ext4 formatieren (Achtung: Datenverlust!)
echo "Formatiere /dev/sdb1 als ext4 (Label: OneboxHDD)…"
sudo mkfs.ext4 -F /dev/sdb1
sudo mkfs.ext4 -L "OneboxHDD" /dev/sdb1

# Mount-Verzeichnis erstellen und einbinden
sudo mkdir -p /data-onebox
sudo mount /dev/sdb1 /data-onebox

# Prüfen
if mountpoint -q /data-onebox; then
    echo "HDD erfolgreich gemountet unter /data-onebox"
    lsblk /dev/sdb1
else
    FEHLER "HDD konnte nicht gemountet werden. Abbruch."
fi

###############################################################################
# 3. ALTE ONEDOX-DATEN BEREINIGEN (optional, aber empfohlen)
###############################################################################

echo "=== Schritt 3: Alte Onebox-Daten bereinigen ==="

cd /home/felix/Dokumente/Programmieren/onebox-cloud || FEHLER "Onebox-Verzeichnis nicht gefunden."

# Alte Ordner können gelöscht werden – docker compose erstellt sie bei Start neu
rm -rf data/ files/ dist/ .env 2>/dev/null
echo "Alte Onebox-Ordner bereinigt."

###############################################################################
# 4. ONEBOX DOCKER COMPOSE STARTEN (Port 8090)
###############################################################################

echo "=== Schritt 4: Onebox per Docker Compose starten ==="

cd /home/felix/Dokumente/Programmieren/onebox-cloud

# Docker-Image bauen (falls noch nicht vorhanden – dauert ca. 2–3 Min.)
echo "Build-Image (einsmalig, falls nötig)..."
docker build -t onebox:latest . 2>&1 | tail -3

# Container starten (Konfiguration: Port 8090, Volume auf HDD /data-onebox)
docker compose -f /home/felix/Dokumente/Programmieren/onebox-cloud/docker-compose.yml up -d

# Warten & Health-Check
echo "Warte auf Hochfahren..."
sleep 10

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8090/api/v1/system/health)
if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Onebox läuft – Health-Check: $HTTP_CODE"
else
    FEHLER "Onebox Health-Check fehlgeschlagen (HTTP $HTTP_CODE). Logs siehe mit: docker logs onebox"
fi

###############################################################################
# 5. ERSTEN ADMIN‑USER EINRICHTEN
###############################################################################

echo "=== Schritt 5: Ersten Admin‑User einrichten ==="

echo "Öffne nun den Browser und gehe zu:"
echo "  http://192.168.30.202:8090/setup"
echo " und füll das Formular aus (Benutzername, Passwort mind. 10 Zeichen, Anzeigename)."
echo "Alternativ per CLI:"
echo ""
echo 'curl -X POST http://192.168.30.202:8090/api/v1/system/setup \\'
echo '  -H '"'"'content-type: application/json'"'"' -H '"'"'x-onebox-csrf: 1'"'"' \\'
echo '  -d '"'"'{"username":"admin","password":"DeinPass123!","displayName":"Admin","setupToken":"ein-lang-16-zeichen-token"'"'"''
echo ""
echo "Nach der Einrichtung kannst du unter http://192.168.30.202:8090/ einloggen."

###############################################################################
# ENDE
###############################################################################

echo ""
echo "========================================================================="
echo "FERTIG – Nextcloud gelöscht, HDD formatiert, Onebox läuft auf Port 8090."
echo "Browser: http://192.168.30.202:8090/setup  (Admin‑User erstellen)"
echo "========================================================================="