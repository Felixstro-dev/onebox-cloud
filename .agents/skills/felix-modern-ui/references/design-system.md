# Design System: Referenz-Web-App (Dark Mode, iPad-Querformat)

> **Hinweis zu v2:** Dieses Dokument enthält die gemessenen Rohdaten. Die gültigen Regeln, Tokens und Komponenten stehen in `SKILL.md` und `assets/`. Abweichungen zu unten: Icons sind jetzt Lucide (Abschnitt 5.9), Touch-Ziele sind 44 px (`--size-touch`, `--size-control` wächst auf Touch-Geräten mit), und die Token-Liste in Abschnitt 9 ist nur noch Referenz, maßgeblich ist `assets/tokens.css`.


**Quelle:** 9 Screenshots (iPad, Safari, ca. 2360 × 1640 px, Dark Mode, deutsche Oberfläche, Free-Plan).
**Gezeigte Ansichten:** Neuer Chat mit Profilmenü, Artefakte-Übersicht, Chat mit Slides-Artefakt (Editor, Zoom-Menü, Einfügen-Menü, Ladezustand), Apps-Seite, Pläne-Seite.

## Kennzeichnung der Aussagen

| Marker | Bedeutung |
|---|---|
| **[M]** | Gemessen: Pixelwert direkt aus dem Screenshot ausgelesen (Anti-Aliasing und Display-Rendering können ±2 Stufen abweichen) |
| **[B]** | Beobachtet: sichtbar im Screenshot, aber nicht numerisch messbar |
| **[S]** | Schätzung aus visuellem Eindruck oder gängiger Praxis |
| **[E]** | Empfehlung für die Umsetzung, nicht Teil der Vorlage |

**Grenzen:** Es lag nur statisches Bildmaterial vor. **Es wurde nichts interaktiv getestet.** Animationen, Hover-Zustände, Dauer und Easing sind aus Screenshots nicht ableitbar. Wo sie unten auftauchen, sind sie als Empfehlung gekennzeichnet. Schriftfamilien sind visuell eingeordnet, nicht aus dem CSS ausgelesen. Breakpoints sind nicht beobachtbar, da nur ein Viewport vorliegt.

---

## 1. Allgemeine Designanalyse

**Gesamteindruck [B]:** Ruhige, warme, redaktionell wirkende Dark-UI. Dunkle Neutralgrau-Flächen ohne Blaustich, viel Negativraum, wenig Dekor. Die Seitentitel sind in einer Serifenschrift gesetzt, die gesamte Bedien-UI in einer neutralen Grotesk. Das erzeugt den Kontrast „Buch/Magazin trifft Werkzeug“.

**Stil [B]:** Minimalistisch mit leichter editorialer Note. Kein Glassmorphism, kein Neumorphism, kaum Schatten. Tiefe entsteht über Helligkeitsstufen der Flächen (Layering), nicht über Effekte.

**Visuelle Hierarchie [B]:**
1. Große Serif-Überschrift („Lass uns tüfteln“, „Pläne, die mit dir wachsen“, „Artefakte“) in Weiß.
2. Zentrales Eingabefeld bzw. Hauptinhalt (hellere Fläche `#303030`).
3. Helle Primär-Buttons (`#efefef`) als einzige hochkontrastige Flächen.
4. Sekundärtext in gedämpftem Grau, Navigation in Weiß mit Linien-Icons.
5. Einzige Farbakzente: Marken-Orange (Logo-Stern), Blau (Links, Upgrade, Laden-Button), farbige Kacheln der Artefakt-Typen.

**Zielgruppe / Marke [S]:** Wissensarbeiter, Studierende, Entwickler. Die Wirkung ist vertrauenswürdig, zurückhaltend, intellektuell. Konsistenz über alle Screens hoch: gleiche Grautreppe, gleiche Radien, gleiche Icon-Familie.

---

## 2. Farbpalette

### 2.1 Neutrale Flächen (Dark Mode)

