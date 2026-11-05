---
name: felix-modern-ui
description: >-
  Baut Web-UIs, Websites und Portfolios im Look der Claude-App und im modernen Stil von Felix: warmes
  neutrales Dunkelgrau, Serif- oder Geist-Titel, Karten ohne Schatten, heller Primär-Button,
  Lucide-Icons, iOS-artige Animationen mit Bottom-Sheets, Loader und Preloader. Nutze ihn IMMER, wenn
  Frontend-Code, Komponenten, Chats, Dashboards, Landingpages, normale Websites (Firma, Blog, Doku),
  Portfolios, Tools oder Mockups gebaut werden und der Nutzer keinen anderen Stil vorgibt, auch bei
  "mach eine UI", "Website", "Homepage" oder "schöne Oberfläche". Ebenso bei "Claude-Look", "Dark
  Mode", "Lucide", "Animationen", "Loader", "Preloader". Bei "modern", "make it modern", "sleek" oder
  "wie mein Frontend" gilt data-style="modern" (Geist, schwebendes Prompt-Panel, Bühne mit Scrim,
  Pill-CTA). Bei "Portfolio" gilt der Baukasten mit X-Ray-Modus als Signatur.
---

# Felix Modern UI (Claude-Look, modern, für Apps, Websites und Portfolios)

*English in short: builds UIs, websites and portfolios that look like the Claude app (warm neutral dark, serif titles over sans UI, no-shadow cards, one light primary button, Lucide line icons, calm iOS-style motion with bottom sheets and springs). Use it for any UI task unless another style is requested. Light theme via `data-theme="light"`; change the brand color with `--color-accent-brand`. If the user says "make it modern", also load `modern.css` and set `data-style="modern"` (Geist, floating prompt panel, stage with scrim, pill CTA, 1px loader line, no bounce).*

Referenz ist die Oberfläche der Claude-App. Der Skill gilt aber für jede UI: Chat, Dashboard, Landingpage, Settings, Editor, Tool. Dann bleiben Flächenstufen, Radien, Typo-Paarung, Icons und Bewegung gleich, nur Inhalt und Layout ändern sich.

## Bausteine

