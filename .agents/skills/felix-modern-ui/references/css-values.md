# CSS-Referenz: exakte Werte

Diese Datei wird mit `python scripts/gen_spec.py` aus den echten CSS-Dateien erzeugt (Tokens gelesen, Komponenten im Browser gemessen). Bei Änderungen an `assets/` neu erzeugen. Maßgeblich bleiben die CSS-Dateien, diese Tabelle ist ihr Abbild. 1 rem = 16 px.

## 1. Tokens

### Farben

| Token | Dark / Standard | Light | Modern |
|---|---|---|---|
| `--color-bg-deep` | `#0e0e0e` | `#e8e6dc` | `#080808` |
| `--color-bg-canvas` | `#141414` | `#f0eee6` | `#0b0b0b` |
| `--color-bg-base` | `#191919` | `#faf9f5` | `#0e0e0e` |
| `--color-bg-topbar` | `#1d1d1d` | `#f5f4ee` | `#0e0e0e` |
| `--color-bg-sidebar` | `#1f1f1f` | `#f0eee6` | `#171717` |
| `--color-bg-panel` | `#20201f` | `#f5f4ee` | `#171717` |
| `--color-bg-segment` | `#252525` | `#ebe9e0` | `#1f1f1f` |
| `--color-bg-elevated` | `#303030` | `#ffffff` | `#1f1f1f` |
| `--color-bg-segment-active` | `#3d3d3d` | `#ffffff` | `#292929` |
| `--color-bg-active` | `#404040` | `#e8e6dc` | `#292929` |
| `--color-bg-active-hover` | `#4a4a4a` | `#dcd9cc` | `#343434` |
| `--color-border-subtle` | `#282828` | `#e8e6dc` | `#1f1f1f` |
| `--color-border-default` | `#313131` | `#dcd9cc` | `#2a2a2a` |
| `--color-text-primary` | `#f1f1f1` | `#141413` | `#fafafa` |
| `--color-text-secondary` | `#9a9a9a` | `#5e5d59` | `#a3a3a3` |
| `--color-text-tertiary` | `#6f6f6f` | `#87867f` | `#737373` |
| `--color-button-primary` | `#efefef` | `#141413` | `#fafafa` |
| `--color-button-primary-hover` | `#ffffff` | `#2a2a28` | · |
| `--color-text-on-primary` | `#191919` | `#faf9f5` | `#0b0b0b` |
| `--color-button-light` | `var(--color-button-primary)` | · | · |
| `--color-text-on-light` | `var(--color-text-on-primary)` | · | · |
| `--color-accent-orange` | `#d97757` | `#c15f3c` | · |
| `--color-accent-brand` | `var(--color-accent-orange)` | · | · |
| `--color-accent-blue` | `#4a9eff` | `#2563a8` | · |
| `--color-accent-blue-solid` | `#0a61a3` | · | · |
| `--color-text-on-tile` | `#f1f1f1` | · | · |
| `--color-success` | `#4ade80` | `#2f8f4e` | · |
| `--color-warning` | `#fbbf24` | `#b7791f` | · |
| `--color-error` | `#f87171` | `#c93c3c` | · |
| `--color-focus-ring` | `#4a9eff` | `#2563a8` | · |
| `--color-overlay` | `rgb(0 0 0 / .22)` | `rgb(20 20 19 / .12)` | · |
| `--color-scrim` | `color-mix(in srgb, var(--color-bg-deep) 70%, transparent)` | · | · |

### Kategorie-Kacheln

| Token | Dark / Standard | Light | Modern |
|---|---|---|---|
| `--color-tile-doc` | `#0e3d7e` | · | · |
| `--color-tile-slides` | `#632508` | · | · |
| `--color-tile-design` | `#3d2987` | · | · |
| `--color-text-on-tile` | `#f1f1f1` | · | · |

### Typografie

