#!/bin/sh
set -eu

DATA_DIR=${DATA_DIR:-/data}
FILES_DIR=${FILES_DIR:-/data/files}

fail() {
  echo "[onebox] Start fehlgeschlagen: $*" >&2
  echo "[onebox] Prüfe, dass die gemounteten Pfade für UID/GID 1000 beschreibbar sind." >&2
  exit 1
}

for directory in "$DATA_DIR" "$FILES_DIR" "$DATA_DIR/uploads" "$DATA_DIR/thumbs" "$DATA_DIR/snapshots" "$DATA_DIR/backups" "$DATA_DIR/agent" "$DATA_DIR/runtime"; do
  case "$directory" in
    ""|/|[!/]*) fail "Datenpfad '$directory' muss absolut sein." ;;
  esac
  mkdir -p "$directory" || fail "Kann Verzeichnis '$directory' nicht anlegen. Der Mount muss beschreibbar sein."
done

# Bind-Mounts ersetzen die im Image gesetzten Besitzer. Übernehme deshalb
# vorhandene Daten beim Start, ohne sie zu löschen oder zu überschreiben.
for root in "$DATA_DIR" "$FILES_DIR"; do
  if [ -n "$(find "$root" ! -user node -o ! -group node -print -quit 2>/dev/null)" ]; then
    chown -R node:node "$root" || fail "Kann '$root' nicht an node:node (UID/GID 1000:1000) übertragen. Bei einem Read-only-, Netzwerk- oder nicht-POSIX-Dateisystem müssen die Host-Rechte angepasst werden."
  fi
done

gosu node:node test -r "$DATA_DIR" || fail "Datenpfad '$DATA_DIR' ist für node nicht lesbar."
gosu node:node test -w "$DATA_DIR" || fail "Datenpfad '$DATA_DIR' ist für node nicht beschreibbar."
gosu node:node test -r "$FILES_DIR" || fail "Dateipfad '$FILES_DIR' ist für node nicht lesbar."
gosu node:node test -w "$FILES_DIR" || fail "Dateipfad '$FILES_DIR' ist für node nicht beschreibbar."

exec gosu node:node "$@"
