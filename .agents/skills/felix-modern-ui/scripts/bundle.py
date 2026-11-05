#!/usr/bin/env python3
"""Baut aus einer Vorlage mit Platzhaltern eine eigenständige HTML-Datei.

Platzhalter in der Vorlage:
  /*@inline tokens.css*/      wird durch den Inhalt von assets/tokens.css ersetzt (ebenso motion.css,
                              components.css, app-shell.css)
  <!--@inline icons.svg-->    wird durch das Lucide-Sprite assets/icons.svg ersetzt

Aufruf:  python scripts/bundle.py assets/templates/chat.src.html /mnt/user-data/outputs/chat.html [--mark]
"""
import re, sys, pathlib

ASSETS = pathlib.Path(__file__).resolve().parent.parent / "assets"

MARK = "--mark" in sys.argv   # Bausteine mit BEGIN/END-Kommentaren umrahmen (gut für Coding-Agenten)
if MARK: sys.argv.remove("--mark")

def inline(match):
    name = match.group(1).strip()
    path = ASSETS / name
    if not path.exists():
        sys.exit(f"Datei nicht gefunden: {path}")
    text = path.read_text(encoding="utf-8").rstrip() + "\n"
    if MARK and name.endswith((".css", ".js")):
        a, b = ("/*", "*/")
        return f"{a} >>>>> BEGIN {name} {b}\n{text}{a} <<<<< END {name} {b}\n"
    if MARK and name.endswith(".svg"):
        return f"<!-- >>>>> BEGIN {name} (Lucide-Sprite, nur für die Demo-Oberfläche nötig) -->\n{text}<!-- <<<<< END {name} -->\n"
    return text

def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src, dst = map(pathlib.Path, sys.argv[1:])
    text = src.read_text(encoding="utf-8")
    text = re.sub(r"/\*@inline ([\w.\-]+)\*/", inline, text)
    text = re.sub(r"<!--@inline ([\w.\-]+)-->", inline, text)
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(text, encoding="utf-8")
    print(f"geschrieben: {dst} ({len(text) // 1024} KB)")

if __name__ == "__main__":
    main()