| Token | Wert |
|---|---|
| `--font-display` | `"Source Serif 4", Georgia, "Times New Roman", serif` |
| `--font-ui` | `Inter, -apple-system, "SF Pro Text", system-ui, sans-serif` |
| `--font-mono` | `ui-monospace, "SF Mono", Menlo, monospace` |
| `--text-hero` | `clamp(2rem, 1.4rem + 2vw, 2.75rem)` |
| `--text-title` | `clamp(1.75rem, 1.3rem + 1.5vw, 2.25rem)` |
| `--text-lg` | `1.375rem (22 px)` |
| `--text-base` | `1rem (16 px)` |
| `--text-sm` | `0.875rem (14 px)` |
| `--text-xs` | `0.75rem (12 px)` |
| `--weight-regular` | `400` |
| `--weight-medium` | `500` |
| `--leading-tight` | `1.15` |
| `--leading-normal` | `1.4` |
| `--leading-reading` | `1.55` |
| `--font-display (Modern)` | `Geist, "Geist Variable", Inter, -apple-system, system-ui, sans-serif` |
| `--font-ui (Modern)` | `Geist, "Geist Variable", Inter, -apple-system, system-ui, sans-serif` |

Modern setzt für `h1`, `h2`, `.sheet__title`: Gewicht 600, Zeichenabstand −0,035 em, Zeilenhöhe 1,04, Grundschrift 15 px (0,9375 rem), Zeilenhöhe 1,5.

### Abstände, Größen, Radien

| Token | Wert |
|---|---|
| `--space-1` | `.25rem (4 px)` |
| `--space-2` | `.5rem (8 px)` |
| `--space-3` | `.75rem (12 px)` |
| `--space-4` | `1rem (16 px)` |
| `--space-6` | `1.5rem (24 px)` |
| `--space-8` | `2rem (32 px)` |
| `--space-12` | `3rem (48 px)` |
| `--space-16` | `4rem (64 px)` |
| `--size-sidebar` | `15rem (240 px)` |
| `--size-panel` | `26rem (416 px)` |
| `--size-control` | `2.5rem (40 px)` |
| `--size-touch` | `2.75rem (44 px)` |
| `--size-button` | `3rem (48 px)` |
| `--size-icon` | `1.25rem (20 px)` |
| `--size-content-max` | `56rem (896 px)` |
| `--size-chat-max` | `48rem (768 px)` |
| `--size-prompt` | `45rem (720 px)` |
| `--size-nav` | `3.75rem (60 px)` |
| `--size-icon-btn` | `2.25rem (36 px)` |
| `--icon-stroke` | `1.75` |
| `--radius-panel` | `1.75rem (28 px)` |
| `--radius-sm` | `.625rem (10 px)` |
| `--radius-md` | `.75rem (12 px)` |
| `--radius-lg` | `1.25rem (20 px)` |
| `--radius-xl` | `1.5rem (24 px)` |
| `--radius-2xl` | `2rem (32 px)` |
| `--radius-pill` | `999px` |
| `--radius-sm (Modern)` | `.5rem (8 px)` |
| `--radius-md (Modern)` | `.75rem (12 px)` |
| `--radius-lg (Modern)` | `1rem (16 px)` |
| `--radius-xl (Modern)` | `1.5rem (24 px)` |

### Schatten und Ebenen

| Token | Wert |
|---|---|
| `--shadow-sheet` | `0 -12px 48px rgb(0 0 0 / .5)` (Modern) |
| `--shadow-menu` | `0 12px 40px rgb(0 0 0 / .5)` (Modern) |
| `--shadow-panel` | `0 24px 70px rgb(0 0 0 / .45)` |
| `--z-sidebar` | `10` |
| `--z-toolbar` | `20` |
| `--z-panel` | `30` |
| `--z-scrim` | `35` |
| `--z-sheet` | `40` |
| `--z-menu` | `50` |
| `--z-tooltip` | `60` |

### Bewegung

| Token | Standard | Modern |
|---|---|---|
| `--duration-fast` | `120ms` | `140ms` |
| `--duration-base` | `200ms` | `240ms` |
| `--duration-slow` | `300ms` | `320ms` |
| `--ease-out` | `cubic-bezier(.2, .8, .2, 1)` | `cubic-bezier(.22, 1, .36, 1)` |
| `--ease-in-out` | `cubic-bezier(.4, 0, .2, 1)` | · |
| `--duration-sheet` | `500ms` | `380ms` |
| `--ease-sheet` | `cubic-bezier(.32, .72, 0, 1)` | `cubic-bezier(.22, 1, .36, 1)` |
| `--duration-spring` | `500ms` | `320ms` |
| `--duration-draw` | `700ms` | · |
| `--duration-count` | `1400ms` | · |
| `--ease-spring` | `cubic-bezier(.34, 1.3, .64, 1)` | `cubic-bezier(.22, 1, .36, 1)` |

