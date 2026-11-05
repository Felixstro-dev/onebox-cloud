# Playbook: Anti-Muster, Microcopy, Ansprache

## 1. Anti-Muster (das macht der Agent nie)

**Optik**
- Rohe Farbwerte im eigenen CSS, Tailwind-Slate/Zinc-Blau, bunte Verlaufs-Heros, Neon-Glow, Glasmorphismus, Schatten auf normalen Karten.
- Emojis als Icons, gefüllte Icons, zwei Icon-Familien in einer Oberfläche.
- Drei oder mehr helle Primär-Buttons in einer Ansicht, farbige Primär-Buttons (außer der Nutzer will es ausdrücklich).
- Zentrierter Fließtext über mehr als zwei Zeilen, Zeilen breiter als 70 Zeichen, Text in Versalien (außer „PRO“-Badge).

**Inhalt**
- „Lorem ipsum“, erfundene Kennzahlen, erfundene Logos oder Bewertungen. Platzhalter sind klar als Beispiel markiert („Beispielkundin“, „Beispielwerte“).
- Floskeln wie „Wir sind Ihr kompetenter Partner“. Besser: ein konkretes Versprechen mit Zahl oder Ergebnis.

**Bewegung**
- Parallax, Scroll-Hijacking, Autoplay-Karussells, Bounce und Wackeln, Animationen über 300 ms an Bedienelementen, Endlosschleifen ohne Ladezweck.
- Vollbild-Spinner für Inhalte, Preloader auf normalen Firmenseiten und Apps, erfundene Fortschrittsprozente.

**Bedienung und Barrierefreiheit**
- Funktionen, die nur per Hover erreichbar sind, Wisch-Gesten ohne sichtbaren Button, Tooltips als einziger Hinweis.
- Platzhalter statt Label, `outline: none` ohne Ersatz, Icon-Buttons ohne `aria-label`, Status nur über Farbe.
- Horizontales Scrollen bei 390 px, Layout-Sprünge durch Bilder ohne Größe, Text in festen Höhen.
- Cookie-Banner mit „Alle akzeptieren“ als einzigem auffälligen Knopf (Dark Pattern).

## 2. Microcopy (Deutsch, mit englischen Entsprechungen)

**Anrede:** Apps und Portfolios „du“, Firmenseiten für Geschäftskunden „Sie“, Standard ist die Sprache der Zielgruppe. Nie mischen. Englisch: Satzschreibweise (nur der erste Buchstabe groß).

| Situation | Muster | Beispiel |
|---|---|---|
| Button | Verb plus Objekt, keine „OK“-Knöpfe | „Projekt anlegen“, „Änderungen speichern“ |
| Destruktiv | Konsequenz im Knopf | „Projekt löschen“, nicht „Ja“ |
| Fehler | Was ist passiert, warum, was nun | „Speichern fehlgeschlagen. Die Verbindung wurde unterbrochen. Versuche es erneut.“ |
| Formularfehler | am Feld, konkret | „Bitte gib eine gültige E-Mail-Adresse an.“ |
| Leerzustand | Satz + ein nächster Schritt | „Noch keine Projekte. Lege dein erstes Projekt an.“ |
| Laden | Tätigkeit, kein „Bitte warten“ | „Denke nach …“, „Speichere …“ |
| Erfolg | kurz, im Perfekt | „Gespeichert“, „Nachricht gesendet“ |
| 404 | freundlich, mit Ausweg | „Diese Seite gibt es nicht. Vielleicht ist der Link veraltet.“ |
| Hinweis zu Daten | neben der Aktion | „Wir nutzen deine Adresse nur für die Antwort.“ |

**Formate (Deutsch):** `1.240 €` (Punkt tausender, Komma Dezimalen, Leerzeichen vor €), Datum „2. November 2026“ oder `02.11.2026`, Uhrzeit `14:30`, Prozent `99 %` mit Leerzeichen. Mit `Intl.NumberFormat('de-DE')` formatieren statt von Hand. Typografische Anführungszeichen „…“ und Apostroph ’.
**Inklusiv:** neutrale Formulierungen („Kundschaft“, „Team“, „alle, die …“) statt Sternchen im Fließtext.

## 3. So sprichst du deinen Agenten an

| Du sagst | Der Agent macht |
|---|---|
| „Bau mir eine UI / eine App / ein Tool“ | Claude-Stil, passende Vorlage (Chat, Dashboard, Einstellungen) |
| „Mach es modern“ / „moderner“ / „sleek“ / „wie mein Frontend“ | `data-style="modern"`: Geist, schwebendes Panel, Bühne, Pill-CTA, ruhige Bewegung |
| „Bau mir eine Website / Homepage für …“ | `site.src.html` mit SEO, Menü-Sheet, Formular, Hell/Dunkel |
| „Portfolio“ / „unique“ / „etwas Besonderes“ | Portfolio-Baukasten, Dark, X-Ray-Signatur, eigene Signaturfarbe |
| „mit Preloader“ / „schöne Ladeanimationen“ | Loader nach `references/loaders.md`, Preloader nur wenn sinnvoll |
| „wie in der Claude-App“ | Claude-Stil mit Serif-Titeln und Feder-Gesten |
| „von unten wischen“ / „wie auf dem iPhone“ | Bottom-Sheet mit `sheet.js` |
| „nur hell“ / „Light Mode“ | `data-theme="light"` (nicht mit Modern kombiniert) |
| „Farbe #… als Marke“ | nur `--color-accent-brand` überschreiben |

Rückfragen stellt der Agent nur, wenn es nötig ist, zum Beispiel für Portfolios: Name, drei Projekte (Rolle, Dauer, Ergebnis), Signaturfarbe, Sprache. Alles andere nimmt er mit Standardwerten und nennt die Annahmen in einem Satz.

## 4. Qualitätsrunde vor der Abgabe

1. `scripts/check_style.py <datei>` und `scripts/check_tokens.py <datei>` ohne Meldungen.
2. Bei 390 px und 1280 px ansehen, Tastatur durchtabben, „Bewegung reduzieren“ einschalten.
3. `references/css-values.md` für exakte Maße, wenn etwas „fast richtig“ aussieht.
4. In der Antwort in zwei Sätzen sagen, was gebaut wurde und welche Annahmen gelten.
