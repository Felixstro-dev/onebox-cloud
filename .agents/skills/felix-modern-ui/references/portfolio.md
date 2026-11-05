# Portfolio: unverwechselbar, Dark, mit einer Signatur

Startpunkt: `assets/templates/portfolio.src.html` mit `portfolio.css`. Immer Modern-Stil (`data-style="modern"`), immer Dark. Ziel: Besucher merken sich die Seite, weil sie etwas erleben, das sie sonst nicht sehen, und weil die Arbeit im Mittelpunkt bleibt.

## Die Signatur: X-Ray-Modus

Taste **X** (oder Knopf „X-Ray“ in der Navigation) macht die Seite zum Werkzeug, das sich selbst inspiziert:

- Jeder Abschnitt trägt ein Etikett (`data-x`), zum Beispiel „h1 · Geist 600 · −0.055em“, und ein gestricheltes Rahmenraster.
- Das 12-Spalten-Raster legt sich über den Inhalt.
- Ein Live-Inspektor folgt dem Cursor und zeigt für das Element darunter: Größe, Schrift, Gewicht, **Farbe mit Token-Namen**, Fläche, Radius, Abstand, Übergangsdauer und Kurve.

Warum es wirkt: Es zeigt Handwerk statt es zu behaupten. Es ist für Auftraggeber im Design und in der Entwicklung sofort lesbar und lässt sich nicht aus einem Template kopieren, weil die Etiketten zur eigenen Seite gehören. Ich kenne kein verbreitetes Portfolio-Template mit eingebautem Live-Inspektor. Ob es das irgendwo nicht gibt, kann ich nicht prüfen, deshalb ist die zweite Hälfte der Unverwechselbarkeit der Inhalt (siehe unten).

Anpassen: Etiketten mit `data-x="…"` an eigene Elemente setzen, die Token-Liste `tokenNames` im Skript erweitern, Signaturfarbe über `--color-accent-brand` ändern.
Fallbacks: Auf Touch-Geräten gibt es keinen Cursor, dort zeigt X-Ray nur Raster und Etiketten. Der Inspektor ist `aria-hidden`, der Knopf hat `aria-pressed`. Ohne JavaScript bleibt die Seite vollständig lesbar.

## Weitere Bausteine (alle in `portfolio.css`)

| Baustein | Wirkung | Rückfall |
|---|---|---|
| Spotlight-Punktraster (`.spot`) | Punkte leuchten unter der Maus in der Signaturfarbe | aus bei Touch und reduzierter Bewegung |
| Serif-Kursiv-Akzent (`.pf-name em`) | ein Wort der Headline in kursiver Serif | reine Typografie |
| Projektindex (`.pf-index`) | große Zeilen, Hover schiebt und färbt den Pfeil, Vorschaukarte folgt dem Cursor | Vorschau nur mit Maus |
| Fallstudien als Sheet | Klick öffnet von unten ein Gesten-Sheet (halb/voll), Wisch schließt | normales Sheet mit Schließen-Knopf, Escape |
| Preloader-Intro | Logo zeichnet sich, echter Zähler, Vorhang nach oben, nur beim ersten Besuch pro Sitzung | wird bei reduzierter Bewegung sofort geöffnet |
| Jetzt-Leiste (`.pf-now`) | Uhrzeit beim Gastgeber und beim Besucher, Verfügbarkeit | statischer Text |
| E-Mail kopieren | Icon wechselt zu Haken | Link bleibt normaler `mailto:` |

## Regeln für „unique“

1. **Genau eine Signatur** pro Portfolio, alles andere ruhig. Mehr Effekte wirken wie eine Vorlage.
2. **Eigene Signaturfarbe** statt Orange (Vorlage: `#d6ff5c`, 16,8:1 auf `bg-base`, dunkler Text darauf 17,2:1): eine kräftige Farbe, die auf dem dunklen Grund mindestens 4,5:1 hält und nur für Hervorhebungen, Hover und X-Ray dient.
3. **Inhalt ist die zweite Hälfte der Einzigartigkeit.** Eigene Sätze statt Floskeln („Ich baue X für Y“), 3 bis 5 echte Projekte mit Rolle, Dauer und Ergebnis, kein „Skills-Balken“-Abschnitt.
4. **Typografie als Handschrift:** sehr große Headline mit engem Tracking, ein Akzentwort in Serif-Kursiv, Mono für Metadaten.
5. **Fallstudien statt Kacheln:** jedes Projekt erzählt Problem, Entscheidung, Ergebnis. Bilder liefert der Nutzer, die Vorlage hat Platzhalter.
6. **Keine Spielereien, die Lesen oder Bedienen stören:** kein benutzerdefinierter Cursor, kein Scroll-Hijacking, keine Intro-Animation über 1 s, keine Musik.

## Alternative Signaturen (wenn der Nutzer etwas anderes möchte)

- **Zeitleiste der Arbeit:** horizontaler Scroll durch Jahre, Projekte docken an.
- **Befehlspalette (⌘K):** die Navigation als Suche mit Tastatur, passt zu Entwicklerinnen und Entwicklern.
- **Lebendiges Detail:** ein einziges, handgebautes Interaktionsobjekt (Schalter, Drehregler, Mini-Spiel) im Hero, das etwas über die Person erzählt.
- **Vorher/Nachher-Schieber** bei Redesigns.

## Leistung und Barrierefreiheit

Spotlight über `requestAnimationFrame` und CSS-Variablen, keine Bibliothek. Effekte nur bei `pointer: fine` und ohne reduzierte Bewegung. Kontraste siehe `references/accessibility.md` (Modern-Tabelle). Alle Funktionen sind per Tastatur erreichbar (X, Tab, Enter, Escape). Seitentitel und Beschreibung füllen, Open-Graph-Bild mit dem Namen und der Signaturfarbe gestalten.