| Name | HEX | Verwendung | Quelle |
|---|---|---|---|
| `bg-deep` | `#0e0e0e` | Tiefster Hintergrund hinter Slide-Canvas, Overlay-Abdunklung | [M] |
| `bg-canvas` | `#141414` | Editor-/Canvas-Hintergrund | [M] |
| `bg-base` | `#191919` | Haupt-Seitenhintergrund, Chat-Bereich, Seitenköpfe | [M] |
| `bg-topbar` | `#1d1d1d` | Header-Leiste im Chat | [M] |
| `bg-sidebar` | `#1f1f1f` | Seitenleiste, Karten auf Pläne-/Apps-Seite, Inhaltskarten | [M] |
| `bg-panel` | `#20201f` | Rechtes Artefakt-Panel, Bottom-Sheets (leicht warm) | [M] |
| `bg-segment` | `#252525` | Hintergrund von Segment-Controls | [M] |
| `bg-elevated` | `#303030` | Eingabefeld, Popup-Menüs, Chat-Bubbles | [M] |
| `bg-hover-active` | `#404040` | Aktiver Navigationseintrag, sekundärer Button („Kostenlos nutzen“) | [M] |
| `bg-segment-active` | `#3d3d3d` | Aktives Segment („Einzelperson“) | [M] |
| `border-subtle` | `#282828` | Trennlinien innerhalb von Karten | [M] |
| `border-default` | `#313131` | Rahmen um Eingabefeld (kaum sichtbar) | [M] |

### 2.2 Text

| Name | HEX | Verwendung | Quelle |
|---|---|---|---|
| `text-primary` | `#f1f1f1` | Überschriften, Navigation, Fließtext | [M] (Näherung) |
| `text-secondary` | `#9a9a9a` | Beschreibungen, Platzhalter, Metadaten („vor 4 m“) | [S] |
| `text-tertiary` | `#6f6f6f` | Deaktiviert, Footer-Hinweise (Zoom-Menü ausgegraut) | [S] |
| `text-on-light` | `#191919` | Text auf hellen Buttons | [S] |

### 2.3 Akzente und Status

| Name | HEX | Verwendung | Quelle |
|---|---|---|---|
| `button-light` | `#efefef` | Primär-Button (Pro Plan holen, Exportieren), aktiver Chat/Cowork-Toggle (`#f2f2f2`) | [M] |
| `accent-blue-solid` | `#0a61a3` | „Laden“-Button im App-Banner | [M] |
| `accent-blue-link` | `#4a9eff` | Links, „Upgrade“, „17 % sparen“ (angenähert; gemessen `#639ede` an Antialiasing-Kante) | [S] |
| `accent-orange` | `#d97757` | Marken-Stern, Logo-Orange | [S] (aus Brand-Wissen und Sichtprüfung) |
| `tile-doc` | `#0e3d7e` | Typ-Kachel „Dokumente“ | [M] |
| `tile-slides` | `#632508` | Typ-Kachel „Folien“, Slides-Kartenkopf (`#4b2310`) | [M] |
| `tile-design` | `#3d2987` | Typ-Kachel „Design“ | [M] |
| `tooltip-amber` | `#9a5b00` | Onboarding-Tooltip „Comment on any slide…“ (gemessen im Bereich `#a27322`/Rand) | [M]/[S] |
| `bubble-purple` | `#3a2684` | Violette Fläche im Apps-Teaser | [M] |

### 2.4 Slides-Inhalt (vom Nutzer erzeugtes Artefakt, nicht UI)

| Name | HEX | Verwendung | Quelle |
|---|---|---|---|
| `slide-beige-light` | `#f3ebdd` | Inhaltsfolie | [M] |
| `slide-beige-title` | `#baae9b` | Titelfolie | [M] |
| `slide-brown-text` | `#4a2c1a` | Überschrift auf Folie | [S] |

### 2.5 Zustände

Im Screenshot nicht eindeutig sichtbar: Hover, Focus, Disabled (außer ausgegrautes Zoom-Menü und Send-Button), Success, Warning, Error. Siehe Empfehlungen in Abschnitt 9.

**Kontrast-Hinweise [E, berechnet]:** `#f1f1f1` auf `#191919` ≈ 15:1 (AAA). `#9a9a9a` auf `#191919` ≈ 6,4:1 (AA). `#191919` auf `#efefef` ≈ 14:1. Sehr dunkles Grau `#6f6f6f` auf `#191919` ≈ 3,4:1, nur für Deko oder Disabled geeignet.

