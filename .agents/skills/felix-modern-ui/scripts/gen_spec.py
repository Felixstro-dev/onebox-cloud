#!/usr/bin/env python3
"""Erzeugt references/css-values.md: exakte Werte aus den echten Dateien.
  1. Token-Tabellen werden aus assets/tokens.css und assets/modern.css gelesen.
  2. Komponenten-Maße werden im Browser (Chromium via Playwright) aus den berechneten Stilen gemessen, getrennt für Claude und Modern.
  3. Keyframes und ausgewählte Regeln werden wörtlich aus den CSS-Dateien übernommen.
Aufruf: python scripts/gen_spec.py        (benötigt: pip install playwright && playwright install chromium)"""
import re, sys, json, pathlib, subprocess, tempfile
root = pathlib.Path(__file__).resolve().parent.parent
A = root / "assets"
read = lambda n: (A / n).read_text(encoding="utf-8")

def block(css, sel):
    m = re.search(re.escape(sel) + r"\s*\{", css)
    if not m: return ""
    i, d = m.end(), 1
    while i < len(css) and d: d += {"{": 1, "}": -1}.get(css[i], 0); i += 1
    return css[m.end():i - 1]
def decls(b): return dict(re.findall(r"(--[\w-]+):\s*([^;]+);", re.sub(r"/\*.*?\*/", "", b, flags=re.S)))
tokens, modern_css = read("tokens.css"), read("modern.css")
base = decls(block(tokens, ":root")); light = decls(block(tokens, ':root[data-theme="light"]')); modern = decls(block(modern_css, ':root[data-style="modern"]'))
def px(v):
    m = re.fullmatch(r"\s*(-?[\d.]+)rem\s*", v)
    return f"{v.strip()} ({float(m.group(1)) * 16:g} px)" if m else v.strip()
def row(name, *cols): return "| `" + name + "` | " + " | ".join(c if c else "·" for c in cols) + " |"
out = ["# CSS-Referenz: exakte Werte", "",
 "Diese Datei wird mit `python scripts/gen_spec.py` aus den echten CSS-Dateien erzeugt (Tokens gelesen, Komponenten im Browser gemessen). Bei Änderungen an `assets/` neu erzeugen. Maßgeblich bleiben die CSS-Dateien, diese Tabelle ist ihr Abbild. 1 rem = 16 px.", ""]

# ---- 1. Tokens
def group(title, pred, cols=("Dark / Standard", "Light", "Modern")):
    out.extend([f"### {title}", "", "| Token | " + " | ".join(cols) + " |", "|---|" + "---|" * len(cols)])
    for k in base:
        if pred(k): out.append(row(k, "`" + base[k].strip() + "`" if len(base[k]) < 70 else "`" + base[k].strip()[:60] + " …`", f"`{light[k].strip()}`" if k in light else "", f"`{modern[k].strip()}`" if k in modern else ""))
    out.append("")
out += ["## 1. Tokens", ""]
group("Farben", lambda k: k.startswith("--color-") and not k.startswith("--color-tile"))
group("Kategorie-Kacheln", lambda k: k.startswith("--color-tile") or k == "--color-text-on-tile")
out += ["### Typografie", "", "| Token | Wert |", "|---|---|"]
for k in base:
    if k.startswith(("--font-", "--text-", "--weight-", "--leading-")): out.append(row(k, "`" + px(base[k]).replace("|", "\\|") + "`"))
for k in modern:
    if k.startswith("--font-"): out.append(row(k + " (Modern)", "`" + modern[k].strip() + "`"))
out += ["", "Modern setzt für `h1`, `h2`, `.sheet__title`: Gewicht 600, Zeichenabstand −0,035 em, Zeilenhöhe 1,04, Grundschrift 15 px (0,9375 rem), Zeilenhöhe 1,5.", ""]
out += ["### Abstände, Größen, Radien", "", "| Token | Wert |", "|---|---|"]
for k in base:
    if k.startswith(("--space-", "--size-", "--radius-", "--icon-")): out.append(row(k, "`" + px(base[k]) + "`"))
for k in modern:
    if k.startswith("--radius-"): out.append(row(k + " (Modern)", "`" + px(modern[k]) + "`"))
out += ["", "### Schatten und Ebenen", "", "| Token | Wert |", "|---|---|"]
for k in list(base) + [k for k in modern if k not in base]:
    if k.startswith(("--shadow-", "--z-")): out.append(row(k, "`" + (modern.get(k) or base[k]).strip() + "`" + (" (Modern)" if k in modern else "")))
