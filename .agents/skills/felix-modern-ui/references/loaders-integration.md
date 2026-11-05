# Loader, Preloader und Effekte in eine App einbauen

Für Coding-Agenten. Quelle der Wahrheit ist `loaders-single-page.html` (alles in einer Datei, Bausteine mit `>>>>> BEGIN` / `<<<<< END` markiert) und das schlanke Paket `felix-loaders.css` + `felix-loaders.js`. Live-Ansicht: https://claude.ai/artifact/VSqme4gUS4owNPrQoRnogY

## 1. Minimaler Einbau (drei Schritte)

1. `felix-loaders.css` (oder `.min.css`) in die App laden, **nach** deinen eigenen Basisstilen.
2. `felix-loaders.js` laden. Es setzt drei globale Objekte: `FX`, `Preloader`, `TopBar`.
3. In `<html>` die Klassen setzen: `class="js"` (immer), `is-loading` (nur wenn ein Preloader beim Laden sichtbar sein soll). Am besten in einem winzigen Inline-Skript im `<head>`: `document.documentElement.classList.add('js','is-loading')`.

Das Paket enthält die Bewegungs-Keyframes, alle Loader, den Preloader und die Effekte. Es braucht keine Icons, außer `.loader-star` (Lucide `asterisk`, ein beliebiges SVG mit der Klasse genügt).

## 2. Eigene Design-Tokens statt der mitgelieferten

Das Paket bringt in einem `:root`-Block genau diese 34 Variablen mit. Hat deine App eigene Tokens, **lösche den `:root`-Block** (und den `data-theme="light"`-Block) am Anfang von `felix-loaders.css` und definiere die Namen in deinem Projekt, oder weise sie deinen Werten zu (`--color-text-primary: var(--dein-text);`).

| Variable | Standardwert |
|---|---|
| `--color-bg-deep` | `#0e0e0e` |
| `--color-bg-base` | `#191919` |
| `--color-bg-elevated` | `#303030` |
| `--color-bg-active` | `#404040` |
| `--color-border-subtle` | `#282828` |
| `--color-border-default` | `#313131` |
| `--color-text-primary` | `#f1f1f1` |
| `--color-text-secondary` | `#9a9a9a` |
| `--color-button-primary` | `#efefef` |
| `--color-text-on-primary` | `#191919` |
| `--color-accent-orange` | `#d97757` |
| `--color-accent-brand` | `var(--color-accent-orange)` |
| `--color-success` | `#4ade80` |
| `--color-focus-ring` | `#4a9eff` |
| `--font-mono` | `ui-monospace, "SF Mono", Menlo, monospace` |
| `--text-sm` | `0.875rem` |
| `--space-3` | `.75rem` |
| `--space-6` | `1.5rem` |
| `--space-8` | `2rem` |
| `--radius-sm` | `.625rem` |
| `--radius-lg` | `1.25rem` |
| `--radius-pill` | `999px` |
| `--z-tooltip` | `60` |
| `--duration-fast` | `120ms` |
| `--duration-base` | `200ms` |
| `--duration-slow` | `300ms` |
| `--ease-out` | `cubic-bezier(.2, .8, .2, 1)` |
| `--ease-in-out` | `cubic-bezier(.4, 0, .2, 1)` |
| `--duration-sheet` | `500ms` |
| `--ease-sheet` | `cubic-bezier(.32, .72, 0, 1)` |
| `--duration-spring` | `500ms` |
| `--duration-draw` | `700ms` |
| `--duration-count` | `1400ms` |
| `--ease-spring` | `cubic-bezier(.34, 1.3, .64, 1)` |

Farb-Rollen in einem Satz: `text-primary/secondary` = Haupt-/Nebentext, `bg-base/elevated/active/deep` = Seite, Fläche, aktive Fläche, tiefster Grund, `button-primary` = heller Primär-Button, `accent-brand` = Markenfarbe nur für Lade-Akzente, `success` = Haken, `border-default/subtle` = Linien.

## 3. Rezepte (kopieren)

**Ring (klein)** `<span class="spinner" role="status"><span class="loader-text">Lädt</span></span>`  (größer: `spinner spinner--lg`)

**Button wartet** `<button class="btn" aria-busy="true">Speichern</button>`: Ring links, Text bleibt, Klicks gesperrt. Setze `aria-busy` per Code, entferne es danach. Heißt deine Button-Klasse anders, ersetze `.btn[aria-busy="true"]` in `loaders.css` durch deinen Selektor.

**KI denkt** `<svg class="loader-star" ...><!-- Lucide asterisk --></svg> <span class="shimmer-text">Denke nach …</span>`
**Punkte** `<span class="dots" role="status"><i></i><i></i><i></i><span class="loader-text">Schreibt</span></span>`
**Equalizer** `<span class="loader-bars" role="status"><i></i><i></i><i></i><i></i></span>`  **Live-Puls** `<span class="loader-ping"></span>`