```css
:root {
  --color-bg-deep: #0e0e0e;
  --color-bg-canvas: #141414;
  --color-bg-base: #191919;
  --color-bg-topbar: #1d1d1d;
  --color-bg-sidebar: #1f1f1f;
  --color-bg-panel: #20201f;
  --color-bg-segment: #252525;
  --color-bg-elevated: #303030;
  --color-bg-active: #404040;
  --color-border-subtle: #282828;
  --color-border-default: #313131;
  --color-text-primary: #f1f1f1;
  --color-text-secondary: #9a9a9a;
  --color-text-tertiary: #6f6f6f;
  --color-button-light: #efefef;
  --color-text-on-light: #191919;
  --color-accent-orange: #d97757;
  --color-accent-blue: #4a9eff;
  --color-accent-blue-solid: #0a61a3;
  --color-tile-doc: #0e3d7e;
  --color-tile-slides: #632508;
  --color-tile-design: #3d2987;
}
```

---

## 3. Typografie

**Familien [B/S]:**
- **Display/Headlines:** Serifenschrift mit leicht humanistischem Charakter und mittlerem Kontrast, vergleichbar mit Tiempos, Source Serif oder Newsreader. Ersatz: `"Source Serif 4", Georgia, serif`.
- **UI/Fließtext:** Neutrale Grotesk, geometrisch-humanistisch, ähnlich Styrene/Inter. Ersatz: `Inter, -apple-system, "SF Pro Text", system-ui, sans-serif`.
- **Chat-Antworten [B]:** Im Screenshot 7/8 als Serif gesetzt (Lesetext der KI-Antwort), Nutzereingaben und UI in Sans.
- **Code-Chips [B]:** Monospace (`ui-monospace, "SF Mono", Menlo`) mit hellerer Hinterlegung `#303030`.

**Typografieskala (px, gemessen am 2360-px-Screenshot, bei 1:1 Bezug auf CSS-Pixel dividiert durch ca. 2 für Retina) [S]:**

| Rolle | Größe | Gewicht | Zeilenhöhe | Beispiel |
|---|---|---|---|---|
| Hero-Titel | 40–44 px | 400 | 1,15 | „Lass uns tüfteln“ |
| Seitentitel | 32–36 px | 400 | 1,2 | „Pläne, die mit dir wachsen“, „Artefakte“ |
| Planname | 22 px | 500 | 1,2 | „Free“, „Pro“, „Max“ |
| Preis | 40 px | 400 | 1 | „18 €“ |
| Body-Serif (Chat) | 17–18 px | 400 | 1,55 | Antworttext |
| UI-Body | 15–16 px | 400 | 1,4 | Nav-Einträge, Buttons |
| Sekundär | 14 px | 400 | 1,4 | Beschreibungen, Planuntertitel |
| Klein/Meta | 12–13 px | 400 | 1,3 | „In-App-Käufe“, Footer-Hinweise |

**Buchstabenabstand [S]:** Standard, bei Serif-Headlines leicht negativ (−0,01 em).
**Schreibweise [B]:** Satzschreibweise (kein Versalien-Stil), Menüpunkte einwortig (Neu, Suchen, Projekte).
**Ausrichtung [B]:** Hero- und Seitentitel zentriert; Navigation, Karteninhalte und Listen linksbündig.

```css
:root {
  --font-display: "Source Serif 4", Georgia, "Times New Roman", serif;
  --font-ui: Inter, -apple-system, "SF Pro Text", system-ui, sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, monospace;

  --text-hero: clamp(2rem, 1.4rem + 2vw, 2.75rem);
  --text-title: clamp(1.75rem, 1.3rem + 1.5vw, 2.25rem);
  --text-lg: 1.375rem;
  --text-base: 1rem;
  --text-sm: 0.875rem;
  --text-xs: 0.75rem;

  --weight-regular: 400;
  --weight-medium: 500;
  --leading-tight: 1.15;
  --leading-normal: 1.4;
  --leading-reading: 1.55;
}
```