Federkurve (CSS `linear()`, gedämpft, etwa 4 % Überschwingen, ruhig nach 500 ms), vollständig:

```css
--ease-spring: linear(0, 0.018, 0.066, 0.134, 0.215, 0.303, 0.393, 0.482, 0.566, 0.644, 0.715, 0.778, 0.833, 0.88, 0.92, 0.952, 0.978, 0.998, 1.013, 1.024, 1.032, 1.036, 1.038, 1.038, 1.037, 1.035, 1.032, 1.029, 1.026, 1.022, 1.019, 1.016, 1.013, 1.01, 1.008, 1.006, 1.004, 1.003, 1.001, 1.001, 1);
```

Breakpoints (in `@media` als feste Werte): **640 px** (klein), **760 px** (Navigation klappt ein), **900 px** (Sidebar wird Overlay, Panels werden Sheets), **1180 px** (Seitenpanel wird Drawer). Grobe Zeiger: `@media (pointer: coarse)` hebt `--size-control` und `--size-icon-btn` auf 44 px.

## 2. Komponenten-Maße (im Browser gemessen)

Gemessen bei 900 px Viewport-Breite (fluide Schriftgrößen wie `.display` hängen davon ab). Format: Größe = Breite × Höhe der Demo-Instanz (bei Inhalt abhängig von Text). Farben als Token-Name. Übergang = Dauer und Kurve des ersten Übergangs.

### Claude-Stil (Standard, Dark)

