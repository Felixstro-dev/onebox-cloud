#!/usr/bin/env python3
"""Token-Integrität: findet verwendete, aber nicht definierte CSS-Variablen (Fehler) und definierte, aber nie genutzte (Hinweis).
Aufruf: python scripts/check_tokens.py [weitere-datei.html ...]   Exit-Code 1 bei undefinierten Variablen ohne Fallback."""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
files = [p for p in (root / "assets").rglob("*") if p.suffix in {".css", ".html", ".js", ".svg"}] + [pathlib.Path(a) for a in sys.argv[1:]]
defined, used, local = set(), {}, set()
for f in files:
    txt = f.read_text(encoding="utf-8")
    defined |= set(re.findall(r"@property\s+(--[\w-]+)", txt))
    for m in re.finditer(r"(--[\w-]+)\s*:", txt):
        (defined if f.name == "tokens.css" else local).add(m.group(1))
    for m in re.finditer(r"var\((--[\w-]+)(\s*,)?", txt):
        used.setdefault(m.group(1), []).append((f.name, bool(m.group(2))))
bad = {k: v for k, v in used.items() if k not in defined | local and not k.endswith("-") and not all(fb for _, fb in v)}
for k, v in sorted(bad.items()): print(f"FEHLER undefiniert: {k}  in {sorted({n for n, _ in v})}")
skip = ("--bp-", "--z-")
unused = sorted(k for k in defined if k not in used and not k.startswith(skip))
if unused: print("Hinweis, definiert aber ungenutzt:", ", ".join(unused))
print("OK: keine undefinierten Variablen" if not bad else f"{len(bad)} undefinierte Variable(n)")
sys.exit(1 if bad else 0)