---

## 4. Layout und Aufbau

### 4.1 App-Shell [B]

```
┌──────────────┬────────────────────────────────────────────┐
│  Sidebar     │  Hauptbereich                              │
│  ~240–280px  │  (zentrierter Inhalt, max ~700–900px)      │
│  Logo/Wort   │                                            │
│  Neu         │         ✱ Lass uns tüfteln                 │
│  Suchen      │                                            │
│  Projekte    │      ┌──────────────────────────────┐      │
│  Artefakte   │      │ Wie kann ich dir helfen?     │      │
│  Code        │      │ + [Chat|Cowork] Modell  🎤 ≋ │      │
│  Anpassungen │      └──────────────────────────────┘      │
│  ──────────  │       [Schreiben][Lernen][Code]…           │
│  Chats…      │                                            │
│  ──────────  │                                            │
│  Profil      │                                            │
└──────────────┴────────────────────────────────────────────┘
```

**Chat mit Artefakt (Screens 1, 2, 7–9) [B]:** Drei Spalten: Sidebar (~240 px) | Chat (~360 px, schmal) | Artefakt-Panel (~390 px, mit eigener Toolbar). Das Artefakt-Panel hat Titel-Dropdown, hellen „Exportieren“-Button, Kommentar-Icon, Vollbild- und Schließen-Icon.

**Pläne-Seite [B]:** Eigene Vollseite ohne Sidebar, oben nur Zurück-Pfeil. Drei gleich breite Karten (Free, Pro, Max) im Raster mit ~16 px Gutter. Darüber Serif-Titel und Segment-Control „Einzelperson | Team und Enterprise“.

**Apps-Seite [B]:** Zentrierter Serif-Titel, darunter große Karten (Desktop über volle Breite, darunter zwei halbe Karten Microsoft 365 und Code-Agent). Karten haben doppelten Rand (äußere Hülle + innere Fläche).

### 4.2 Abstände [S, aus Pixelverhältnissen abgeleitet]

| Zweck | Wert |
|---|---|
| Sidebar-Innenabstand horizontal | 16 px |
| Nav-Eintrag Höhe | 36–40 px, Abstand dazwischen 4 px |
| Karten-Innenabstand | 24–32 px |
| Gutter zwischen Karten | 16 px |
| Eingabefeld Innenabstand | 16 px |
| Abschnitt-Abstand (Titel → Inhalt) | 40–64 px |

### 4.3 Fixierte und Overlay-Elemente [B]

- **App-Banner oben** („Store-Banner · Laden“) ist Safari-/OS-Smart-Banner, kein Teil der Web-UI.
- Sidebar und Artefakt-Panel sind fix, der mittlere Bereich scrollt.
- **Bottom-Sheets** im Artefakt-Panel (Einfügen-Menü, Zoom-Menü): Abgerundete obere Ecken (~20 px), Drag-Handle (Strich ~48 × 4 px, mittig), Fläche `#20201f`.
- **Popup-Menü** am Profil (links unten): Fläche `#303030`, Radius ~16 px, Einträge mit Linien-Icon links, Trenner `#404040`.
- **Benachrichtigungs-Karte** über dem Eingabefeld (Screens 8/9): `#303030`, Radius ~16 px, Schließen-X rechts oben, kleiner Button „Benachrichtigen“.

---

## 5. UI-Komponenten

### 5.1 Buttons

| Variante | Fläche | Text | Radius | Höhe | Einsatz |
|---|---|---|---|---|---|
| Primär hell | `#efefef` | `#191919` | ~12 px [S] | ~48 px | „Pro Plan holen“, „Max-Plan holen“, „Exportieren“ |
| Sekundär | `#404040` | `#f1f1f1` | ~12 px | ~48 px | „Kostenlos nutzen“ |
| Blau solid | `#0a61a3` | Weiß | Pille (999 px) | ~44 px | „Laden“ (OS-Banner) |
| Ghost/Icon | transparent | Icon `#f1f1f1` | 12 px | 40 px | Toolbar-Icons, Schließen |
| Chip/Pille | `#1f1f1f`/`#303030`, 1 px Rand | `#f1f1f1` | Pille | 36–40 px | „Schreiben“, „Lernen“, „Code“, „Alltag“, „Empfehlungen“ (mit Linien-Icon links) |

