# Icons: Lucide

Alle Icons kommen aus Lucide (lucide.dev, ISC-Lizenz). Gründe: einheitliche 24-px-Geometrie, runde Enden, konsistenter Strich, und die Namen sind überall gleich (Sprite, CDN, React-Paket).

## Einbinden

**Standard: Sprite aus `assets/icons.svg`** (offline, keine Abhängigkeit). Das Sprite wird einmal im `<body>` eingesetzt, danach:

```html
<svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg>
<button class="btn btn--ghost" aria-label="Schließen"><svg class="icon"><use href="#i-x"/></svg></button>
```

`.icon` setzt Größe (`--size-icon`, 20 px), `fill:none`, `stroke:currentColor`, `stroke-width:var(--icon-stroke)`, runde Enden. Farbe kommt über `color` des Elternelements. Lucide-Standardstrich ist 2. Der Skill nutzt 1,75, weil die Claude-Oberfläche feiner wirkt. Wer den Standard will, setzt `--icon-stroke: 2`.

**Online-Alternative bei Bedarf an mehr Icons** (zum Beispiel in veröffentlichten Seiten): UMD-Build mit festgenagelter Version laden und `createIcons()` aufrufen.

```html
<script src="https://cdn.jsdelivr.net/npm/lucide@0.469.0/dist/umd/lucide.min.js"></script>
<i data-lucide="sparkles" class="icon"></i>
<script>lucide.createIcons();</script>
```

**React:** `lucide-react` mit `size={20} strokeWidth={1.75}`.

## Größen

| Kontext | Größe |
|---|---|
| Standard (Nav, Buttons, Chips) | 20 px (`--size-icon`) |
| Dichte Listen, Badges | 16 px |
| Hero-Logo, Leer-Zustände | 32 px |

## Zuordnung Konzept zu Lucide-Name (im Sprite enthalten)

| Konzept | Name | Konzept | Name |
|---|---|---|---|
| Neu, Hinzufügen | `plus` | Senden | `arrow-up` |
| Stoppen | `circle-stop` | Suchen | `search` |
| Menü | `menu` | Schließen | `x` |
| Projekte | `folder` | Artefakte | `layout-grid` |
| Code | `code` | Schreiben | `pencil` |
| Lernen | `book-open` | Alltag, Hell | `sun` |
| Dunkel | `moon` | Kopieren | `copy` |
| Erledigt | `check` | Aufklappen | `chevron-down` |
| Einstellungen | `settings` | Hilfe | `circle-help` |
| Hinweis | `info` | Warnung | `triangle-alert` |
| Profil | `user` | Abmelden | `log-out` |
| Chat | `message-square` | Seitenpanel | `panel-right`, `panel-left` |
| Anhang | `paperclip` | Mikrofon | `mic` |
| Download | `download` | Mehr | `ellipsis` |
| Löschen | `trash-2` | Neu laden | `refresh-cw` |
| KI, Magie | `sparkles` | Benachrichtigung | `bell` |
| Extern öffnen | `external-link` | Start | `house` |
| Dokument | `file-text` | Folien | `presentation` |
| Verlauf | `history` |  | Schloss | `lock` |
| Zurücksetzen | `rotate-ccw` | Fehler im Text | `circle-alert` |
| Verbessern, Zauberstab | `wand-sparkles` | Modell, Würfel | `box` |
| Logo-Stern | `asterisk` | Pfeile | `arrow-left`, `arrow-right`, `chevron-left`, `chevron-right` |

## Ein Icon fehlt

1. Passenden Lucide-Namen auf lucide.dev suchen (englisches Stichwort).
2. Bei Netzzugriff: über das CDN-Muster oben laden. Ohne Netz: das `<symbol>` mit gleicher ID `i-<name>` ergänzen, `viewBox="0 0 24 24"`, nur Linien, kein `fill`.
3. Niemals auf Emojis oder gefüllte Icons ausweichen.

## Hinweis zur Herkunft

Die Pfade im Sprite wurden ohne Netzzugriff übertragen. Sieht ein Icon verzerrt oder anders als auf lucide.dev aus, den Pfad dort kopieren und im Sprite ersetzen.
