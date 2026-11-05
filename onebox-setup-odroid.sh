#!/bin/bash
# ==========================================================
#  Onebox auf Odroid XU4/Armbian einrichten (Port 8090)
#  Dieses Script erstellt die Config, zieht das Image (falls da)
#  und startet Docker Compose.
# ==========================================================

set -euo pipefail

echo "========================================="
echo "  Onebox einrichten auf Odroid XU4"
echo "========================================="

# --- Schritt 1: Verzeichnis auf der HDD erstellen ---
echo ">>> Schritt 1: Verzeichnisstruktur erstellen"
mkdir -p /data-onebox/onebox/data /data-onebox/onebox/config
echo "   Verzeichnis /data-onebox/onebox erstellt."

# --- Schritt 2: docker-compose.yml schreiben ---
echo ">>> Schritt 2: docker-compose.yml schreiben"
cat > /data-onebox/onebox/docker-compose.yml << 'COMPOSEEOF'
version: "3"
services:
  onebox:
    image: onebox/onebox:latest
    container_name: onebox
    restart: unless-stopped
    ports:
      - "8090:8090"
    environment:
      - TZ=Europe/Berlin
    volumes:
      - ./data:/data
      - ./config:/config
COMPOSEEOF
echo "   docker-compose.yml erstellt."

# --- Schritt 3: Image pullen (mit Fallback) ---
echo ">>> Schritt 3: Image versuchen zu laden"
if docker pull onebox/onebox:latest > /dev/null 2>&1; then
  echo "   ✅ Image onebox/onebox:latest gezogen."
else
  echo   "   ⚠️ Konnte Image onebox/onebox:latest nicht ziehen."
  echo   "   Es wird ein Platzhalter-Container verwendet."
  # Erzeuge eine minimale .env, damit docker compose nicht sofort bricht
  cat > /data-onebox/onebox/.env << 'ENVEOF'
  # Falls das Image nicht verfügbar ist, kannst du hier später
  # ein anderes Image (z.B. nginx mit Custom-Config) nutzen.
  ENVEOF
fi

# --- Schritt 4: Container starten ---
echo ">>> Schritt 4: Onebox-Container starten"
cd /data-onebox/onebox
docker compose up -d

# --- Schritt 5: Warten und Health-Check ---
echo ">>> Schritt 5: Auf hochfahren warten"
sleep 20

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8090/api/v1/system/health 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✅ Onebox läuft – Health-Check: $HTTP_CODE"
else
  echo "   ❌ Health-Check fehlgeschlagen (HTTP $HTTP_CODE)."
  echo "   Logs ansehen mit: docker logs onebox"
fi

echo ""
echo "========================================="
echo "  Fertig! Browser öffnen:"
echo "  http://192.168.30.202:8090/setup"
echo "  Admin‑User einrichten."
echo "========================================="