| Element | Werte |
|---|---|
| `h1` | Größe 59.5px × 37px; Schrift 32px / 400 / 37px; Familie Source Serif 4; Farbe text-primary; Fläche transparent |
| `h2` | Größe 44.5px × 27.5px; Schrift 24px / 400 / 27.5px; Familie Source Serif 4; Farbe text-primary; Fläche transparent |
| `.display` | Größe 139.5px × 48.5px; Schrift 47px / 600 / 48.5px / -1.5px; Familie Source Serif 4; Farbe text-primary; Fläche transparent |
| `p` | Größe 69.5px × 22.5px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche transparent |
| `.lead` | Größe 36px × 24px; Schrift 15px / 400 / 24px; Familie Inter; Farbe text-secondary; Fläche transparent; Max 553.5px |
| `.eyebrow` | Größe 53px × 17px; Schrift 12px / 500 / 17px / 0px; Familie Inter; Farbe text-secondary; Fläche transparent |
| `.btn--primary` | Größe 100.5px × 48px; Padding 0px 24px; Radius 12px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-on-primary; Fläche button-primary; Abstand 8px; Übergang .12s cubic-bezier(0.2, 0.8, 0.2, 1) |
| `.btn--secondary` | Größe 123.5px × 48px; Padding 0px 24px; Radius 12px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche bg-active; Abstand 8px; Übergang .12s cubic-bezier(0.2, 0.8, 0.2, 1) |
| `.btn--ghost` | Größe 44px × 44px; Radius 12px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche transparent; Abstand 8px; Übergang .12s cubic-bezier(0.2, 0.8, 0.2, 1) |
| `.btn--pill` | Größe 70.5px × 48px; Padding 0px 24px; Radius 999px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-on-primary; Fläche button-primary; Abstand 8px; Übergang .12s cubic-bezier(0.2, 0.8, 0.2, 1) |
| `.btn--cta` | Größe 300px × 52px; Padding 0px 24px; Radius 999px; Schrift 16px / 550 / 22.5px; Familie Inter; Farbe text-on-primary; Fläche button-primary; Abstand 8px; Übergang .12s cubic-bezier(0.2, 0.8, 0.2, 1) |
| `.btn:disabled` | Größe 77.5px × 48px; Padding 0px 24px; Radius 12px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-tertiary; Fläche bg-active; Abstand 8px; Übergang .12s cubic-bezier(0.2, 0.8, 0.2, 1) |
| `.chip` | Größe 70px × 40px; Padding 0px 16px; Radius 999px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche bg-sidebar; Rand 1px border-default; Abstand 8px; Übergang .12s cubic-bezier(0.2, 0.8, 0.2, 1) |
| `.badge` | Größe 56px × 19px; Padding 0px 8px; Radius 999px; Schrift 12px / 400 / 17px; Familie Inter; Farbe accent-blue; Fläche transparent; Rand 1px accent-blue |
| `.badge-pro` | Größe 37.5px × 18px; Padding 2px 6px; Radius 999px; Schrift 10px / 600 / 14px / 0.5px; Familie Inter; Farbe text-secondary; Fläche bg-active |
| `.card` | Größe 106.5px × 86.5px; Padding 32px; Radius 24px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche bg-sidebar |
| `.card-grid` | Größe 288px × 61px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche transparent; Abstand 16px |
| `.stat__label` | Größe 77px × 19.5px; Schrift 14px / 400 / 19.5px; Familie Inter; Farbe text-secondary; Fläche transparent |
| `.stat__value` | Größe 77px × 39.5px; Schrift 34.5px / 400 / 39.5px; Familie Source Serif 4; Farbe text-primary; Fläche transparent |
| `.input` | Größe 234px × 56.5px; Padding 16px; Radius 20px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche bg-elevated; Rand 1px border-default; Übergang .2s cubic-bezier(0.2, 0.8, 0.2, 1) |
| `.prompt__input` | Größe 183px × 42.5px; Padding 10px 4px; Radius 20px; Schrift 15px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche transparent; Übergang .2s cubic-bezier(0.2, 0.8, 0.2, 1) |
| `.field label` | Größe 38px × 19.5px; Schrift 14px / 400 / 19.5px; Familie Inter; Farbe text-secondary; Fläche transparent |
| `.nav-item` | Größe 868px × 44px; Padding 0px 12px; Radius 10px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche transparent; Abstand 12px; Übergang .12s cubic-bezier(0.2, 0.8, 0.2, 1) |
| `.nav-item[aria-current]` | Größe 868px × 44px; Padding 0px 12px; Radius 10px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche bg-active; Abstand 12px; Übergang .12s cubic-bezier(0.2, 0.8, 0.2, 1) |
| `.segment` | Größe 98px × 46.5px; Padding 4px; Radius 12px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche bg-segment; Abstand 4px |
| `.segment > button` | Größe 43px × 38.5px; Padding 8px 16px; Radius 10px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche transparent; Übergang .12s cubic-bezier(0.2, 0.8, 0.2, 1) |
| `.segment > [aria-selected]` | Größe 43px × 38.5px; Padding 8px 16px; Radius 10px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche bg-segment-active; Übergang .12s cubic-bezier(0.2, 0.8, 0.2, 1) |
| `.tile` | Größe 120px × 85.5px; Radius 12px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche tile-slides |
| `.menu` | Größe 60px × 38.5px; Padding 8px; Radius 20px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche bg-elevated; Schatten shadow-menu |
| `.toast` | Größe 126.5px × 54.5px; Padding 16px; Radius 20px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche bg-elevated; Abstand 12px |
| `.table th` | Größe 868px × 44px; Padding 12px 16px; Schrift 14px / 400 / 19.5px; Familie Inter; Farbe text-secondary; Fläche transparent |
| `.table td` | Größe 868px × 47px; Padding 12px 16px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche transparent; Rand 1px border-subtle |
| `.icon` | Größe 20px × 20px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche transparent |
| `.icon-btn` | Größe 36px × 36px; Radius 10px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-secondary; Fläche transparent; Übergang .12s ease |
| `.avatar-chip` | Größe 34px × 34px; Radius 999px; Schrift 11.5px / 600 / 16px; Familie Inter; Farbe text-primary; Fläche bg-active; Rand 1px border-default; Übergang .12s ease |
| `.opt-chip` | Größe 65.5px × 40px; Padding 0px 12px; Radius 10px; Schrift 12.5px / 400 / 17.5px; Familie Inter; Farbe text-secondary; Fläche bg-active; Abstand 6px; Übergang .12s ease |
| `.prompt` | Größe 300px × 70px; Padding 10px; Radius 28px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche bg-sidebar; Rand 1px border-default; Schatten shadow-panel; Übergang .12s ease |
| `.list-row` | Größe 300px × 42px; Schrift 13.5px / 400 / 19px; Familie Inter; Farbe text-primary; Fläche transparent; Abstand 16px |
| `.switch` | Größe 44px × 26px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche transparent |
| `.spinner` | Größe 20px × 20px; Radius 999px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche transparent; Rand 2px text-primary |
| `.loader-bars` | Größe 9px × 20px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche transparent; Abstand 3px |
| `.loader-ping` | Größe 12px × 12px; Radius 999px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche accent-orange |
| `.progress` | Größe 200px × 4px; Radius 999px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche bg-active |
| `.skeleton--line` | Größe 114.5px × 11.5px; Radius 999px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche bg-active |
| `.skeleton--title` | Größe 114.5px × 23px; Radius 10px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche bg-active |
| `.skeleton--avatar` | Größe 38px × 38px; Radius 999px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche bg-active |
| `.steps li` | Größe 82.5px × 22.5px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-secondary; Fläche transparent; Abstand 12px; Übergang .2s cubic-bezier(0.2, 0.8, 0.2, 1) |
| `.site-nav__bar` | Größe 57.5px × 60px; Padding 0px 24px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche transparent; Abstand 16px; Max 896px |
| `.container` | Größe 868px × 22.5px; Padding 0px 24px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche transparent; Max 896px |
| `.section` | Größe 9.5px × 166.5px; Padding 72px 0px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-primary; Fläche transparent |
| `.skip-link` | Größe 66px × 46.5px; Padding 12px 16px; Radius 12px; Schrift 16px / 400 / 22.5px; Familie Inter; Farbe text-on-primary; Fläche button-primary; Übergang .12s cubic-bezier(0.2, 0.8, 0.2, 1) |

