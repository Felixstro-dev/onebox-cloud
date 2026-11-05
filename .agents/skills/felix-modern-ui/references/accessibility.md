# Barrierefreiheit und Kontrast

Gemessen mit `python scripts/contrast.py` (WCAG-Formel) aus den aktuellen Tokens. Text braucht mindestens 4,5:1, Grafiken und Icons mindestens 3:1. Das Skript gibt Exit-Code 1 aus, wenn ein Text-Paar darunter fällt, und eignet sich als Test nach jeder Token-Änderung.

## Dark (Standard)

| Vordergrund | Hintergrund | Verhältnis | Nutzung |
|---|---|---|---|
| text-primary | bg-base | 15.57 | Text erlaubt |
| text-primary | bg-sidebar | 14.59 | Text erlaubt |
| text-primary | bg-elevated | 11.69 | Text erlaubt |
| text-primary | bg-active | 9.18 | Text erlaubt |
| text-secondary | bg-base | 6.25 | Text erlaubt |
| text-secondary | bg-sidebar | 5.86 | Text erlaubt |
| text-secondary | bg-elevated | 4.69 | Text erlaubt |
| text-secondary | bg-panel | 5.80 | Text erlaubt |
| text-on-primary | button-primary | 15.29 | Text erlaubt |
| accent-blue | bg-base | 6.38 | Text erlaubt |
| text-on-tile | tile-slides | 10.34 | Text erlaubt |
| text-tertiary | bg-base | 3.50 | nur Deko, Disabled, Icons |
| accent-orange | bg-base | 5.63 | nur Logo und Lade-Punkte (Grafik, mind. 3:1) |

## Light (`data-theme="light"`)

| Vordergrund | Hintergrund | Verhältnis | Nutzung |
|---|---|---|---|
| text-primary | bg-base | 17.50 | Text erlaubt |
| text-primary | bg-sidebar | 15.87 | Text erlaubt |
| text-primary | bg-elevated | 18.43 | Text erlaubt |
| text-primary | bg-active | 14.73 | Text erlaubt |
| text-secondary | bg-base | 6.26 | Text erlaubt |
| text-secondary | bg-sidebar | 5.67 | Text erlaubt |
| text-secondary | bg-elevated | 6.59 | Text erlaubt |
| text-secondary | bg-panel | 5.98 | Text erlaubt |
| text-on-primary | button-primary | 17.50 | Text erlaubt |
| accent-blue | bg-base | 5.81 | Text erlaubt |
| text-on-tile | tile-slides | 10.34 | Text erlaubt |
| text-tertiary | bg-base | 3.47 | nur Deko, Disabled, Icons |
| accent-orange | bg-base | 4.01 | nur Logo und Lade-Punkte (Grafik, mind. 3:1) |

## Modern (`data-style="modern"`, Dark-only)

| Vordergrund | Hintergrund | Verhältnis | Nutzung |
|---|---|---|---|
| text-primary | bg-base | 18.50 | Text erlaubt |
| text-primary | bg-sidebar | 17.18 | Text erlaubt |
| text-primary | bg-elevated | 15.79 | Text erlaubt |
| text-primary | bg-active | 13.94 | Text erlaubt |
| text-secondary | bg-base | 7.65 | Text erlaubt |
| text-secondary | bg-sidebar | 7.11 | Text erlaubt |
| text-secondary | bg-elevated | 6.53 | Text erlaubt |
| text-secondary | bg-panel | 7.11 | Text erlaubt |
| text-on-primary | button-primary | 18.86 | Text erlaubt |
| accent-blue | bg-base | 7.01 | Text erlaubt |
| text-on-tile | tile-slides | 10.34 | Text erlaubt |
| text-tertiary | bg-base | 4.07 | nur Deko, Disabled, Icons |
| accent-orange | bg-base | 6.18 | nur Logo und Lade-Punkte (Grafik, mind. 3:1) |

## Folgen für die Praxis

- `--color-text-tertiary` erreicht in keinem Theme 4,5:1. Es ist nur für Deaktiviertes und Deko gedacht, nie für Text, den man lesen muss (Platzhalter in Eingaben nutzen deshalb `text-secondary`).
- `--color-text-secondary` ist ab `bg-elevated` knapp (4,7:1 im Dark-Theme). Auf `bg-active` oder heller nicht mehr einsetzen, dort `text-primary` nehmen.
- Im Modern-Stil ist `--color-text-tertiary` mit 4,1:1 etwas besser, bleibt aber Deko. Die kleinen Zeilen („eyebrow“, Credit-Hinweis) nutzen deshalb `text-secondary`, auch wenn die Vorlage der ZIP dort einen noch dunkleren Ton hatte.
- Orange (`--color-accent-brand`) ist nur für Logo, Lade-Punkte und Streaming-Punkt gedacht. Im Light-Theme ist es abgedunkelt, damit es 3:1 hält. Nie als Textfarbe.
- Text auf Kategorie-Kacheln nutzt `--color-text-on-tile`, weil die Kacheln in beiden Themes dunkel bleiben.
- Status-Farben (`success`, `warning`, `error`) haben im Light-Theme eigene dunklere Werte. Status nie nur über Farbe zeigen: immer Icon plus Text.

## Pflichtliste

1. Sichtbarer Focus-Ring (`:focus-visible`, 2 px) auf allem Bedienbaren. Bei versteckten Inputs auf den Container legen (`:has(:focus-visible)`).
2. Alle Icon-Buttons mit `aria-label`. Dekorative Icons `aria-hidden="true"`.
3. Touch-Ziele mindestens 44 × 44 px (`--size-touch`).
4. `prefers-reduced-motion`: gilt in `tokens.css` für alle CSS-Animationen und Übergänge, auch für Sheets. Von JavaScript getaktete Effekte (zum Beispiel wortweises Streaming) müssen `matchMedia('(prefers-reduced-motion: reduce)')` selbst prüfen, wie in `chat.src.html`.
5. Modale Elemente (Sheet, Dialog): `role="dialog"`, `aria-modal`, Fokus hinein, Escape schließt, Fokus zurück. `sheet.js` erledigt das. Dahinterliegender Inhalt ist `inert`.
6. Seitentitel als `h1`, Reihenfolge der Überschriften ohne Sprünge. Nachrichtenverläufe `role="log"`.
7. Information nie nur über Farbe, Bewegung oder Gesten: Jede Wischgeste braucht einen sichtbaren Button als Alternative (zum Beispiel Schließen im Sheet-Kopf).