| Datei | Inhalt |
|---|---|
| `assets/tokens.css` | alle Variablen, Dark (Standard) und Light (`data-theme="light"`), Touch-Größen, Reduced-Motion |
| `assets/motion.css` | Keyframes und Klassen: rise, fade, pop, pulse, stagger, Lade-Punkte, Streaming, Skeleton, Menü, Feder-Druck (`.pressable`), Aufspringen von unten, iOS-Push-Ansichten |
| `assets/modern.css` | Stil-Variante „modern“: Overrides unter `data-style="modern"` plus Bausteine (Prompt-Panel, Bühne, Sticky-CTA, Ladelinie, Tooltips, Dialog) |
| `assets/site.css` | Bausteine für normale Websites: Kopfzeile, Hero, Merkmale, Preise, FAQ, Formular, Fußzeile, Artikel, Einblenden beim Scrollen |
| `assets/portfolio.css` | Portfolio-Baukasten: Spotlight-Punktraster, großer Name mit Serif-Akzent, Projektindex, X-Ray-Modus |
| `assets/loaders.css`, `assets/preloader.js` | Loader (Ring, Balken, Stern, Skeleton, Fortschritt, Button-Zustand, Schritte, Bild-Platzhalter) und Vollbild-Preloader mit echtem Zähler |
| `assets/upload-panel.css`, `assets/upload-panel.js` | Upload-Fenster unten rechts: Schritt-Liste je Datei, Gesamtprozent, geschätzte Restzeit, Fehler, Erneut versuchen, Abbrechen; `UploadPanel.uploadFiles()` für echte XHR-Uploads |
| `assets/effects.css`, `assets/effects.js` | Eintritts-Animationen, Text-Maske, Zahlen-Ticker, Hover, Marquee, Schalter, Scroll-Fortschritt, Kreis-Reveal beim Theme-Wechsel |
| `dist/` | **Paket zum direkten Einbinden**: `felix-ui.css` (Kern: Tokens, Bewegung, Komponenten, Modern, Website, Loader, Effekte) plus `.min.css`, `felix-ui.js` (Sheet, Effekte, Preloader), optional `felix-ui-app.css` und `felix-ui-portfolio.css`, und das schlanke Loader-Paket `felix-loaders.css` + `felix-loaders.js` (nur Loader, Preloader, Effekte, 34 Tokens). Neu bauen mit `scripts/build_dist.py` |
| `assets/components.css` | Button, Chip, Badge, Card, Input, NavItem, Segment, Sheet, Menu, Tile, Tooltip, Toast, Tabelle, Kennzahl, `.icon` |
| `assets/sheet.js` | gestengesteuertes Bottom-Sheet im iOS-Stil: Finger-Tracking, Detents, Wischgeschwindigkeit, Gummiband, unterbrechbar, Fokus-Handling |
| `assets/app-shell.css` | Sidebar, Hauptbereich, Composer, Nachrichten, Artefakt-Panel, Responsive |
| `assets/icons.svg` | Lucide-Sprite (43 Icons), IDs wie `#i-plus`, `#i-arrow-up` |
| `assets/templates/chat.src.html` | fertige Chat-Oberfläche mit allen Animationen, auf dem Handy mit Bottom-Sheet (Startpunkt für Chat-UIs) |
| `assets/templates/catalog.src.html` | Komponenten-Katalog mit Flächenstufen und Hell/Dunkel-Umschalter, zum Testen von Änderungen an Tokens und Komponenten |
| `assets/templates/modern.src.html` | Landing mit Bühne, Sticky-CTA, schwebendem Prompt-Panel, Optionen, Modell-Menü, Ladelinie, Fehlerzeile, Verlauf-Sheet, Upgrade-Dialog |
| `assets/templates/site.src.html` | komplette Standard-Website mit SEO-Kopf, Menü-Sheet, Preisen, FAQ, Formular mit Prüfung, Hell/Dunkel |
| `assets/templates/portfolio.src.html` | Dark-Portfolio mit X-Ray-Inspektor, Spotlight, Projektindex, Fallstudien-Sheets, Jetzt-Leiste |
| `assets/templates/upload.src.html` | Demo für Datei-Upload mit Ablagefläche und Upload-Fenster (simuliert) |
| `assets/templates/loaders.src.html` | Schaufenster aller Loader und Effekte zum Ansehen und Kopieren |
| `assets/templates/error.src.html` | 404-Seite (Fehler- und Leerzustände nach `references/playbook.md`) |
| `assets/templates/sheet.src.html` | kleinstes Beispiel für ein Bottom-Sheet mit zwei Detents und zurückweichender Seite |
| `scripts/bundle.py` | setzt die CSS-Dateien und das Sprite in eine Vorlage ein, ergibt eine einzelne HTML-Datei |
| `scripts/check_style.py` | prüft eine fertige Datei gegen die harten Regeln |
| `scripts/build_dist.py` | baut das Paket in `dist/` |
| `scripts/gen_spec.py` | erzeugt `references/css-values.md` aus den echten CSS-Dateien (Tokens gelesen, Komponenten im Browser gemessen) |
| `scripts/check_tokens.py` | findet undefinierte CSS-Variablen und ungenutzte Tokens |
| `scripts/contrast.py` | berechnet WCAG-Kontraste der Token-Paare für Dark und Light |
| `references/patterns.md` | Layouts für Dashboard, Landingpage, Pläne, Settings, Formulare, Leer- und Ladezustände |
| `references/css-values.md` | **exakte CSS-Werte**: alle Tokens (Dark, Light, Modern), gemessene Komponenten-Maße, wörtliche Regeln und Keyframes |
| `references/playbook.md` | Anti-Muster, Microcopy (Deutsch/Englisch, Formate), Ansprache des Agenten, Qualitätsrunde |
| `references/upload-panel.md` | Upload-Fenster: Verhalten, API, Restzeit-Berechnung, Regeln (Einbau-Prompt: `UPLOAD-PANEL-INTEGRATION.md` im Skill-Stamm) |
| `references/loaders-integration.md` | Einbau-Anleitung der Loader für Coding-Agenten: Rezepte zum Kopieren, Token-Liste, Svelte-Hinweise (zu `dist/felix-loaders.css/.js`) |
| `references/loaders.md` | welcher Loader wann, Timing-Regeln, Preloader einbauen, Effekte-Katalog, Dauer-Klassen |
| `references/website.md` | Aufbau, SEO, Formulare, Bilder, Rechtliches und Blog/Doku für normale Websites |
| `references/portfolio.md` | Signatur X-Ray, Regeln für „unique“, alternative Signaturen, Rückfälle |
| `references/modern-style.md` | Was „modern“ ist, Vergleichstabelle Claude/Modern, Ablauf, Entscheidungen, Variablen-Übersetzung aus dem Nutzer-Projekt |
| `references/accessibility.md` | gemessene Kontraste, Einsatzgrenzen pro Textfarbe, Pflichtliste |
| `references/motion.md` | Bewegungs-Rezepte mit Dauer, Auslöser und JS-Snippets |
| `references/icons.md` | Lucide: Einbinden, Größen, Zuordnung Konzept zu Icon-Name, fehlende Icons |
| `references/design-system.md` | gemessene Werte und Begründungen aus den Screenshots |