### Modern: nur Abweichungen vom Claude-Stil

| Element | Abweichung |
|---|---|
| `h1` | Schrift 30px / 600 / 31px / -1px; Familie Geist |
| `h2` | Schrift 22.5px / 600 / 23.5px / -1px; Familie Geist |
| `.display` | Familie Geist |
| `p` | Schrift 15px / 400 / 22.5px; Familie Geist |
| `.lead` | Familie Geist |
| `.eyebrow` | Schrift 12px / 500 / 18px / 0px; Familie Geist |
| `.btn--primary` | Schrift 15px / 400 / 22.5px; Familie Geist; Übergang .14s cubic-bezier(0.22, 1, 0.36, 1) |
| `.btn--secondary` | Schrift 15px / 400 / 22.5px; Familie Geist; Fläche bg-segment-active; Übergang .14s cubic-bezier(0.22, 1, 0.36, 1) |
| `.btn--ghost` | Schrift 15px / 400 / 22.5px; Familie Geist; Übergang .14s cubic-bezier(0.22, 1, 0.36, 1) |
| `.btn--pill` | Schrift 15px / 400 / 22.5px; Familie Geist; Übergang .14s cubic-bezier(0.22, 1, 0.36, 1) |
| `.btn--cta` | Schrift 15px / 550 / 22.5px; Familie Geist; Übergang .14s cubic-bezier(0.22, 1, 0.36, 1) |
| `.btn:disabled` | Schrift 15px / 400 / 22.5px; Familie Geist; Fläche bg-segment-active; Übergang .14s cubic-bezier(0.22, 1, 0.36, 1) |
| `.chip` | Schrift 15px / 400 / 22.5px; Familie Geist; Übergang .14s cubic-bezier(0.22, 1, 0.36, 1) |
| `.badge` | Schrift 12px / 400 / 18px; Familie Geist |
| `.badge-pro` | Schrift 10px / 600 / 15px / 0.5px; Familie Geist; Fläche bg-segment-active |
| `.card` | Schrift 15px / 400 / 22.5px; Familie Geist |
| `.card-grid` | Schrift 15px / 400 / 22.5px; Familie Geist |
| `.stat__label` | Schrift 14px / 400 / 21px; Familie Geist |
| `.stat__value` | Familie Geist |
| `.input` | Radius 16px; Schrift 15px / 400 / 22.5px; Familie Geist; Fläche bg-segment; Übergang .24s cubic-bezier(0.22, 1, 0.36, 1) |
| `.prompt__input` | Radius 16px; Familie Geist; Übergang .24s cubic-bezier(0.22, 1, 0.36, 1) |
| `.field label` | Schrift 14px / 400 / 21px; Familie Geist |
| `.nav-item` | Radius 8px; Schrift 15px / 400 / 22.5px; Familie Geist; Übergang .14s cubic-bezier(0.22, 1, 0.36, 1) |
| `.nav-item[aria-current]` | Radius 8px; Schrift 15px / 400 / 22.5px; Familie Geist; Fläche bg-segment-active; Übergang .14s cubic-bezier(0.22, 1, 0.36, 1) |
| `.segment` | Schrift 15px / 400 / 22.5px; Familie Geist |
| `.segment > button` | Radius 8px; Schrift 15px / 400 / 22.5px; Familie Geist; Übergang .14s cubic-bezier(0.22, 1, 0.36, 1) |
| `.segment > [aria-selected]` | Radius 8px; Schrift 15px / 400 / 22.5px; Familie Geist; Übergang .14s cubic-bezier(0.22, 1, 0.36, 1) |
| `.tile` | Schrift 15px / 400 / 22.5px; Familie Geist; Farbe text-on-tile |
| `.menu` | Radius 16px; Schrift 15px / 400 / 22.5px; Familie Geist; Fläche bg-segment |
| `.toast` | Radius 16px; Schrift 15px / 400 / 22.5px; Familie Geist; Fläche bg-segment |
| `.table th` | Schrift 14px / 400 / 21px; Familie Geist |
| `.table td` | Schrift 15px / 400 / 22.5px; Familie Geist; Rand 1px bg-segment |
| `.icon` | Schrift 15px / 400 / 22.5px; Familie Geist |
| `.icon-btn` | Schrift 15px / 400 / 22.5px; Familie Geist; Übergang .14s ease |
| `.avatar-chip` | Schrift 11.5px / 600 / 17.5px; Familie Geist; Fläche bg-segment-active; Übergang .14s ease |
| `.opt-chip` | Schrift 12.5px / 400 / 18.5px; Familie Geist; Fläche bg-segment-active; Übergang .14s ease |
| `.prompt` | Schrift 15px / 400 / 22.5px; Familie Geist; Übergang .14s ease |
| `.list-row` | Schrift 13.5px / 400 / 20px; Familie Geist |
| `.switch` | Schrift 15px / 400 / 22.5px; Familie Geist |
| `.spinner` | Schrift 15px / 400 / 22.5px; Familie Geist; Rand 2px button-primary |
| `.loader-bars` | Schrift 15px / 400 / 22.5px; Familie Geist |
| `.loader-ping` | Schrift 15px / 400 / 22.5px; Familie Geist |
| `.progress` | Schrift 15px / 400 / 22.5px; Familie Geist; Fläche bg-segment-active |
| `.skeleton--line` | Schrift 15px / 400 / 22.5px; Familie Geist; Fläche bg-segment-active |
| `.skeleton--title` | Radius 8px; Schrift 15px / 400 / 22.5px; Familie Geist; Fläche bg-segment-active |
| `.skeleton--avatar` | Schrift 15px / 400 / 22.5px; Familie Geist; Fläche bg-segment-active |
| `.steps li` | Schrift 15px / 400 / 22.5px; Familie Geist; Übergang .24s cubic-bezier(0.22, 1, 0.36, 1) |
| `.site-nav__bar` | Schrift 15px / 400 / 22.5px; Familie Geist |
| `.container` | Schrift 15px / 400 / 22.5px; Familie Geist |
| `.section` | Schrift 15px / 400 / 22.5px; Familie Geist |
| `.skip-link` | Schrift 15px / 400 / 22.5px; Familie Geist; Übergang .14s cubic-bezier(0.22, 1, 0.36, 1) |

