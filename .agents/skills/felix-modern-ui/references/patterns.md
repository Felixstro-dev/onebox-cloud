# Layout-Muster

Alle Muster nutzen dieselben Tokens und Komponenten. Titel in Serif (`h1`/`h2`), Inhalt zentriert, großzügig Abstand, Karten auf `bg-sidebar`, genau ein heller Primär-Button pro Ansicht.

## Inhalt
1. App-Shell und Chat
2. Dashboard
3. Landingpage
4. Pläne und Preise
5. Einstellungen und Formulare
6. Leere, ladende und fehlerhafte Zustände
7. Mobile

## 1. App-Shell und Chat

Grid `var(--size-sidebar) minmax(0,1fr)` plus optional dritte Spalte `var(--size-panel)` für ein Artefakt. Sidebar fix, Hauptbereich scrollt. Fertig in `assets/templates/chat.src.html` und `assets/app-shell.css`. Hero-Zustand: Serif-Titel, darunter Composer, darunter Chip-Reihe, vertikal leicht unter der Mitte. Chat-Zustand: Verlauf in `--size-chat-max`, Composer unten angedockt.

## 2. Dashboard

```html
<main class="page">
  <h1>Umsatz</h1>
  <div class="card-grid">
    <div class="card stat"><span class="stat__label">Heute</span><span class="stat__value">1.240 €</span></div>
    <!-- weitere .card.stat -->
  </div>
  <section class="card"><h2>Letzte Bestellungen</h2><hr class="card__divider">
    <table class="table">…</table></section>
</main>
```

- Kennzahlen als `.card.stat` im `.card-grid` (`auto-fit, minmax(18rem,1fr)`, Gutter 16 px).
- Tabellen mit Linien statt Rahmen (`.table`). Aktive Zeile oder Hover `bg-elevated`.
- Diagramme einfarbig in `text-primary` und `text-secondary`, höchstens eine Akzentreihe in `--color-accent-brand`. Achsen und Raster in `border-default`.
- Filter oben als `.segment` oder `.chip`-Reihe, nie als Dropdown-Wand.

## 3. Landingpage

Vollständige Website-Vorlage und SEO/Formular-Regeln: `references/website.md`. Portfolios: `references/portfolio.md`.

Reihenfolge: Hero (Serif-Titel zentriert `--text-hero`, ein Satz Untertitel in `text-secondary`, ein Primär-Button), danach Abschnitte im Abstand 64 px mit Serif-`h2`, Merkmale als `.card-grid` mit `.card` (Icon 20 px, Titel, zwei Zeilen Text). Schlussabschnitt wiederholt den Primär-Button. Keine Hintergrundbilder, keine Verläufe. Optional Kategorie-Kacheln (`.tile--doc` usw.) als einziger Farbakzent. Die Seite bekommt eine Navigationsleiste mit Logo links und einem Sekundär-Button rechts.

## 4. Pläne und Preise

Drei gleich breite `.card` im Grid. Aufbau pro Karte: Planname (`--text-lg`, Gewicht 500), Untertitel in `text-secondary`, Preis in Serif (40 px), Button, Kleingedrucktes zentriert in `text-xs`, `card__divider`, Merkmalliste mit `check`-Icon. Genau eine Karte bekommt den hellen Primär-Button, die anderen `btn--secondary`. Umschalter Monatlich/Jährlich als `.segment`, Ersparnis-Hinweis in `--color-accent-blue`.

## 5. Einstellungen und Formulare

Zweispaltig: links Navigation (`.nav-item` mit `aria-current`), rechts Inhalt in `--size-content-max`. Gruppen als `.card` mit `card__divider` zwischen Zeilen. Jede Zeile: Label und Hilfetext links (`text-secondary`, 14 px), Steuerelement rechts. Eingaben `.input` mit sichtbarem Label darüber, Fehler in `--color-error` mit `triangle-alert`-Icon und Text, nie nur Farbe. Speichern ist der Primär-Button, Abbrechen sekundär.

## 6. Leere, ladende und fehlerhafte Zustände

- **Leer:** Lucide-Icon 32 px in `text-secondary`, Serif-Satz, ein Satz Erklärung, ein Button.
- **Laden:** `.skeleton` in Zielgröße, danach `.ready`-Sequenz. Bei KI-Antworten `.dots` plus Statuszeile.
- **Fehler und Hinweise:** `.toast` mit `data-kind` (`success`, `warning`, `error`), Status-Icon links (`check`, `triangle-alert`, `info`), Schließen rechts.

## 7. Mobile (unter 900 px)

Sidebar als Overlay mit Scrim (`--color-scrim`), geöffnet über ein `menu`-Icon im Topbar. Panels als Vollbild-Sheet. Unter 1180 px werden Seitenpanels bereits zum Drawer, weil sonst der Hauptbereich zu schmal wird. Chip-Reihen scrollen horizontal. Composer bleibt unten, Eingaben mindestens 16 px, damit iOS nicht zoomt. Safe-Area-Abstände (`env(safe-area-inset-*)`) auf `:root` setzen, wie in `app-shell.css`.
