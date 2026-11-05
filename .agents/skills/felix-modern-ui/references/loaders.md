# Loader, Preloader und Effekte

Dateien: `assets/loaders.css`, `assets/effects.css`, `assets/preloader.js`, `assets/effects.js`. Alle Beispiele zum Ansehen: `assets/templates/loaders.src.html`. Alles läuft ohne Bibliothek, mit Tokens und in beiden Stilen (Claude und Modern).

## Welcher Loader für welche Lage

| Situation | Loader | Klasse |
|---|---|---|
| Klick auf einen Button, Antwort dauert | Ring im Button, Breite bleibt gleich | `.btn[aria-busy="true"]` |
| Kleiner Bereich lädt | Ring | `.spinner` |
| KI denkt nach oder schreibt | drehender Stern plus Text-Schimmer, oder drei Punkte | `.loader-star` + `.shimmer-text`, `.dots` |
| Liste, Karte oder Artikel lädt | **Skeleton in Zielgröße**, danach Inhalt blendet ein | `.skeleton--shimmer`, `.content-swap` |
| Dauer bekannt (Upload, Download) | Fortschrittsbalken mit echtem Wert | `.progress` mit `--p` 0 bis 1 |
| Dauer unbekannt | unbestimmter Balken | `.progress--indeterminate` |
| Seitenwechsel oder Datenabruf im Hintergrund | dünne Linie am Seitenrand | `.topbar-progress`, `TopBar.start()/done()` |
| Mehrstufige Aufgabe | Schritte mit Ring und Haken | `.steps` mit `data-state` |
| Bilder laden | erst unscharf, dann scharf | `.blur-up` (+ `FX.blurUp()`) |
| Audio, Aufnahme, Live | Equalizer-Balken, Puls-Punkt | `.loader-bars`, `.loader-ping` |
| Schwere Seite, Intro-Moment (Portfolio) | Vollbild-Preloader | `.preloader` + `Preloader.start()` |

## Regeln

1. **Erst nach ~200 ms zeigen, dann mindestens ~400 ms halten.** Kurze Ladezeiten zeigen keinen Loader (sonst Flackern), kurze Blitze vermeidet man durch die Mindestdauer.
2. **Skeleton für Inhalte, Ring für Aktionen, Balken bei bekannter Dauer.** Ein Vollbild-Spinner ist fast nie richtig.
3. **Nie erfundene Prozente.** Der Preloader-Zähler zeigt echte Werte (geladene Bilder, Schriften, `load`) und ist nur durch die Mindestdauer nach unten begrenzt. Bei unbekannter Dauer: unbestimmter Balken.
4. **Das alte Ergebnis bleibt sichtbar**, wenn nur nachgeladen wird (Generieren, Aktualisieren). Nur die Linie oder der Button zeigt den Zustand.
5. **Barrierefreiheit:** `role="status"` plus ein Text in `.loader-text` („Lädt“), Container mit `aria-busy="true"` während des Ladens. Bei reduzierter Bewegung stehen die Loader still, der Text bleibt, deshalb darf der Zustand nie nur aus Bewegung bestehen.
6. **Layout nicht springen lassen:** Skeleton und Inhalt gleich groß (`aspect-ratio`, feste Höhen).

## Preloader einbauen

```html
<html class="js is-loading">   <!-- ein Skript im <head> setzt js und is-loading, ohne JavaScript bleibt die Seite lesbar -->
<div class="preloader" data-exit="up" role="status" aria-live="polite"> … </div>   <!-- Markup siehe loaders.src.html -->
<script>Preloader.start({ minMs: 1100, once: 'intro' });</script>
```

- Der Inhalt steht schon im DOM (gut für Suchmaschinen und Screenreader), der Preloader liegt nur darüber.
- Mindestdauer 900 bis 1800 ms, Höchstdauer 4 s (danach öffnet er in jedem Fall). `once` zeigt ihn nur beim ersten Besuch pro Sitzung.
- Ausgang `data-exit="up"` (Vorhang nach oben, 500 ms) oder `"fade"`. Eintritts-Animationen der Seite warten, bis er weg ist (`html.is-loading` pausiert sie).
- Nur für schwere Seiten, Portfolios und Produkt-Launches. Normale Firmenseiten und Apps bekommen **keinen** Preloader, dort zählt die gefühlte Geschwindigkeit.

## Effekte-Katalog (`effects.css`)

| Wirkung | Klasse oder Aufruf | Wann |
|---|---|---|
| Einblenden von unten | `.fx-fade-up` | Standard für Karten und Abschnitte |
| Skalieren, Weichzeichnen, Maske | `.fx-scale-in`, `.fx-blur-in`, `.fx-clip-up` | Hero, Bilder (Blur sparsam, Leistung) |
| Von der Seite | `.fx-from-left`, `.fx-from-right` | Vergleiche, Zeitleisten |
| Wörter steigen aus Maske | `FX.splitWords(el)` + `.split-in` | große Überschriften (verliert Inline-HTML wie `<em>`) |
| Zahlen zählen hoch | `<span class="ticker" style="--to:128">` | Kennzahlen, reines CSS |
| Hover | `.hover-lift`, `.link-grow`, `.hover-arrow` | Karten, Links, Buttons |
| Schalter mit Feder | `.switch` | Einstellungen |
| Endlosband | `.marquee` (Inhalt zweimal) | Schlagworte, Logos |
| Lesefortschritt | `.scroll-progress` | Artikel, Fallstudien (nur wo `animation-timeline` existiert) |
| Einblenden im Blickfeld ohne JS | `.view-reveal` | Progressive Enhancement |
| Theme-Wechsel als Kreis | `FX.themeSwitch(btn, fn)` | Hell/Dunkel-Knopf (View Transitions API, sonst sofort) |
| Erneut abspielen | `FX.replay(el, cls)` | Demos, Wiederholung |

Staffelung über `style="--i:0,1,2"` (70 ms Versatz). Pro Abschnitt eine Effektart, Gesamtdauer eines Auftritts höchstens etwa 1 s.

## Dauer-Klassen (Erweiterung der Bewegungsregeln)

| Klasse | Dauer | Tokens | Wofür |
|---|---|---|---|
| Zustandswechsel | 120 bis 300 ms | `--duration-fast/base/slow` | Hover, Farben, Menüs, Einblenden |
| Ebenen | 380 bis 500 ms | `--duration-sheet`, `--duration-spring` | Sheets, Panels, Vorhang |
| Inszeniert | 700 und 1400 ms | `--duration-draw`, `--duration-count` | Preloader-Zeichnung, Zähler. Nie für Bedienelemente |
| Schleifen | frei | fest in `loaders.css` | nur Warten und Laden, Marquee, ruhige Dekoration |