### Light: nur Abweichungen (Farben)

| Element | Abweichung |
|---|---|
| `.btn--secondary` | Fläche bg-deep |
| `.btn:disabled` | Fläche bg-deep |
| `.chip` | Fläche bg-canvas; Rand 1px bg-active-hover |
| `.badge-pro` | Fläche bg-deep |
| `.card` | Fläche bg-canvas |
| `.input` | Rand 1px bg-active-hover |
| `.nav-item[aria-current]` | Fläche bg-deep |
| `.segment > [aria-selected]` | Fläche bg-elevated |
| `.tile` | Farbe text-on-tile |
| `.table td` | Rand 1px bg-deep |
| `.avatar-chip` | Fläche bg-deep; Rand 1px bg-active-hover |
| `.opt-chip` | Fläche bg-deep |
| `.prompt` | Fläche bg-canvas; Rand 1px bg-active-hover |
| `.spinner` | Rand 2px button-primary |
| `.progress` | Fläche bg-deep |
| `.skeleton--line` | Fläche bg-deep |
| `.skeleton--title` | Fläche bg-deep |
| `.skeleton--avatar` | Fläche bg-deep |

## 3. Wörtliche Regeln (Überlagerungen und Sonderfälle)

`components.css`

```css
.sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: var(--z-sheet); display: flex; flex-direction: column;
  width: 100%; max-width: var(--size-sheet-max, 40rem); height: var(--sheet-height, 92dvh); margin: 0 auto;
  background: var(--color-bg-panel); border-radius: var(--radius-xl) var(--radius-xl) 0 0; box-shadow: var(--shadow-sheet);
  padding-bottom: env(safe-area-inset-bottom, 0px); transform: translateY(100%); visibility: hidden; will-change: transform;
  transition: transform var(--duration-sheet) var(--ease-sheet), visibility 0s var(--duration-sheet); }
```

