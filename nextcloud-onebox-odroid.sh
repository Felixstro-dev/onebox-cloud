#!/bin/bash
# ==========================================================
#  Nextcloud bereinigen & Onebox auf Odroid XU4 einrichten
#  Getestet auf Armbian 6.6.122-current-odroidxu4
# ==========================================================

set -euo pipefail

echo "================================================================="
echo "   Nextcloud loeschen & Onebox frisch einrichten (Port 8090)"
echo "================================================================="

# -----------------------------------------------------------------
# 1. NEXTLOCHD KOMPLETT LÖSCHEN
# -----------------------------------------------------------------
echo ">>> Schritt 1: Nextcloud Container & Daten entfernen"

# Laufende Nextcloud-Container stoppen & entfernen
docker compose -f /opt/nextcloud/docker-compose.yml down -v 2>/dev/null || true

# Häufige Nextcloud-Verzeichnisse bereinigen (falls vorhanden)
rm -rf /var/lib/nextcloud /srv/nextcloud /var/www/nextcloud 2>/dev/null
rm -f /var/lib/nextcloud/nextcloud.db 2>/dev/null
rm -f /etc/apache2/sites-available/nextcloud.conf 2>/dev/null
rm -f /etc/nginx/sites-available/nextcloud.conf 2>/dev/null
echo "   Nextcloud-Ressourcen bereinigt."

# -----------------------------------------------------------------
# 2. HDD PARTITIONIEREN & EINBINDEN
# -----------------------------------------------------------------
echo ">>> Schritt 2: HDD partitionieren & einbinden"

# Prüfen, welche HDD/Partition wir nutzen
# Bei deiner Odroid ist /dev/sda1 (232.8G) die externe/nächste Platte
HDD_DEVICE="/dev/sda1"
HDD_LABEL="OneboxHDD"
MOUNT_POINT="/data-onebox"

if [ ! -b "$HDD_DEVICE" ]; then
  echo "Fehler: $HDD_DEVICE nicht gefunden. Verfuegbare Partitionen:"
  lsblk
  exit 1
fi

# Prüfen, ob schon ext4 formatiert (Label prüfen)
if sudo blkid | grep -q "$HDD_LABEL"; then
  echo "$HDD_DEVICE ist bereits als $HDD_LABEL formatiert."
else
  echo "Formatiere $HDD_DEVICE als ext4 (Label: $HDD_LABEL)..."
  sudo mkfs.ext4 -F -L "$HDD_LABEL" "$HDD_DEVICE"
fi

# Einbindeverzeichnis erstellen und mounten
sudo mkdir -p "$MOUNT_POINT"
sudo mount "$HDD_DEVICE" "$MOUNT_POINT"

if mountpoint -q "$MOUNT_POINT"; then
  echo "   HDD erfolgreich gemountet unter $MOUNT_POINT"
  lsblk "$HDD_DEVICE"
else
  echo "HDD konnte nicht gemountet werden. Abbruch."
  exit 1
fi

# -----------------------------------------------------------------
# 3. ALTE ONEDOX-DATEN BEREINIGEN
# -----------------------------------------------------------------
echo ">>> Schritt 3: Alte Onebox-Daten bereinigen"

ONEBOX_DIR="/opt/onebox"
if [ -d "$ONEBOX_DIR" ]; then
  cd "$ONEBOX_DIR" || { echo "Onebox-Verzeichnis nicht gefunden."; exit 1; }
  rm -rf data/ files/ dist/ .env 2>/dev/null
  echo "   Alte Onebox-Ordner bereinigt."
else
  echo "   Kein Onebox-Verzeichnis unter $ONEBOX_DIR gefunden – fortfahre."
fi

# -----------------------------------------------------------------
# 4. ONEBOX DOCKER COMPOSE STARTEN (Port 8090)
# -----------------------------------------------------------------
echo ">>> Schritt 4: Onebox per Docker Compose starten"
cd "$ONEBOX_DIR" || exit 1

echo "   Image bauen (falls nötig)..."
docker compose build 2>&1 | tail -3

echo "   Container starten..."
docker compose up -d

# Warten & Health-Check
sleep 15
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8090/api/v1/system/health)
if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✅ Onebox läuft – Health-Check: $HTTP_CODE"
else
  echo "❌ Health-Check fehlgeschlagen (HTTP $HTTP_CODE). Logs: docker logs onebox"
  exit 1
fi

# -----------------------------------------------------------------
# 5. ERSTEN ADMIN‑USER EINRICHTEN
# -----------------------------------------------------------------
echo ">>> Schritt 5: Ersten Admin‑User einrichten"
echo ""
echo "   Öffne nun den Browser und gehe zu:"
echo "   http://192.168.30.202:8090/setup"
echo "   und richte den Admin‑User ein (Benutzername, Passwort mind. 10 Zeichen, Anzeigename)."
echo ""
echo "   Alternativ per CLI:"
echo '   curl -X POST http://192.168.30.202:8090/api/v1/system/setup \\'
echo '     -H '"'"'content-type: application/json'"'"' -H '"'"'x-onebox-csrf: 1'"'"' \\'
echo '     -d '"'"'{"username":"admin","password":"DeinPass123!","displayName":"Admin"'"'"''
echo ""
echo "================================================================="
echo "   FERTIG – Nextcloud gelöscht, HDD formatiert, Onebox läuft auf Port 8090."
echo "   Browser: http://192.168.30.202:8090/setup  (Admin‑User erstellen)"
echo "================================================================="