Zustände: Hover/Active/Focus **nicht beobachtet**. Disabled **[B]**: Toolbar-Icons und Zoom-Kontrolle erscheinen im Ladezustand ausgegraut (Screens 8/9).

### 5.2 Eingabefeld (Chat) [B]
Fläche `#303030`, Radius ~20 px, großzügiger Innenabstand. Platzhalter `#9a9a9a`. Untere Leiste: „+“ links, Segment „Chat | Cowork“ (aktiv = `#f2f2f2` mit dunklem Text im Screenshot 6 wirkt als helles Segment, inaktiv transparent), rechts Modellname („Sonnet 5.5 Mittel“), Mikrofon mit Dropdown, Waveform-Button. Im Chat-Zustand statt Waveform ein Stopp-Quadrat und ein Senden-Pfeil (grau gedimmt).

### 5.3 Navigation (Sidebar) [B]
Einträge: Icon (Linie, ~20 px) + Label 16 px. Aktiv: Fläche `#404040`, Radius ~10 px, volle Breite. Chat-Liste darunter mit kleinem Kreis-Marker statt Icon, abgeschnittener Titel mit Ellipsis und Drei-Punkte-Menü beim aktiven Eintrag. Unten: Avatar (Kreis mit Initial, grau), Name, „Free“ in Grau, Chevron.
Abschnittsüberschrift „Chats und Aufgaben“ mit Dreieck-Chevron und Filter-Icon rechts. „Upgrade“-Pille neben „Code“ in Blau mit sehr dunkler Hinterlegung.

### 5.4 Karten
- **Plankarte [B]:** Fläche `#1f1f1f`, Radius ~24 px, kein sichtbarer Schatten, Trennlinie `#282828` zwischen Kopf/Preis und Feature-Liste. Aufbau: Illustration (Linien-Pflanze wachsender Komplexität: 1, 3, 5 Knospen), Planname, Untertitel, Preis, CTA, Kleingedrucktes zentriert, Haken-Liste.
- **Artefakt-Karte [B]:** Radius ~20 px, Vorschau-Bereich oben in Typfarbe (hier `#4b2310`) mit abstrakter Mockup-Karte, unten Typ-Icon-Kachel (`#352720`) + Titel + „Geöffnet: vor 4 m“. Auf der Karte oben rechts zwei Icon-Buttons (Drei-Punkte, Pin) mit `#111`-Fläche.
- **Typ-Kachel „Etwas Neues erstellen“ [B]:** Quadratisch-querformatig (~280 × 200), Radius ~16 px, Vollfarbe (Blau/Braun-Orange/Violett), zentriertes Linien-Icon in hellem Ton, handgezeichnete Strichmuster als Textur, darunter Label + „Neu“-Badge (Pille, blauer Text, blauer Rand, transparent).
- **Apps-Karte [B]:** Äußere Hülle `#1f1f1f` mit Radius ~32 px, innere Fläche `#191919` mit Radius ~24 px, Rastermuster (feines Grid) im Illustrationsbereich, Sprechblasen mit 1 px Rand und Radius ~20 px.

### 5.5 Segment-Control [B]
Container `#252525`, Radius ~12 px; aktives Segment `#3d3d3d`, Radius ~10 px. Zusätzlich Toggle „Monatlich | Jährlich · 17 % sparen“ in dunklem Container (`#111`) mit Pille, „17 % sparen“ in Blau.

### 5.6 Toolbar im Slides-Artefakt [B]
Zwei schwebende, abgerundete Leisten (Radius ~16 px, Rand 1 px `#303030`, Fläche `#191919`): links „+ ▾“ (Element einfügen), rechts Download, Play, Seitenformat-Icon (aktiv = blau hinterlegt), Zoom „23 % ▾“. Unten schwebende Pille mit „‹ 7 / 8 ›“, Buch- und Präsentations-Icon, oder „Add slide“ + Präsentations-Icon im leeren Zustand.