`components.css`

```css
.sheet__grab { touch-action: none; cursor: grab; user-select: none; padding: var(--space-3) var(--space-6) var(--space-2); }
```

`components.css`

```css
.sheet-scrim { position: fixed; inset: 0; z-index: var(--z-scrim); background: var(--color-scrim); opacity: var(--sheet-p); pointer-events: none; }
```

`components.css`

```css
.behind { --b: clamp(0, calc((var(--sheet-p) - .5) * 2), 1);
  transform: scale(calc(1 - .06 * var(--b))); transform-origin: 50% 0; border-radius: calc(var(--radius-xl) * var(--b)); overflow: hidden; }
```

`components.css`

```css
.menu { background: var(--color-bg-elevated); border-radius: var(--radius-lg); padding: var(--space-2); box-shadow: var(--shadow-menu); }
```

`modern.css`

```css
.prompt { position: relative; width: min(var(--size-prompt), calc(100vw - 2rem)); padding: .625rem; border-radius: var(--radius-panel); background: var(--color-bg-sidebar); border: 1px solid var(--color-border-default); box-shadow: var(--shadow-panel); transition: border-color var(--duration-fast) ease; }
```

`modern.css`

```css
.stage__scrim { position: absolute; inset: 0; z-index: 1; pointer-events: none; transition: opacity var(--duration-slow) var(--ease-out);
  background: radial-gradient(ellipse 62% 56% at 50% 44%, color-mix(in srgb, var(--color-bg-base) 38%, transparent), color-mix(in srgb, var(--color-bg-base) 84%, transparent) 72%),
              linear-gradient(to bottom, color-mix(in srgb, var(--color-bg-base) 28%, transparent), color-mix(in srgb, var(--color-bg-base) 94%, transparent)); }
```

`modern.css`

```css
.cta-bar { position: sticky; bottom: 0; z-index: 2; display: flex; justify-content: center; padding: 1.125rem var(--space-6) calc(1.125rem + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(to bottom, transparent, color-mix(in srgb, var(--color-bg-base) 90%, transparent) 32%, var(--color-bg-base)); }
```

`modern.css`

```css
.line-loader { position: absolute; top: -1px; left: 1.5rem; right: 1.5rem; height: 1px; overflow: hidden; border-radius: var(--radius-pill); background: var(--color-border-default); opacity: 0; transition: opacity var(--duration-fast) ease; pointer-events: none; }
```

`modern.css`

```css
.dialog { width: calc(100% - 2rem); max-width: 35rem; padding: var(--space-6); border: 1px solid var(--color-border-default); border-radius: 1.25rem; background: var(--color-bg-sidebar); color: var(--color-text-primary); box-shadow: var(--shadow-menu); }
```

`loaders.css`

```css
.js .preloader { position: fixed; inset: 0; z-index: calc(var(--z-tooltip) + 10); display: grid; place-items: center; background: var(--color-bg-deep); color: var(--color-text-primary);
  transition: transform var(--duration-sheet) var(--ease-sheet), opacity var(--duration-slow) var(--ease-out); }
```

`loaders.css`