## Welcher Typ, welcher Stil, welcher Startpunkt

| Aufgabe | Stil | Startpunkt |
|---|---|---|
| Chat, KI-Assistent, Tool | Claude | `chat.src.html`, `app-shell.css` |
| App mit Prompt-Eingabe, Generator, Produkt-Landing | Modern | `modern.src.html` |
| Normale Website (Firma, Landingpage, Blog, Doku) | Claude, bei „modern“ Modern | `site.src.html`, `references/website.md` |
| Portfolio | Modern, Dark, mit Signatur | `portfolio.src.html`, `references/portfolio.md` |
| Dashboard, Einstellungen, Formulare | Claude (bei „modern“ Modern) | `references/patterns.md`, `components.css` |

## Workflow

1. **Startpunkt wählen** (Tabelle oben) und die Vorlage anpassen. Ohne passende Vorlage: ein eigenes HTML-Gerüst mit den Platzhaltern `/*@inline tokens.css*/`, `/*@inline motion.css*/`, `/*@inline components.css*/` im `<style>` und `<!--@inline icons.svg-->` im `<body>`. Layoutmuster dafür stehen in `references/patterns.md`.
2. **Bündeln oder Paket nutzen.** In einem bestehenden Projekt genügt `dist/felix-ui.css` plus `dist/felix-ui.js` und das Sprite aus `assets/icons.svg`. Für einzelne HTML-Dateien erzeugt `python scripts/bundle.py <vorlage> <ausgabe.html>` eine eigenständige Datei. Bei Frameworks (React, Vue, Svelte) die CSS-Dateien importieren und das Sprite einmal ins Layout setzen. Danach nur noch `var(--…)` im eigenen Code. Der Grund: Nur so bleibt ein späterer Wechsel auf Light oder auf eine Markenfarbe eine Zeile statt einer Suche.
3. **Bauen** mit den Kernregeln unten. Für exakte Maße (Höhen, Abstände, Radien, Kurven) `references/css-values.md` nachschlagen, nicht schätzen. Anti-Muster und Microcopy stehen in `references/playbook.md`. Vorhandene Komponenten zuerst prüfen, bevor neue entstehen.
4. **Prüfen.** `python scripts/check_style.py <datei>` ausführen und alle Meldungen beheben. Nach Änderungen an Tokens oder Komponenten zusätzlich `check_tokens.py` und `contrast.py` laufen lassen und den Katalog in Dark und Light ansehen. Danach die Checkliste unten durchgehen.

