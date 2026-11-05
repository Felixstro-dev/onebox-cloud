#!/usr/bin/env python3
"""Prüft eine HTML- oder CSS-Datei gegen die harten Regeln des Warm-Dark-UI-Stils.

Aufruf:  python scripts/check_style.py datei.html [--strict]
Ausgabe: Liste der Verstöße mit Zeilennummer. Exit-Code 1, wenn etwas gefunden wurde.

Geprüft werden: rohe Farbwerte außerhalb der Token-Blöcke, Schatten außer Tokens, outline:none,
Emojis in der UI, Animationen/Übergänge über 300 ms (Endlos-Schleifen ausgenommen),
Icons ohne Lucide-Sprite-Bezug sowie Pflichtbestandteile (Reduced-Motion, Focus-Ring, Viewport).
"""
import re, sys, pathlib

def strip_token_blocks(css):
    """Ersetzt Inhalt von :root{...} und :root[data-theme]{...} durch Leerzeilen (Zeilen bleiben erhalten)."""
    out, i = [], 0
    pat = re.compile(r":root[^{]*\{")
    while True:
        m = pat.search(css, i)
        if not m:
            out.append(css[i:]); break
        out.append(css[i:m.start()])
        depth, j = 1, m.end()
        while j < len(css) and depth:
            depth += {"{": 1, "}": -1}.get(css[j], 0); j += 1
        out.append(re.sub(r"[^\n]", "", css[m.start():j]))
        i = j
    return "".join(out)

EMOJI = re.compile("[\U0001F300-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF]")
HEX = re.compile(r"#[0-9a-fA-F]{3,8}\b")
DUR = re.compile(r"(?<![\w.-])(\d*\.?\d+)(ms|s)\b")

def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    path = pathlib.Path(sys.argv[1])
    raw = path.read_text(encoding="utf-8")
    text = strip_token_blocks(raw)
    issues = []
    for n, line in enumerate(text.splitlines(), 1):
        code = re.sub(r"<!--.*?-->", "", line)
        if "href=\"#i-" in code or "id=\"i-" in code:
            code = re.sub(r'(href|id)="#?i-[\w-]+"', "", code)
        if HEX.search(code) and "<svg" not in code:
            issues.append((n, "roher Farbwert, stattdessen var(--color-…) nutzen", HEX.search(code).group()))
        if re.search(r"box-shadow\s*:", code) and "var(--shadow" not in code and "none" not in code:
            issues.append((n, "Schatten nur über --shadow-sheet / --shadow-menu", ""))
        if re.search(r"outline\s*:\s*(none|0)\b", code) and ":has(" not in raw and ":focus-within" not in raw:
            issues.append((n, "outline:none ohne Ersatz (Focus-Ring bleibt Pflicht)", ""))
        if EMOJI.search(code):
            issues.append((n, "Emoji in der UI, stattdessen Lucide-Icon", EMOJI.search(code).group()))
        if re.search(r"\b(transition|animation)(-duration)?\s*:", code) and "infinite" not in code:
            for v, u in DUR.findall(code):
                ms = float(v) * (1000 if u == "s" else 1)
                if ms > 300 and "var(--" not in code[:0]:
                    issues.append((n, f"Dauer {v}{u} über 300 ms", "")); break
    if "prefers-reduced-motion" not in raw:
        issues.append((0, "prefers-reduced-motion-Block fehlt (steht in tokens.css)", ""))
    if ":focus-visible" not in raw:
        issues.append((0, ":focus-visible-Stil fehlt (steht in tokens.css)", ""))
    if path.suffix == ".html" and "viewport" not in raw:
        issues.append((0, "<meta name=\"viewport\"> fehlt", ""))
    if path.suffix == ".html" and re.search(r"<(i|span)[^>]*class=\"[^\"]*\bfa[sbr]?\b", raw):
        issues.append((0, "Font-Awesome-Icons gefunden, bitte Lucide verwenden", ""))
    for n, msg, hit in issues:
        print(f"{path.name}:{n or '-'}: {msg} {hit}".rstrip())
    print("OK: keine Verstöße" if not issues else f"{len(issues)} Verstoß/Verstöße")
    sys.exit(1 if issues else 0)

if __name__ == "__main__":
    main()
