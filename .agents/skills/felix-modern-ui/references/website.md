# Normale Websites (Firma, Landingpage, Blog, Dokumentation)

Startpunkt: `assets/templates/site.src.html` (Navigation mit Menü-Sheet, Hero, Merkmale, Zitat, Preise, FAQ, Kontaktformular, Fußzeile, Hell/Dunkel). Bausteine in `assets/site.css`. Stil: Claude (Serif-Titel) oder Modern (Geist), je nachdem, ob der Nutzer „modern“ sagt. Die Vorlage steht auf Modern und bringt Hell/Dunkel mit (System-Einstellung als Start, Wahl wird gespeichert).

## Seitenaufbau (Reihenfolge der Abschnitte)

1. Kopfzeile: Wortmarke links, höchstens 5 Links, rechts ein Knopf (Theme, Kontakt). Mobil öffnet das Menü als Bottom-Sheet (`sheet.js`).
2. Hero: ein Satz Nutzen als `h1` (`.display`), zwei Sätze Erklärung (`.lead`), genau ein Primär-Button, optional ein sekundärer.
3. Nutzen: drei Karten (`.card.feature`) mit Lucide-Icon, Titel, zwei Zeilen Text.
4. Beweis: ein Zitat (`.quote`) oder Kennzahlen (`.stat`), nie ein Karussell.
5. Preise oder Angebot (`.plan`), die empfohlene Karte bekommt den Primär-Button, die anderen sekundär.
6. FAQ (`.faq` mit `<details>`, ohne JavaScript).
7. Abschluss: Formular oder CTA, danach Fußzeile mit Rechtlichem.

## Regeln

- **Eine Seite, eine Aufgabe, ein Primär-Button** pro sichtbarem Bereich.
- **Lesebreite:** Fließtext höchstens 60 Zeichen breit (`.lead`, `.article`).
- **Abstände:** Abschnitte `clamp(3.5rem, 8vw, 6rem)`, Karten 24–32 px innen.
- **Bewegung:** nur Einblenden beim Scrollen (`.reveal`, sichtbar ohne JavaScript) und Hover/Press. Kein Parallax, kein Autoplay-Karussell.
- **Bilder:** immer `width` und `height` setzen (kein Layout-Sprung), `loading="lazy"` unterhalb des Sichtbereichs, moderne Formate (WebP/AVIF), sinnvolle `alt`-Texte, Dekobilder `alt=""`.
- **Schriften:** höchstens zwei Familien (Geist oder Inter plus bei Claude-Stil eine Serif), `font-display: swap`, für Produktion selbst hosten.

## SEO und Teilen

`<title>` unter 60 Zeichen, `<meta name="description">` unter 155 Zeichen, genau ein `h1`, logische `h2`/`h3`, `<link rel="canonical">`, Open-Graph-Tags (Titel, Beschreibung, Bild 1200×630), `lang` am `<html>`. Bei Firmen zusätzlich JSON-LD (`Organization`, `LocalBusiness`) mit echten Angaben, keine erfundenen Bewertungen. `robots.txt` und Sitemap anlegen, sobald es mehrere Seiten gibt.

## Formulare

Sichtbares `<label>` pro Feld, passende `autocomplete`-Werte und `type`, Fehlertext mit Icon unter dem Feld (nie nur Rahmenfarbe), `aria-invalid` und `aria-describedby`, Fokus springt zum ersten Fehler, Erfolg als `role="status"`. Spamschutz und Speichern gehören auf den Server. Datenschutzhinweis neben dem Absenden-Knopf, wenn personenbezogene Daten erhoben werden.

## Rechtliches (Deutschland)

Impressum und Datenschutzerklärung verlinken (Fußzeile). Ein Cookie-Banner nur dann, wenn Tracking oder externe Dienste eingebunden sind. Schriften und Skripte möglichst selbst hosten, das spart Einwilligungen. Der Skill gibt keine Rechtsberatung: Texte prüft jemand, der sich damit auskennt.

## Blog und Dokumentation

Artikel in `.article` (Lesebreite 42rem, Zeilenhöhe 1,7, Serif für Zitate), Metazeile mit Datum und Lesezeit, Inhaltsverzeichnis bei langen Texten (Sticky-Spalte ab 1180 px), Codeblöcke `pre code` mit Scrollen statt Umbruch. Dokumentation zusätzlich mit Seitenleiste (`.nav-item`) und Suche (`i-search`), mobil als Sheet.

## Performance-Richtlinie

Kein Framework nötig für Inhaltsseiten. Ein CSS-Bündel (Tokens, Komponenten, Modern, Site), JavaScript nur für Menü, Einblenden und Formular, kein Blockieren des ersten Renderns. Ziel: gute Core Web Vitals (schnelles Hauptbild, kein Layout-Sprung, kurze Reaktionszeit). Messen mit Lighthouse, statt es zu raten.