## Zwei Stile: Claude (Standard) und Modern

- **Claude** ist der Standard (Serif-Titel, ruhiges Chat-Layout, Feder-Gesten).
- **Modern** schaltet der Nutzer mit Worten wie „mach es modern“, „moderner“, „sleek“, „wie mein Frontend“ ein. Dann `modern.css` nach `components.css` einbinden und `<html data-style="modern">` setzen. Die Claude-Struktur bleibt (Tokens, Lucide, Gesten, Barrierefreiheit), dazu kommen Geist, tieferes neutrales Grau, Pill-Buttons, schwebende Panels mit weichem Schatten, Bühne mit abgedunkeltem Produktbild, Sticky-CTA, 1-px-Ladelinie und Bewegung ohne Überschwingen.
- Beide Stile lassen sich im Katalog (`catalog.src.html`, Knopf „Stil“) direkt vergleichen. Details und Entscheidungen bei Widersprüchen: `references/modern-style.md`.
- Die Kernregeln unten beschreiben den Claude-Stil. Im Modern-Stil weichen nur Regel 3 (Geist statt Serif, Titel 600), Regel 1 (zusätzlich Schatten an schwebenden Elementen) und Regel 10 (kein Bounce, 140/240/320 ms) ab.

## Die Kernregeln

1. **Tiefe durch Flächenstufen, nicht durch Schatten.** Von tief nach hoch: `bg-deep` → `bg-canvas` → `bg-base` (Seite) → `bg-sidebar` (Karten, Seitenleiste) → `bg-panel` (Sheets, Seitenpanel) → `bg-elevated` (Inputs, Menüs) → `bg-active` (aktive Einträge). Schatten nur bei Sheets und Menüs.
2. **Neutrales Grau ohne Blaustich.** Keine Tailwind-Slate/Zinc/Blue-Grays erfinden, nur Tokens nutzen.
3. **Serif für Titel, Sans für UI.** `h1`/`h2` in `--font-display`, Gewicht 400, Satzschreibweise, bei Hero- und Seitentiteln zentriert. Lesetext von KI-Antworten ebenfalls Serif. UI-Text 16 px, Sekundärtext 14 px in `--color-text-secondary`.
4. **Ein heller Primär-Button pro Ansicht** (`--color-button-primary`, im Light-Theme dunkel). Sekundär: `bg-active`. Der Senden-Button im Composer ist der Primär-Button der Chat-Ansicht, weitere Aktionen daneben sind sekundär oder ghost. Kein farbiger Primär-Button, Blau nur für Links und Upgrade-Hinweise.
5. **Radien gestaffelt, nie scharf.** Controls `sm`/`md`, Eingaben und Menüs `lg`, Karten `xl`, Hüllen `2xl`, Chips und Badges `pill`.
6. **Linien statt Rahmenboxen.** Trennlinien 1 px `--color-border-subtle`. Sichtbare Rahmen nur an Chips und Eingaben.
7. **Lucide-Icons, immer.** Linien-Icons aus Lucide über `<svg class="icon"><use href="#i-…"/></svg>`, 20 px, Strich `--icon-stroke`, Farbe `currentColor`. Keine gefüllten Icons, keine Emojis, keine zweite Icon-Familie. Details in `references/icons.md`.
8. **Farbe sparsam.** `--color-accent-brand` (Standard Orange) nur für Logo, Lade-Punkte und Streaming-Punkt. Kategorie-Kacheln dürfen die Typfarben tragen. Für ein fremdes Produkt wird nur `--color-accent-brand` überschrieben, sonst nichts.
9. **Viel Negativraum.** Inhalt zentriert in `--size-content-max` (Chat `--size-chat-max`), Kartenpadding 24–32 px, Abschnitte 48–64 px. Im Hero-Zustand sitzt das Eingabefeld leicht unter der Mitte.
10. **Ruhige, körperliche Bewegung (Apple-Gefühl).** Zwei Klassen: *Zustandswechsel* (Farbe, Opacity, Menüs) 120–300 ms mit `--ease-out`. *Bewegte Ebenen* (Sheets, Drawer, Panels, Push-Ansichten) 500 ms mit `--ease-sheet` (iOS-Kurve) oder `--ease-spring` (leichtes Überschwingen). Gesten gehören dazu: Was man mit dem Finger bewegen kann, folgt ihm 1:1 ohne Transition, rastet beim Loslassen mit Schwung ein (Wischgeschwindigkeit zählt) und ist jederzeit unterbrechbar. Nur Opacity, `transform` und kleine Skalierung animieren. Dritte Klasse „inszeniert“ (Preloader-Zeichnung 700 ms, Zähler 1,4 s) nur über `--duration-draw`/`--duration-count`. Schleifen nur für Laden, Streaming und ruhige Dekoration. `prefers-reduced-motion` aus `tokens.css` nie entfernen. Rezepte in `references/motion.md`.

