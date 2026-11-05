#!/usr/bin/env python3
"""Berechnet WCAG-Kontraste für die wichtigsten Token-Paare (Dark und Light) aus assets/tokens.css.
Aufruf: python scripts/contrast.py   (Exit-Code 1, wenn ein Text-Paar unter 4,5:1 fällt)"""
import re, sys, pathlib
css = (pathlib.Path(__file__).resolve().parent.parent / "assets" / "tokens.css").read_text(encoding="utf-8")
def block(sel):
    m = re.search(re.escape(sel) + r"\s*\{(.*?)\n\}", css, re.S)
    if m: return m.group(1)
    return re.search(re.escape(sel) + r"\s*\{(.*?)\n\}", (pathlib.Path(__file__).resolve().parent.parent / "assets" / "modern.css").read_text(encoding="utf-8"), re.S).group(1)
hexes = lambda b: dict(re.findall(r"(--[\w-]+):\s*(#[0-9a-fA-F]{6})", b))
dark = hexes(block(":root")); light = {**dark, **hexes(block(':root[data-theme="light"]'))}
modern = {**dark, **hexes(block(':root[data-style="modern"]'))}
def lum(h):
    f = lambda c: c / 12.92 if c <= .03928 else ((c + .055) / 1.055) ** 2.4
    r, g, b = (f(int(h[i:i + 2], 16) / 255) for i in (1, 3, 5)); return .2126 * r + .7152 * g + .0722 * b
def ratio(a, b):
    hi, lo = sorted([lum(a), lum(b)], reverse=True); return (hi + .05) / (lo + .05)
TEXT = [("text-primary", "bg-base"), ("text-primary", "bg-sidebar"), ("text-primary", "bg-elevated"), ("text-primary", "bg-active"),
        ("text-secondary", "bg-base"), ("text-secondary", "bg-sidebar"), ("text-secondary", "bg-elevated"), ("text-secondary", "bg-panel"),
        ("text-on-primary", "button-primary"), ("accent-blue", "bg-base"), ("text-on-tile", "tile-slides")]
OTHER = [("text-tertiary", "bg-base"), ("accent-orange", "bg-base")]
fail = False
for name, th in (("Dark", dark), ("Light", light), ("Modern", modern)):
    print(f"\n{name}\n{'Vordergrund':16}{'Hintergrund':16}{'Verhältnis':>10}  Ergebnis")
    for group, need in ((TEXT, 4.5), (OTHER, 3.0)):
        for a, b in group:
            ka, kb = f"--color-{a}", f"--color-{b}"
            if ka in th and kb in th:
                r = ratio(th[ka], th[kb]); ok = r >= need
                fail |= (not ok and group is TEXT)
                print(f"{a:16}{b:16}{r:10.2f}  {'ok' if ok else 'unter ' + str(need)}" + ("  (nur Deko/Disabled)" if group is OTHER else ""))
sys.exit(1 if fail else 0)