out += ["", "### Bewegung", "", "| Token | Standard | Modern |", "|---|---|---|"]
for k in base:
    if k.startswith(("--duration-", "--ease-")):
        v = base[k].strip(); v = v if len(v) < 90 else v[:80] + " …"
        out.append(row(k, f"`{v}`", f"`{modern[k].strip()}`" if k in modern else ""))
spring = re.search(r"--ease-spring:\s*(linear\([^;]+\));", tokens)
if spring: out += ["", "Federkurve (CSS `linear()`, gedämpft, etwa 4 % Überschwingen, ruhig nach 500 ms), vollständig:", "", "```css", "--ease-spring: " + spring.group(1) + ";", "```"]
out += ["", "Breakpoints (in `@media` als feste Werte): **640 px** (klein), **760 px** (Navigation klappt ein), **900 px** (Sidebar wird Overlay, Panels werden Sheets), **1180 px** (Seitenpanel wird Drawer). Grobe Zeiger: `@media (pointer: coarse)` hebt `--size-control` und `--size-icon-btn` auf 44 px.", ""]

# ---- 2. Komponenten messen
fix = pathlib.Path(tempfile.mkdtemp()) / "fixture.html"
subprocess.run([sys.executable, str(root / "scripts" / "bundle.py"), str(root / "scripts" / "fixture.src.html"), str(fix)], check=True, capture_output=True)
JS = """() => {
 const R = {}, rgbMap = {};
 const names = [...document.styleSheets].flatMap(s => [...s.cssRules]).filter(r => r.selectorText === ':root').flatMap(r => [...r.style]).filter(n => n.startsWith('--color-'));
 const probe = document.createElement('div'); document.body.append(probe);
 [...new Set(names)].forEach(n => { probe.style.color = `var(${n})`; const c = getComputedStyle(probe).color; (rgbMap[c] = rgbMap[c] || []).push(n.replace('--color-', '')); });
 const shadows = {}; ['sheet','menu','panel'].forEach(n => { probe.style.boxShadow = `var(--shadow-${n})`; shadows[getComputedStyle(probe).boxShadow] = 'shadow-' + n; }); probe.remove();
 const pref = (list, kind) => { const order = kind === 'text' ? ['text-', 'accent-', 'button-', 'success', 'warning', 'error'] : ['button-', 'bg-', 'tile-', 'border-', 'accent-']; for (const p of order) { const f = list.find(n => n.startsWith(p)); if (f) return f; } return list[0]; };
 const tok = (c, kind) => c === 'rgba(0, 0, 0, 0)' ? 'transparent' : (rgbMap[c] ? pref(rgbMap[c], kind) : c);
 const r2 = v => { const n = parseFloat(v); return isNaN(n) ? v : (Math.round(n * 2) / 2) + 'px'; };
 document.querySelectorAll('[data-spec]').forEach(el => { const c = getComputedStyle(el), b = el.getBoundingClientRect();
  const pad = [c.paddingTop, c.paddingRight, c.paddingBottom, c.paddingLeft].map(r2); const pd = pad.every(x => x === pad[0]) ? pad[0] : (pad[0] === pad[2] && pad[1] === pad[3] ? pad[0] + ' ' + pad[1] : pad.join(' '));
  const bw = parseFloat(c.borderTopWidth);
  R[el.dataset.spec] = { Größe: r2(b.width) + ' × ' + r2(b.height), Padding: pd === '0px' ? '' : pd, Radius: c.borderTopLeftRadius === '0px' ? '' : c.borderTopLeftRadius, Schrift: r2(c.fontSize) + ' / ' + c.fontWeight + ' / ' + (c.lineHeight === 'normal' ? 'normal' : r2(c.lineHeight)) + (c.letterSpacing !== 'normal' && c.letterSpacing !== '0px' ? ' / ' + r2(c.letterSpacing) : ''),
   Familie: c.fontFamily.split(',')[0].replace(/"/g, ''), Farbe: tok(c.color, 'text'), Fläche: tok(c.backgroundColor, 'bg'), Rand: bw ? r2(c.borderTopWidth) + ' ' + tok(c.borderTopColor, 'bg') : '', Schatten: c.boxShadow === 'none' ? '' : (shadows[c.boxShadow] || c.boxShadow),
   Abstand: c.rowGap && c.rowGap !== 'normal' && c.rowGap !== '0px' ? r2(c.rowGap) : '', Max: c.maxWidth !== 'none' ? r2(c.maxWidth) : '', Übergang: c.transitionDuration.split(',')[0] === '0s' ? '' : c.transitionDuration.split(',')[0].replace('0.', '.') + ' ' + c.transitionTimingFunction.split(/,(?![^(]*\\))/)[0].slice(0, 36) }; });
 return R; }"""
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 900, "height": 1200}); pg.goto(f"file://{fix}"); pg.wait_for_timeout(400)
    claude = pg.evaluate(JS); pg.evaluate("document.documentElement.dataset.style='modern'"); pg.wait_for_timeout(400); modernm = pg.evaluate(JS)
    pg.evaluate("delete document.documentElement.dataset.style; document.documentElement.dataset.theme='light'"); pg.wait_for_timeout(400); lightm = pg.evaluate(JS); b.close()
