# Stil-Variante „modern“

Gemeint ist der Look, den der Nutzer in seinem Frontend (Geist, schwebendes Prompt-Panel, Bühne mit abgedunkeltem Produktbild, Pill-Buttons, 1-px-Ladelinie) gebaut hat, **kombiniert** mit der Claude-Struktur dieses Skills. Aktivierung: `<html data-style="modern">` plus `assets/modern.css` nach `components.css` einbinden. Fertig als `assets/templates/modern.src.html`, Vergleich im `catalog.src.html` (Knopf „Stil“).

Wann: Sagt der Nutzer „mach es modern“, „moderner“, „sleek“, „Vercel-/shadcn-Look“ oder „wie mein Frontend“, wird diese Variante genutzt. Ohne solchen Hinweis gilt der Claude-Stil.

## Was von wem kommt

| Bereich | Claude-Stil (Standard) | Modern | Gemeinsam |
|---|---|---|---|
| Schrift | Serif-Titel (Source Serif 4), Inter | Geist für alles, Titel 600, Tracking −0,035 em, Zeilenhöhe 1,04 | Fallback-Stacks, `text-wrap: balance`/`pretty` |
| Flächen | warmes Grau, `bg-base` #191919 | tieferes neutrales Grau, `bg-base` #0e0e0e, Oberfläche #171717 | gleiche Token-Namen und Stufenlogik |
| Tiefe | Flächenstufen, Schatten nur bei Sheets/Menüs | zusätzlich großer weicher Schatten nur an schwebenden Elementen (`--shadow-panel`, Menüs, Dialoge, Tooltips). Karten bleiben flach | Linien statt Rahmenboxen |
| Primär-Button | hell, Radius `md` | hell, Pill (`.btn--pill`), CTA 52 px (`.btn--cta`) | ein Primär-Button pro Ansicht |
| Bewegung | iOS-Kurve 500 ms, Feder mit Überschwingen | `cubic-bezier(.22,1,.36,1)`, 140/240/320 ms, **kein Bounce** | Gesten, Sheets, `--sheet-p`, Reduced-Motion |
| Layout | Sidebar plus Chat | Bühne mit Produktbild, Scrim, schwebendes Prompt-Panel unten, Sticky-CTA | Bottom-Sheet für Verlauf und Details |
| Ladezustand | `.dots`, Statuszeile | 1-px-Ladelinie am Panel plus „Generiere · 12 s“, Bild bleibt sichtbar | keine falschen Prozentzahlen |
| Icons | Lucide | Lucide, 1,75 Strich, Tooltip an jedem Icon-Button | Sprite aus `icons.svg` |
| Theme | Dark, optional Light | Dark-only | |

## Bausteine (alle in `modern.css`, nutzbar auch ohne das Attribut)

`.nav-bar`, `.wordmark`, `.icon-btn` (36 px, auf Touch 44 px) mit `data-tip`-Tooltip, `.avatar-chip`, `.stage` mit `.stage__art` und `.stage__scrim`, `.cta-bar` und `.btn--cta`, `.prompt` mit `.prompt__row`, `.prompt__input`, `.prompt__opts` (klappt über `grid-template-rows` auf), `.opt-chip`, `.menu-up` (Menü öffnet nach oben), `.line-loader`, `.error-strip`, `.list-row`, `.badge-pro`, `.dialog` (natives `<dialog>`), Typografie `.display`, `.lead`, `.eyebrow`.

## Ablauf Landing zu Generator (wie in der Vorlage)

1. Landing liegt im Bühnenbereich, scrollt in sich, Navigation und Hülle scrollen nie. Produktbild steht abgedunkelt dahinter (`.stage__art`, Deckkraft ca. 0,3, ruhige Drehung, nicht interaktiv).
2. Sticky-CTA unten. Klick setzt `data-mode="demo"`: Landing blendet aus, Scrim blendet aus, Bild wird deutlicher, Prompt-Panel gleitet von unten herein (320 ms).
3. Panel: Optionen-Knopf links, Textfeld, Generieren-Pill. Optionen klappen nach oben auf, die Eingabezeile bleibt stehen. Modell-Menü öffnet nach oben, Pro-Eintrag öffnet den Upgrade-Dialog.
4. Beim Generieren bleibt das bisherige Bild stehen. Nur die Ladelinie läuft, der Button zeigt „Generiere · 12 s“, Eingaben sind gesperrt. Kein Abbrechen anbieten, wenn das Backend nicht abbrechen kann.
5. Fehler erscheinen als Zeile im Panel (Icon plus Text), nie als Toast. Das vorige Ergebnis bleibt.
6. Verlauf ist ein Bottom-Sheet (`sheet.js`), kein Teil der Bühne.

## Entscheidungen bei Widersprüchen

- **Zinc zu neutralem Grau:** Die Vorlage nutzt Zinc (leichter Blaustich). Claude-Regel 2 verlangt neutral, also sind die Werte entsprechend umgerechnet [E].
- **Springs:** Die Vorlage verbietet Bounce. Modern setzt `--ease-spring` deshalb auf dieselbe Kurve wie `--ease-out`. Gesten (Ziehen, Geschwindigkeit, Gummiband) bleiben, nur das Überschwingen entfällt.
- **Schatten:** Die Vorlage nutzt weiche Schatten an Panel und Menüs. Das ist mit Regel 1 vereinbar, solange Karten flach bleiben.
- **Kleinste Schrift:** Die Vorlage nutzt für Etiketten einen sehr dunklen Grauton. Hier gilt `text-secondary`, siehe `references/accessibility.md`.
- **Großbuchstaben:** Nur das winzige „PRO“-Badge. Sonst keine Versalien-Etiketten.

## Übersetzung der Variablen aus dem ZIP-Projekt

| ZIP (`app.css`) | Skill-Token |
|---|---|
| `--bg` | `--color-bg-base` |
| `--bg-elevated` | `--color-bg-canvas` |
| `--surface` | `--color-bg-sidebar` (auch `--color-bg-panel`) |
| `--surface-hover` | `--color-bg-elevated` |
| `--surface-active` | `--color-bg-active` |
| `--border`, `--border-strong` | `--color-border-default`, `--color-text-tertiary` (für Focus-Rand) |
| `--text`, `--text-muted`, `--text-faint` | `--color-text-primary`, `--color-text-secondary`, `--color-text-tertiary` |
| `--primary`, `--primary-text` | `--color-button-primary`, `--color-text-on-primary` |
| `--danger` | `--color-error` |
| `--radius-panel` | `--radius-panel` (1,75 rem) |
| `--shadow-panel`, `--shadow-menu` | gleich benannt |
| `--ease`, `--dur-fast/base/slow` | `--ease-out`, `--duration-fast/base/slow` |
| `--nav-h`, `--panel-w` | `--size-nav`, `--size-prompt` |

In einem SvelteKit-Projekt reichen die drei Dateien `tokens.css`, `components.css`, `modern.css` als globale Imports. Geist dann selbst hosten (Fontsource), in veröffentlichten Einzelseiten genügt der Google-Fonts-Link der Vorlage.