### 5.7 Menüs / Sheets [B]
Zeilenbasierte Listen, Zeilenhöhe ~64 px, Icon links (Linie), Label 18 px, Trennlinie zwischen Gruppen (z. B. zwischen Text/Bild/Tabelle und Formen). Zoom-Menü: Liste mit Prozentwerten (25–200 %), aktueller Wert als Gruppenüberschrift „Now 23%“.

### 5.8 Tooltip / Onboarding [B]
Amberfarbene Pille (`~#9a5b00`), Radius ~16 px, weißer Text 16 px, mit Cursor-Pfeil-Icon links oben darüber: „Comment on any slide, and die KI can revise it.“

### 5.9 Icons [B]
**Umsetzung: Lucide** (siehe `references/icons.md`). Beobachtet: Durchgängig Linien-Icons, ca. 1,5–2 px Strichstärke, abgerundete Enden, neutrale Silhouetten (Sprechblase, Lupe, Ordner, Code-Klammern, Zahnrad, Globus). Farbe `text-primary`. Illustrationen (Pläne): feine Linienzeichnungen mit Kreisen an Astenden, einfarbig `#f1f1f1`.

---

## 6. Animationen und Mikrointeraktionen

Aus Screenshots lassen sich **keine** Animationsparameter messen. Beobachtbar sind nur Zustände zu einem Zeitpunkt:

| Element | Beobachteter Zustand | Aussagekraft |
|---|---|---|
| Antwort-Ladeanzeige | Drei animiert wirkende Punkte (orange, ungleich groß) vor Statuszeile „Gestaltung der Folien mit Farben und K… 40s ▸“ | Sichtbar ist Laden und Zeitzähler; Bewegung selbst **nicht belegt** |
| Slides-Canvas beim Erzeugen | Grauer leerer Slide-Platzhalter, Toolbar ausgegraut | Skeleton-/Ladezustand [B] |
| Bottom-Sheets | Zwei Höhen sichtbar (halbhoch, dreiviertelhoch) mit Drag-Handle | Hinweis auf ziehbares Sheet; Dauer/Easing unbekannt |
| Onboarding-Tooltip | Erscheint über Canvas | Auslöser und Timing unbekannt |

**Empfehlungen [E, nicht beobachtet]:**

| Element | Trigger | Effekt | Dauer | Easing |
|---|---|---|---|---|
| Buttons | Hover/Press | Fläche +1 Stufe heller; Press `scale(.98)` | 120–150 ms | `ease-out` |
| Nav-Eintrag | Hover | Hintergrund `#303030` | 120 ms | `ease-out` |
| Sheet | Öffnen | `translateY(100%) → 0` | 250 ms | `cubic-bezier(.2,.8,.2,1)` |
| Popup-Menü | Öffnen | Fade + `translateY(4px)` | 150 ms | `ease-out` |
| Lade-Punkte | dauerhaft | Opacity-Puls versetzt | 1,2 s | `ease-in-out` |

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 7. Stilmittel und visuelle Details

- **Border-Radius [S]:** gestaffelt. Kleine Controls 10–12 px, Karten/Menüs 16–24 px, große Hüllen 32 px, Chips und Badges voll rund. Konsistente Verschachtelung (äußerer Radius = innerer + Abstand).
- **Schatten [B]:** praktisch keine. Abgrenzung durch Fläche, 1-px-Linien und Blur-freie Layer. Popup-Menüs mit sehr subtilem Rand statt Schlagschatten.
- **Verläufe/Transparenz [B]:** Kein UI-Verlauf; Slides-Vorschaukarte hat einen weichen Dunkel-Verlauf am unteren Bildrand (Fade nach `#1f1f1f`). Abdunkelung des Canvas hinter Sheets durch Halbtransparenz (Slide `#baae9b` wird zu `#918879`, entspricht ~ 22 % Schwarz-Overlay [M/S]).
- **Texturen [B]:** Typ-Kacheln mit handgezeichneten, grobkörnigen Strichmustern (leicht heller als Kachelfarbe). Apps-Karte mit feinem Rastermuster.
- **Bildsprache [B]:** Weiche Produkt-Mockups, Ordner-/Dokument-Illustrationen im Flat-Stil, Foto-Ausschnitte (Gemüse) in Mini-Browser-Mockup.
- **Negativraum [B]:** Hero-Bereich mit viel Leerraum, Eingabefeld leicht unterhalb der Mitte, Chips darunter. Kein Footer sichtbar.
- **Prägende Merkmale:** Serif-Headlines + Sans-UI, warme Dunkelgrau-Stufen, runde Karten ohne Schatten, helle Primär-Buttons als einziger starker Kontrast, farbige Typkacheln als Farbakzent.