KEYS = ["Größe", "Padding", "Radius", "Schrift", "Familie", "Farbe", "Fläche", "Rand", "Schatten", "Abstand", "Max", "Übergang"]
def fmt(d): return "; ".join(f"{k} {d[k]}" for k in KEYS if d.get(k))
out += ["## 2. Komponenten-Maße (im Browser gemessen)", "", "Gemessen bei 900 px Viewport-Breite (fluide Schriftgrößen wie `.display` hängen davon ab). Format: Größe = Breite × Höhe der Demo-Instanz (bei Inhalt abhängig von Text). Farben als Token-Name. Übergang = Dauer und Kurve des ersten Übergangs.", "", "### Claude-Stil (Standard, Dark)", "", "| Element | Werte |", "|---|---|"]
for k, d in claude.items(): out.append(row(k, fmt(d).replace("|", "\\|")))
out += ["", "### Modern: nur Abweichungen vom Claude-Stil", "", "| Element | Abweichung |", "|---|---|"]
for k, d in modernm.items():
    diff = {x: d[x] for x in KEYS if d.get(x) != claude[k].get(x) and x != "Größe"}
    if diff: out.append(row(k, "; ".join(f"{x} {v or '–'}" for x, v in diff.items()).replace("|", "\\|")))
out += ["", "### Light: nur Abweichungen (Farben)", "", "| Element | Abweichung |", "|---|---|"]
for k, d in lightm.items():
    diff = {x: d[x] for x in ("Farbe", "Fläche", "Rand", "Schatten") if d.get(x) != claude[k].get(x)}
    if diff: out.append(row(k, "; ".join(f"{x} {v or '–'}" for x, v in diff.items())))
out.append("")

# ---- 3. Wörtliche Regeln und Keyframes
def rule(fname, sel):
    css = read(fname); m = re.search(r"^" + re.escape(sel) + r"\s*\{", css, re.M)
    if not m: return None
    i, d = m.end(), 1
    while i < len(css) and d: d += {"{": 1, "}": -1}.get(css[i], 0); i += 1
    return css[m.start():i].strip()
out += ["## 3. Wörtliche Regeln (Überlagerungen und Sonderfälle)", ""]
for fname, sels in [("components.css", [".sheet", ".sheet__grab", ".sheet-scrim", ".behind", ".menu"]), ("modern.css", [".prompt", ".stage__scrim", ".cta-bar", ".line-loader", ".dialog"]), ("loaders.css", [".js .preloader", ".preloader__logo", ".progress > i", ".btn[aria-busy=\"true\"]::before"]), ("effects.css", [".marquee", ".ticker", ".switch span::after"])]:
    for s in sels:
        r = rule(fname, s)
        if r: out += [f"`{fname}`", "", "```css", r, "```", ""]
out += ["## 4. Keyframes (wörtlich)", ""]
for fname in ("motion.css", "loaders.css", "effects.css", "modern.css"):
    for m in re.finditer(r"@keyframes\s+([\w-]+)\s*\{", read(fname)):
        css = read(fname); i, d = m.end(), 1
        while i < len(css) and d: d += {"{": 1, "}": -1}.get(css[i], 0); i += 1
        out.append("```css\n" + css[m.start():i].strip() + "\n```")
(root / "references" / "css-values.md").write_text("\n".join(out) + "\n", encoding="utf-8")
print("geschrieben:", root / "references" / "css-values.md", len("\n".join(out).splitlines()), "Zeilen")