## Animationen auf einen Blick

Einblenden einer Nachricht oder Karte `rise-spring` (von unten, Feder). Lesetext erscheint wortweise (`.w`, alle ~35 ms ein Wort) mit wanderndem Punkt (`.caret`). Warten zeigt `.dots` plus Statuszeile mit Sekundenzähler. Buttons und Chips drücken sich ein (`scale .96`, 80 ms) und federn zurück. **Bottom-Sheets** kommen von unten (`Sheet` aus `sheet.js`), lassen sich am Griff ziehen, rasten an Detents ein (zum Beispiel halb und voll), schließen per Wisch nach unten, und die Seite dahinter weicht zurück (`.behind`: Skalierung 0,94 und runde Ecken, gekoppelt über `--sheet-p`). Sidebars und Panels gleiten mit `--ease-sheet`. Menüs blenden mit 4 px Versatz ein (150 ms). Ladebereiche sind erst Skeleton und blenden dann gestaffelt ein (`.rv` mit `--i`). Layoutwechsel (Hero zu Chat) laufen über `flex-grow` und `max-height`, nie über Sprünge. Auf dem Handy wird alles Modale zum Bottom-Sheet, auf dem Desktop zum Panel oder Popover.

## Loader und Effekte

Beim Laden, Warten oder Auftreten von Inhalten immer zuerst `references/loaders.md` lesen: Skeleton für Inhalte, Ring für Aktionen, Balken bei bekannter Dauer, Linie am Rand für Hintergrundabrufe, Preloader nur für schwere Seiten und Portfolios (einmal pro Sitzung, echter Zähler). Loader haben immer einen Text für Screenreader und stehen bei reduzierter Bewegung still.

Datei-Uploads (Cloud, Medien, Dokumente) bekommen immer das Upload-Fenster (`references/upload-panel.md`), nie einen Vollbild-Spinner oder einzelne Balken pro Seite.

## Bottom-Sheet einbauen

```html
<main id="app">…</main>                                   <!-- bekommt .behind automatisch -->
<div class="sheet-scrim" id="scrim"></div>
<section class="sheet" id="sheet" aria-labelledby="t">
  <div class="sheet__grab" id="grab"><h2 class="sheet__title" id="t">Titel</h2></div>
  <div class="sheet__body">…</div>
</section>
<script>const sheet = new Sheet(document.getElementById('sheet'),
  { detents: [.5, 1], handle: document.getElementById('grab'), scrim: document.getElementById('scrim'), behind: document.getElementById('app') });
  sheet.open();</script>
```