---

## 8. Responsive Design

**Beobachtet [B]:** Nur ein Viewport (iPad quer, ca. 1180 × 820 CSS-px). Dort sind Sidebar, Chat und Artefakt-Panel gleichzeitig sichtbar, der Chat-Titel wird mit Ellipsis gekürzt, Tab- und Plan-Raster dreispaltig.

**Nicht beobachtbar:** Echte Breakpoints, Mobile-Navigation, Umbrüche.

**Empfehlungen [E]:**

| Breakpoint | Verhalten |
|---|---|
| ≥ 1280 px | Drei Spalten (Sidebar / Chat / Artefakt), Plan-Grid 3 Spalten |
| 900–1279 px | Wie iPad-Screenshot: Sidebar 240 px, Artefakt-Panel schmaler |
| 640–899 px | Sidebar als Overlay mit Hamburger, Artefakt-Panel als Vollbild-Sheet, Plan-Grid 1 Spalte |
| < 640 px | Eingabefeld sticky unten, Chips horizontal scrollbar, Hero-Titel `clamp()`-skaliert |

---

## 9. Design Tokens

```css
:root {
  /* Farben: siehe Abschnitt 2 */
  --color-success: #4ade80;      /* [E] */
  --color-warning: #fbbf24;      /* [E] */
  --color-error: #f87171;        /* [E] */
  --color-focus-ring: #4a9eff;   /* [E] */
  --color-overlay: rgb(0 0 0 / 0.22);

  /* Abstände (4-px-Raster) [E] */
  --space-1: 0.25rem; --space-2: 0.5rem; --space-3: 0.75rem;
  --space-4: 1rem;    --space-6: 1.5rem; --space-8: 2rem;
  --space-12: 3rem;   --space-16: 4rem;

  /* Größen */
  --size-sidebar: 15rem;
  --size-icon: 1.25rem;
  --size-control: 2.5rem;
  --size-button: 3rem;
  --size-content-max: 56rem;

  /* Radius [S] */
  --radius-sm: 0.625rem;
  --radius-md: 0.75rem;
  --radius-lg: 1.25rem;
  --radius-xl: 1.5rem;
  --radius-2xl: 2rem;
  --radius-pill: 999px;

  /* Rahmen & Schatten */
  --border-width: 1px;
  --shadow-sheet: 0 -8px 32px rgb(0 0 0 / 0.35);  /* [E] */
  --shadow-menu: 0 8px 24px rgb(0 0 0 / 0.3);     /* [E] */

  /* Z-Index [E] */
  --z-sidebar: 10; --z-toolbar: 20; --z-sheet: 40;
  --z-menu: 50;    --z-tooltip: 60;

  /* Bewegung [E] */
  --duration-fast: 120ms; --duration-base: 200ms; --duration-slow: 300ms;
  --ease-out: cubic-bezier(.2, .8, .2, 1);

  /* Breakpoints [E] */
  --bp-sm: 640px; --bp-md: 900px; --bp-lg: 1280px;
}
```

---

## 10. Technische Umsetzung (Empfehlungen [E])

