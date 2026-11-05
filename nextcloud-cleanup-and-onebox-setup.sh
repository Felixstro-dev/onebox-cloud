#!/bin/bash
set -euo pipefail

echo "================================================================="
echo "   Nextcloud löschen & Onebox frisch einrichten (Port 8090)"
echo "================================================================="

# -----------------------------------------------------------------
# 1. NEXTLOCHD KOMPLETT LÖSCHEN
# -----------------------------------------------------------------
echo ">>> Schritt 1: Nextcloud Container & Daten entfernen"
if [ -d "/opt/nextcloud" ]; then
  cd /opt/nextcloud
  echo "   Nextcloud‑Docker‑Verzeichnis gefunden – Container stoppen & Volumen löschen"
  docker compose down -v 2>/dev/null || true
  docker system prune -a --volumes 2>/dev/null || true
else
  echo "   Kein bekanntes Nextcloud‑Docker‑Verzeichnis gefunden – fortfahre mit system‑bereinigung."
fi
# Häufige Nextcloud‑Verzeichnisse bereinigen
rm -rf /var/lib/nextcloud /srv/nextcloud /var/www/nextcloud 2>/dev/null
rm -f /var/lib/nextcloud/nextcloud.db 2>/dev/null
rm -f /etc/apache2/sites-available/nextcloud.conf 2>/dev/null
rm -f /etc/nginx/sites-available/nextcloud.conf 2>/dev/null
echo "   Nextcloud‑Ressourcen bereinigt."

# -----------------------------------------------------------------
# 2. HDD PARTITIONIEREN & EINBINDEN
# -----------------------------------------------------------------
echo ">>> Schritt 2: HDD partitionieren & einbinden"
if [ ! -b /dev/sdb1 ]; then
  echo "Fehler: /dev/sdb1 nicht gefunden. Abbruch."
  exit 1
fi
# Partition löschen/neu erstellen & als ext4 formatieren (Label: OneboxHDD)
echo "   Formatiere /dev/sdb1 als ext4 (Label: OneboxHDD)…"
sudo mkfs.ext4 -F /dev/sdb1
sudo mkfs.ext4 -L "OneboxHDD" /dev/sdb1
# Einbindenverzeichnis erstellen und mounten
sudo mkdir -p /data-onebox
sudo mount /dev/sdb1 /data-onebox
if mountpoint -q /data-onebox; then
  echo "   HDD erfolgreich gemountet unter /data-onebox"
  lsblk /dev/sdb1
else
  echo "HDD konnte nicht gemountet werden. Abbruch."
  exit 1
fi

# -----------------------------------------------------------------
# 3. ALTE ONEDOX-DATEN BEREINIGEN (optional, aber empfohlen)
# -----------------------------------------------------------------
echo ">>> Schritt 3: Alte Onebox‑Daten bereinigen"
cd /home/felix/Dokumente/Programmieren/onebox-cloud || { echo "Onebox‑Quellverzeichnis nicht gefunden."; exit 1; }
rm -rf data/ files/ dist/ .env 2>/dev/null
echo "   Alte Onebox‑Ordner bereinigt."

# -----------------------------------------------------------------
# 4. ONEBOX DOCKER COMPOSE STARTEN (Port 8090)
# -----------------------------------------------------------------
echo ">>> Schritt 4: Onebox per Docker Compose starten"
cd /home/felix/Dokumente/Programmieren/onebox-cloud
echo "   Image bauen (falls nötig)…"
docker compose build 2>&1 | tail -3
echo "   Container starten…"
docker compose -f /home/felix/Dokumente/Programmieren/onebox-cloud/docker-compose.yml up -d
# Warten & Health‑Check
sleep 10
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8090/api/v1/system/health)
if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✅ Onebox läuft – Health‑Check: $HTTP_CODE"
else
  echo "❌ Health‑Check fehlgeschlagen (HTTP $HTTP_CODE). Logs: docker logs onebox"
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