Regeln: `behind` darf keine `position: fixed`-Kinder enthalten (Transform bricht fixierte Elemente), der Griff-Bereich enthält Buttons nur, wenn sie wirklich klicken sollen (sie werden vom Ziehen ausgenommen), Sheet-Inhalt scrollt in `.sheet__body`. Fertig verdrahtet in `assets/templates/sheet.src.html` und im Artefakt-Panel von `chat.src.html`.

## Andere UIs und eigene Marke

- **Layout wechseln, Stil behalten.** Dashboard, Landingpage, Pläne und Settings stehen in `references/patterns.md`. Jede Seite hat einen Serif-Titel, großzügigen Abstand, Karten auf `bg-sidebar` und einen hellen Primär-Button.
- **Eigene Akzentfarbe.** `:root { --color-accent-brand: <farbe>; }` reicht. Primär-Buttons bleiben hell, die Marke färbt nur Logo, Lade-Zustände und Hervorhebungen.
- **Light-Theme.** `<html data-theme="light">` schaltet auf warme helle Flächen um (Umschalter-Beispiel in `chat.src.html` und `catalog.src.html`, gespeichert per `localStorage` mit try/catch). Orange und Status-Farben sind dort abgedunkelt, Kategorie-Kacheln bleiben dunkel. Die Werte sind Empfehlungen aus der Markenpalette und nicht aus Screenshots gemessen. Wenn der Nutzer nichts sagt, bleibt es Dark, weil der Stil dafür gemessen wurde.
- **Schriften.** `Source Serif 4` und `Inter` über Google Fonts laden, immer mit den Fallbacks aus den Tokens. Es sind Ersatzschriften, die Originalschriften sind unbekannt.

## Accessibility (verbindlich)

- Sichtbarer `:focus-visible`-Ring (2 px, `--color-focus-ring`). Bei versteckten Inputs den Ring auf den Container legen (`:has(textarea:focus-visible)`).
- Icon-Buttons haben `aria-label`. Aktive Nav-Einträge `aria-current="page"`. Segmente `role="tablist"` oder `radiogroup`. Nachrichtenverlauf `role="log"`.
- Touch-Ziele mindestens 44 × 44 px (`--size-touch`), `--size-control` wächst auf Touch-Geräten automatisch mit.
- Text nie dunkler als `--color-text-secondary` auf `--color-bg-base`. `--color-text-tertiary` nur für Disabled und Deko (3,5:1, siehe `references/accessibility.md`).
- Geschlossene Panels und Overlays nicht fokussierbar halten (`inert` oder `visibility:hidden`).

## Ehrlichkeit über die Datenlage

Werte in `references/design-system.md` sind mit **[M]** gemessen, **[B]** beobachtet, **[S]** geschätzt, **[E]** Empfehlung markiert. Hover-, Animations-, Breakpoint- und Light-Werte sind Empfehlungen, keine Originale. Behandle sie als Default und nenne sie nie "Original". Das Lucide-Sprite wurde offline übertragen: Wenn ein Icon komisch aussieht, den Pfad gegen lucide.dev prüfen.

## Abgabe-Checkliste

- [ ] `check_style.py` meldet keine Verstöße
- [ ] Seitentitel in Serif (Claude) oder Geist 600 (Modern), Rest in Sans
- [ ] Höchstens ein heller Primär-Button pro Ansicht
- [ ] Karten ohne Schatten, mit Radius `xl` (Schatten nur an schwebenden Elementen)
- [ ] Alle Icons aus Lucide, keine Emojis
- [ ] Alle interaktiven Elemente haben Focus-Stil und sind per Tastatur erreichbar
- [ ] Zustandswechsel höchstens 300 ms, bewegte Ebenen über `--duration-sheet`/`--duration-spring` (nie fest verdrahtet), Reduced-Motion aktiv
- [ ] Modale Dinge auf dem Handy sind Bottom-Sheets mit Wisch-zum-Schließen
- [ ] Layout funktioniert bei 390 px Breite ohne horizontales Scrollen