```css
.preloader__logo { width: 4rem; height: 4rem; fill: none; stroke: var(--color-accent-brand); stroke-width: 1.5; stroke-linecap: round; }
```

`loaders.css`

```css
.progress > i { position: absolute; inset: 0; transform-origin: left; transform: scaleX(var(--p, 0)); background: var(--color-button-primary); border-radius: inherit; transition: transform var(--duration-base) var(--ease-out); }
```

`loaders.css`

```css
.btn[aria-busy="true"]::before { content: ""; width: 1em; height: 1em; border: 2px solid color-mix(in srgb, currentColor 25%, transparent); border-top-color: currentColor; border-radius: var(--radius-pill); animation: spin .8s linear infinite; }
```

`effects.css`

```css
.marquee { display: flex; overflow: hidden; -webkit-mask-image: linear-gradient(90deg, transparent, black 8%, black 92%, transparent); mask-image: linear-gradient(90deg, transparent, black 8%, black 92%, transparent); }
```

`effects.css`

```css
.ticker { animation: tick var(--duration-count) var(--ease-out) both; counter-reset: n var(--n); font-variant-numeric: tabular-nums; }
```

`effects.css`

```css
.switch span::after { content: ""; position: absolute; top: .1875rem; left: .1875rem; width: 1.25rem; height: 1.25rem; border-radius: var(--radius-pill); background: var(--color-text-primary); transition: transform var(--duration-spring) var(--ease-spring); }
```

## 4. Keyframes (wörtlich)

```css
@keyframes rise  { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
```
```css
@keyframes fade  { from { opacity: 0; } to { opacity: 1; } }
```
```css
@keyframes pop   { from { opacity: 0; transform: scale(.9); } to { opacity: 1; transform: none; } }
```
```css
@keyframes pulse { 0%, 100% { opacity: .3; transform: scale(.8); } 50% { opacity: 1; transform: scale(1); } }
```
```css
@keyframes spin-in { from { opacity: 0; transform: rotate(-60deg) scale(.8); } to { opacity: 1; transform: none; } }
```
```css
@keyframes slide-in-right { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
```
```css
@keyframes rise-spring { from { opacity: 0; transform: translateY(24px) scale(.98); } to { opacity: 1; transform: none; } }
```
```css
@keyframes from-bottom { from { transform: translateY(100%); } to { transform: none; } }
```
```css
@keyframes spin { to { transform: rotate(360deg); } }
```
```css
@keyframes bars { 0%, 100% { transform: scaleY(.3); } 50% { transform: scaleY(1); } }
```
```css
@keyframes star { 0% { transform: rotate(0) scale(.9); } 50% { transform: rotate(180deg) scale(1.08); } 100% { transform: rotate(360deg) scale(.9); } }
```
```css
@keyframes ping { 0% { transform: scale(1); opacity: .6; } 100% { transform: scale(3); opacity: 0; } }
```
```css
@keyframes shimmer-text { to { background-position: -20% 0; } }
```
```css
@keyframes sweep-x { to { transform: translateX(100%); } }
```
```css
@keyframes slide-x { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
```
```css
@keyframes draw { to { stroke-dashoffset: 0; } }
```
```css
@keyframes scale-in { from { opacity: 0; transform: scale(.94); } to { opacity: 1; transform: none; } }
```
```css
@keyframes blur-in { from { opacity: 0; filter: blur(10px); transform: translateY(6px); } to { opacity: 1; filter: none; transform: none; } }
```
```css
@keyframes clip-up { from { clip-path: inset(100% 0 0 0); transform: translateY(12px); } to { clip-path: inset(0); transform: none; } }
```
```css
@keyframes from-left { from { opacity: 0; transform: translateX(-24px); } to { opacity: 1; transform: none; } }
```
```css
@keyframes from-right { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: none; } }
```
```css
@keyframes mask-up { from { transform: translateY(110%); } to { transform: none; } }
```
```css
@keyframes marquee { to { transform: translateX(-100%); } }
```
```css
@keyframes tick { from { --n: 0; } to { --n: var(--to, 100); } }
```
```css
@keyframes grow-x { to { transform: scaleX(1); } }
```
```css
@keyframes sweep { 0% { transform: translateX(-120%); } 100% { transform: translateX(340%); } }
```
```css
@keyframes drift { to { transform: rotate(360deg); } }
```
