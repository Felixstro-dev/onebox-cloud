#!/usr/bin/env python3
"""Baut das Paket zum direkten Einbinden: dist/felix-ui.css (lesbar), dist/felix-ui.min.css, dist/felix-ui.js.
Aufruf: python scripts/build_dist.py     (Ausgabe nach dist/ im Skill-Ordner)
Kern (felix-ui.css): tokens, motion, components, modern, site, loaders, effects. Für normale Seiten und Apps.
Optional, weil sie globale Regeln setzen: felix-ui-app.css (app-shell: body ohne Scrollen, Sidebar, Chat) und felix-ui-portfolio.css (Spotlight, X-Ray).
Reihenfolge ist wichtig: erst Kern, dann die optionalen Dateien."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
A, D = root / "assets", root / "dist"; D.mkdir(exist_ok=True)
css_order = ["tokens", "motion", "components", "modern", "site", "loaders", "upload-panel", "effects"]
js_order = ["sheet", "effects", "preloader", "upload-panel"]
def minify(css):
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    css = re.sub(r"\s+", " ", css)
    css = re.sub(r"\s*([{};,>])\s*", r"\1", css)          # nach Doppelpunkt bleibt das Leerzeichen erhalten (sicher für calc/linear)
    css = re.sub(r";}", "}", css)
    return css.strip()
parts = [f"/* ===== {n}.css ===== */\n" + (A / f"{n}.css").read_text(encoding="utf-8") for n in css_order]
head = "/* Felix Modern UI: Kernpaket (tokens, motion, components, modern, site, loaders, effects).\n   Stil Modern: <html data-style=\"modern\">. Light: <html data-theme=\"light\">. Icons: assets/icons.svg einmal in den body setzen. */\n"
full = head + "\n".join(parts)
(D / "felix-ui.css").write_text(full, encoding="utf-8")
(D / "felix-ui.min.css").write_text(minify(full), encoding="utf-8")
for extra, name in (("app-shell", "app"), ("portfolio", "portfolio")):
    txt = (A / f"{extra}.css").read_text(encoding="utf-8")
    (D / f"felix-ui-{name}.css").write_text(txt, encoding="utf-8"); (D / f"felix-ui-{name}.min.css").write_text(minify(txt), encoding="utf-8")
js = "/* Felix Modern UI: sheet.js, effects.js, preloader.js */\n" + "\n".join(f"/* ===== {n}.js ===== */\n" + (A / f"{n}.js").read_text(encoding="utf-8") for n in js_order)
(D / "felix-ui.js").write_text(js, encoding="utf-8")
# Schlankes Loader-Paket: nur Bewegung, Loader und Effekte mit genau den Tokens, die sie brauchen (zum Einbauen in fremde Apps)
def block(css, sel):
    m = re.search(re.escape(sel) + r"\s*\{", css)
    if not m: return ""
    i, d = m.end(), 1
    while i < len(css) and d: d += {"{": 1, "}": -1}.get(css[i], 0); i += 1
    return css[m.end():i - 1]
tok = (A / "tokens.css").read_text(encoding="utf-8")
base = dict(re.findall(r"(--[\w-]+):\s*([^;]+);", re.sub(r"/\*.*?\*/", "", block(tok, ":root"), flags=re.S)))
light = dict(re.findall(r"(--[\w-]+):\s*([^;]+);", block(tok, ':root[data-theme="light"]')))
body = "\n".join((A / f"{n}.css").read_text(encoding="utf-8") for n in ("motion", "loaders", "upload-panel", "effects"))
local = set(re.findall(r"(--[\w-]+)\s*:", body)) | set(re.findall(r"@property\s+(--[\w-]+)", body))
need = {v for v in re.findall(r"var\((--[\w-]+)", body) if v in base and v not in local}
while True:
    more = {v for k in need for v in re.findall(r"var\((--[\w-]+)", base[k]) if v in base} - need
    if not more: break
    need |= more
order = [k for k in base if k in need]
root_block = ":root {\n" + "\n".join(f"  {k}: {base[k].strip()};" for k in order) + "\n}\n"
light_block = ':root[data-theme="light"] {\n' + "\n".join(f"  {k}: {light[k].strip()};" for k in order if k in light) + "\n}\n"
rm = re.search(r"@media \(prefers-reduced-motion: reduce\)\s*\{.*?\n\}\n(?:/\*.*?\*/\n)?html\[data-reduce-motion=\"true\"\].*?\n\}\n", tok, re.S)
spring = re.search(r"@supports \(transition-timing-function: linear\(0, 1\)\) \{.*?\n\}\n", tok, re.S)
mini = ("/* Felix Modern UI: schlankes Loader-Paket (Bewegung, Loader, Preloader, Upload-Fenster, Effekte).\n   Enthält nur die Tokens, die diese Dateien brauchen. Hat deine App eigene Tokens, lösche den Block :root unten und mappe die Namen (siehe LOADERS-INTEGRATION.md).\n   Icons: .loader-star braucht ein Lucide-Icon (asterisk), sonst keine Icons. */\n"
        + root_block + "\n" + (spring.group(0) if spring else "") + "\n" + light_block + "\n" + (rm.group(0) if rm else "") + "\n" + body)
(D / "felix-loaders.css").write_text(mini, encoding="utf-8"); (D / "felix-loaders.min.css").write_text(minify(mini), encoding="utf-8")
(D / "felix-loaders.js").write_text("/* Felix Modern UI: Loader-Skripte (effects.js, preloader.js) */\n" + "\n".join((A / f"{n}.js").read_text(encoding="utf-8") for n in ("effects", "preloader", "upload-panel")), encoding="utf-8")
print("Tokens im Loader-Paket:", len(order))
for f in sorted(D.iterdir()): print(f"{f.name}: {f.stat().st_size // 1024} KB")