**Skeleton und Inhalt**
```html
<div class="content-swap" id="box">
  <div class="skeleton-card" data-skel aria-busy="true">
    <div class="skeleton skeleton--shimmer skeleton--block"></div>
    <div class="skeleton skeleton--shimmer skeleton--title"></div>
    <div class="skeleton skeleton--shimmer skeleton--line"></div>
  </div>
  <div data-real> … echter Inhalt … </div>
</div>
<script>box.classList.add('loaded')  /* wenn die Daten da sind */</script>
```
Skeleton und Inhalt müssen gleich groß sein (feste Höhe oder `aspect-ratio`).

**Fortschritt** `<div class="progress"><i style="--p:.4"></i></div>` (Wert 0 bis 1 aus einem echten Upload/Download). Unbestimmt: `progress progress--indeterminate`.
**Linie am Seitenrand** `<div class="topbar-progress"><i></i></div>` einmal im Layout, dann `TopBar.start()` beim Navigationsstart und `TopBar.done()` bei Ende.
**Schritte** `<ol class="steps"><li data-state="done">…</li><li data-state="active">…</li><li data-state="todo">…</li></ol>` (Zustände per Code setzen).
**Bild-Platzhalter** `<img class="blur-up" src=…>` plus einmal `FX.blurUp()`.

**Preloader**
```html
<div class="preloader" data-exit="up" role="status" aria-live="polite">
  <div class="preloader__inner">
    <svg class="preloader__logo" viewBox="0 0 24 24" aria-hidden="true"><path pathLength="1" d="M12 6v12"/><path pathLength="1" d="M17.196 9 6.804 15"/><path pathLength="1" d="m6.804 9 10.392 6"/></svg>
    <div class="preloader__count" aria-hidden="true">000</div><span class="loader-text">Seite lädt</span>
  </div>
  <div class="preloader__bar" aria-hidden="true"><i></i></div>
</div>
<script>Preloader.start({ minMs: 1100, maxMs: 4000, once: 'intro', onDone() {} });</script>
```
Logo-Pfade durch dein eigenes Logo ersetzen (jeder `path` mit `pathLength="1"`). `data-exit="fade"` statt Vorhang möglich. Ereignis `preloader:done` am `document`.

**Effekte** `fx-fade-up`, `fx-scale-in`, `fx-blur-in`, `fx-clip-up`, `fx-from-left/right` (Staffelung `style="--i:2"`), `FX.splitWords(el)` + Klasse `split-in` für Wort-Masken, `<span class="ticker" style="--to:128">` für Zahlen, `.hover-lift`, `.link-grow`, `.hover-arrow`, `.switch`, `.marquee`, `.scroll-progress`, `FX.themeSwitch(button, fn)` für den Kreis-Wechsel Hell/Dunkel.

## 4. Regeln, die gelten

- Loader erst nach ~200 ms zeigen, dann mindestens ~400 ms halten. Skeleton für Inhalte, Ring für Aktionen, Balken bei bekannter Dauer, Linie am Rand für Hintergrundabrufe.
- Preloader nur für schwere Seiten oder Intro-Momente, mit `once`, mit Höchstdauer. Der Inhalt bleibt im DOM. Zähler zeigt nur echten Fortschritt.
- Jeder Loader: `role="status"` und Text in `.loader-text`. Container beim Laden `aria-busy="true"`.
- `prefers-reduced-motion` bleibt aktiv: Schleifen stehen still, der Preloader öffnet sofort. Zustand darf nie nur aus Bewegung bestehen.
- Dauern nur über Tokens. Bedienelemente höchstens 300 ms, Ebenen 500 ms, inszeniert (Preloader-Zeichnung, Zähler) nur über `--duration-draw` und `--duration-count`.

## 5. Svelte / SvelteKit

- CSS in `src/routes/+layout.svelte` importieren (`import '$lib/felix-loaders.css'`), das Sprite oder Icons über deine eigene Icon-Lösung.
- `src/app.html`: `<html lang="de" class="js is-loading">` setzen und den Preloader-Block direkt in `<body>` vor `%sveltekit.body%`.
- Skript als Modul einbinden, nicht blind als globales Objekt: aus `felix-loaders.js` die Funktionen exportieren (am Dateiende `export { FX, Preloader, TopBar }` ergänzen und `window`-Zuweisung entfernen), und `Preloader.start()` in `onMount` aufrufen. Nie beim Serverrendern auf `window` oder `document` zugreifen.
- Ladezustände aus Svelte-Zuständen ableiten: `<button class="btn" aria-busy={saving}>`, Skeleton über `{#await}`-Blöcke, `TopBar.start()/done()` in `beforeNavigate` und `afterNavigate`.
- Nach dem Einbau prüfen: Seite ohne JavaScript bleibt lesbar, Tastatur-Fokus sichtbar, „Bewegung reduzieren“ getestet, bei 390 px kein horizontales Scrollen, keine Konsolenfehler, kein Layout-Sprung beim Wechsel von Skeleton zu Inhalt.