- **Komponenten:** `AppShell`, `Sidebar`, `NavItem`, `Button` (primary/secondary/ghost/chip), `Card`, `PlanCard`, `ArtifactCard`, `SegmentControl`, `ChatInput`, `Sheet`, `Menu`, `Badge`, `Tooltip`, `Toolbar`.
- **Layout:** App-Shell mit CSS Grid (`grid-template-columns: var(--size-sidebar) minmax(0,1fr) minmax(0,26rem)`), Karten-Raster mit `repeat(auto-fit, minmax(18rem, 1fr))`, Inhalte mit Flexbox.
- **Einheiten:** `rem` für Schrift und Abstände, `clamp()` für Headlines, `%`/`fr` für Spalten, `dvh` für mobile Vollhöhe.
- **Layout-Shifts vermeiden:** Feste Höhen für Toolbars, `aspect-ratio: 16/9` für Slide-Canvas, Skeleton in gleicher Größe wie Zielinhalt.
- **Accessibility:** Sichtbarer Focus-Ring (2 px `--color-focus-ring`, Offset 2 px) auf allen interaktiven Elementen; Icon-Buttons mit `aria-label`; Menüs und Sheets mit Fokus-Falle und `Esc`; Segment-Control als `role="tablist"`/`radiogroup`; Mindest-Trefferfläche 44 × 44 px (Touch).
- **Kontrast:** Sekundärtext nicht dunkler als `#9a9a9a` auf `#191919`.
- **Reduzierte Bewegung:** Siehe Abschnitt 6.

---

## 11. Qualitätskontrolle

Priorität: **P1** = sofort sichtbar und prägend, **P2** = deutlich sichtbar, **P3** = Detail.

| Prio | Prüfpunkt | Soll |
|---|---|---|
| P1 | Farbtreue Flächen | `#191919` Basis, `#1f1f1f` Sidebar/Karten, `#303030` Eingabe/Menüs, `#404040` aktiv; keine Blautöne in den Grautönen |
| P1 | Typografie | Serif für Seitentitel, Sans für UI; Titel deutlich größer (≥ 2,2×) als Body |
| P1 | Primär-Button | Hell `#efefef` mit dunklem Text, Radius ~12 px |
| P1 | Layout-Struktur | Sidebar + zentrierter Inhalt; Pläne als 3 gleich breite Karten |
| P2 | Radien | Gestaffelt 10/12/20/24/32 px und Pille; keine scharfen Ecken |
| P2 | Karten | Keine Schatten, Abgrenzung nur über Fläche und 1-px-Linie |
| P2 | Icons | Einheitliche Linien-Icons (~1,5–2 px) |
| P2 | Typkacheln | Blau `#0e3d7e`, Braun `#632508`, Violett `#3d2987` mit Strichtextur |
| P2 | Navigation | Aktiver Eintrag `#404040`, Chat-Liste mit Kreis-Marker |
| P3 | Abstände | 4-px-Raster, Kartenpadding 24–32 px |
| P3 | Sheets | Drag-Handle, Radius oben ~20 px, `#20201f` |
| P3 | Animationen | Subtil, ≤ 300 ms, `prefers-reduced-motion` respektiert |
| P3 | Accessibility | Focus sichtbar, Kontrast ≥ 4,5:1, Tastaturbedienung |
| P3 | Konsistenz | Gleiche Komponente sieht überall gleich aus |

---

## Zusammenfassung der wichtigsten Designmerkmale

1. **Warme Dunkelgrau-Treppe** (`#0e0e0e` → `#191919` → `#1f1f1f` → `#303030` → `#404040`) statt Schatten schafft Tiefe.
2. **Serif-Headlines über Grotesk-UI** geben dem Produkt editorialen Charakter.
3. **Helle Primär-Buttons** (`#efefef`) sind die kontrastreichsten Elemente und lenken die Handlung.
4. **Großzügige Radien und Pillen-Chips** wirken freundlich und weich.
5. **Farbe nur gezielt:** Marken-Orange (Logo), Blau (Links/Laden), farbige Artefakt-Kacheln mit handgezeichneter Textur.
6. **Linien-Icons und Linien-Illustrationen** in einheitlicher Strichstärke.
7. **Drei-Spalten-Arbeitsbereich** mit schwebenden Toolbars und Bottom-Sheets im Artefakt-Panel.

**Offene Punkte:** exakte Schriftfamilien, Hover/Focus-/Fehlerzustände, Animationsparameter und Breakpoints müssten am Live-System (DevTools) geprüft werden. Alle entsprechenden Angaben oben sind Empfehlungen oder Schätzungen.
