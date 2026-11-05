# Bewegung: Rezepte

> Loader, Preloader und Effekt-Klassen (Maske, Ticker, Marquee, Kreis-Reveal) stehen in `references/loaders.md`.

Grundsatz: Bewegung erklärt einen Zustandswechsel (etwas erscheint, wird geladen, öffnet sich). Sie ist nie Dekoration. Erlaubt sind Opacity, `translate` und Skalierung bis etwa 10 %. Dauer 120–300 ms mit `--ease-out`, bewegte Ebenen 500 ms mit `--ease-sheet` oder `--ease-spring` (siehe Abschnitt Apple-Gefühl). Schleifen nur für Laden und Streaming. Alle CSS-Klassen stehen in `assets/motion.css`. Die Dauern sind Empfehlungen [E], nicht aus Screenshots gemessen.

| Element | Auslöser | Effekt | Dauer |
|---|---|---|---|
| Nachricht, Karte | wird eingefügt | `rise`: 8 px nach oben + Opacity | 300 ms |
| Chips beim Laden | Seitenstart | `.stagger` mit `--i`, 60 ms Versatz | 300 ms |
| Antworttext | Streaming | pro Wort `.w` (Opacity), alle ~35 ms ein Wort, `.caret` am Ende | 200 ms |
| Warten auf Antwort | Anfrage läuft | `.dots` (versetzt pulsierend) + Statuszeile mit Sekundenzähler | Schleife 1,2 s |
| Button, Chip | Hover / Druck | Fläche eine Stufe heller, Druck `scale(.98)` | 120 ms |
| Icon-Wechsel (Kopieren zu Haken) | Klick | `.anim-pop` auf dem neuen Icon | 120 ms |
| Popup-Menü | öffnen | `.pop-menu.open`: Fade + 4 px | 150 ms |
| Sheet, Panel, Sidebar (mobil) | öffnen | `transform` von außen nach innen, `visibility` verzögert | 300 ms |
| Artefakt-Panel (Desktop) | öffnen | `grid-template-columns` auf Panelbreite, Inhalt gleitet 16 px ein | 300 ms |
| Hero zu Chat | erste Nachricht | Titel und Chips: `max-height` und Opacity auf 0, Thread bekommt `flex-grow` | 300 ms |
| Skeleton zu Inhalt | Daten da | `.skeleton` pulsiert, danach `.ready` am Container, `.rv`-Kinder gestaffelt | 300 ms + 90 ms Versatz |
| Logo im Hero | Seitenstart | `.anim-spin-in` | 300 ms |

## Rezept: Text wortweise streamen

```js
const p = document.querySelector('.prose'), caret = document.createElement('span');
caret.className = 'caret'; p.append(caret);
const words = text.split(' '); let i = 0;
const iv = setInterval(() => {
  if (i < words.length) {
    const w = document.createElement('span'); w.className = 'w';
    w.textContent = (i ? ' ' : '') + words[i++]; p.insertBefore(w, caret);
  } else { clearInterval(iv); caret.remove(); }
}, 34);
```

## Rezept: Skeleton, dann gestaffelter Inhalt

```html
<div id="box"><div class="sk"><b class="skeleton"></b><b class="skeleton"></b></div>
  <h2 class="rv" style="--i:0">Titel</h2><p class="rv" style="--i:1">Text</p></div>
<script>setTimeout(() => box.classList.add('ready'), 1100);</script>
```

Der Skeleton muss dieselbe Größe wie der Zielinhalt haben, damit nichts springt.

## Rezept: Zustandswechsel per Layout

Zwei Zustände über `data-state` am Container (`hero`, `chat`), alle Übergänge in CSS (`transition: flex-grow, max-height, opacity`). JavaScript setzt nur das Attribut. So bleiben Animationen rückbaubar und `prefers-reduced-motion` greift automatisch.

## Verboten

Parallax, Bounce und Overshoot, Rotation außer dem Logo-Einstieg, Animationen über 300 ms (außer Lade-Schleifen), Animationen von `width` oder `height` auf großen Flächen (stattdessen `transform` oder `grid-template-columns`), Hintergrund-Verläufe, die sich bewegen.


## Apple-Gefühl: Gesten, Federn, Ebenen

Fünf Prinzipien, die iOS-Animationen ausmachen:

1. **Direkte Manipulation.** Während des Ziehens gibt es keine Transition. Das Element sitzt 1:1 unter dem Finger (`.dragging { transition: none }`, Position per `transform`).
2. **Impuls beim Loslassen.** Entscheidend ist, wohin die Geste ausrollen würde: `Zielposition = Position + Geschwindigkeit × 200 ms`, dann zum nächsten Detent oder zu „zu“. Ein kurzer schneller Wisch schließt, ein langsames Ziehen kaum.
3. **Gummiband.** Über das Ende hinaus wird der Weg gedämpft: `(1 − 1/((x·0,55)/d + 1)) · d` mit `d` etwa 120 px. Nie hart anschlagen.
4. **Unterbrechbar.** Greift der Finger während der Animation zu, wird die aktuelle Position aus `getComputedStyle(el).transform` gelesen und eingefroren. Nie eine Animation „zu Ende laufen lassen“, die der Nutzer anhält.
5. **Ebenen statt Seitenwechsel.** Neues kommt von unten (Sheet) oder von rechts (Push) und die alte Ebene weicht zurück: Skalierung auf 0,94 und runde Ecken (`.behind` plus `--sheet-p`) oder 30 % Versatz nach links mit weniger Deckkraft (`.view[data-state="behind"]`).

| Element | Effekt | Dauer / Kurve |
|---|---|---|
| Bottom-Sheet | `translateY`, Detents, Scrim-Opacity und Seiten-Skalierung gekoppelt über `--sheet-p` | `--duration-sheet`, `--ease-sheet` |
| Drawer, Sidebar mobil | `translateX` von außen, Scrim blendet mit | `--duration-sheet`, `--ease-sheet` |
| Push-Ansicht | `.view` mit `data-state` `ahead` → `current` → `behind` | `--duration-sheet`, `--ease-sheet` |
| Druck-Feedback | `.pressable`: `scale(.96)` in 80 ms, Rückfeder | `--duration-spring`, `--ease-spring` |
| Aufspringen (Nachricht, Toast, Mini-Player) | `.anim-rise-spring`: 24 px von unten, leicht überschwingend | `--duration-spring`, `--ease-spring` |

`--ease-spring` ist eine CSS-`linear()`-Kurve (gedämpfte Feder, etwa 4 % Überschwingen, nach 500 ms ruhig) mit einem `cubic-bezier`-Fallback für ältere Browser. `--ease-sheet` ist die bekannte iOS-Modal-Kurve `cubic-bezier(.32,.72,0,1)`. Die Werte sind Empfehlungen [E] und kommen nicht aus Messungen der Claude-App.

### Rezept: Fortschritt über CSS-Variable koppeln

`@property --sheet-p` (Typ `<number>`) macht die Variable animierbar. `:root { transition: --sheet-p … }` lässt sie parallel zum Sheet laufen, Scrim und Seite lesen sie nur (`opacity: var(--sheet-p)`, `scale(calc(1 - .06 * var(--b)))`). Beim Ziehen setzt JS die Variable direkt und schaltet die Transition mit `.sheet-dragging` am `<html>` ab.

### Rezept: Geteiltes Element (FLIP) für „Karte wird zur Detailansicht“

```js
const first = el.getBoundingClientRect();     // 1. Start messen
el.classList.add('is-detail');                // 2. Endzustand setzen
const last = el.getBoundingClientRect();      // 3. Ende messen
el.animate([{ transform: `translate(${first.left - last.left}px, ${first.top - last.top}px) scale(${first.width / last.width})` },
            { transform: 'none' }], { duration: 500, easing: 'cubic-bezier(.32,.72,0,1)' });
```

### Nicht übertreiben

Springs und Sheets nur für Ebenenwechsel und Berührung einsetzen. Inhalte, die sich bei jedem Klick neu zusammensetzen (Tabellen, Listen), bleiben bei kurzen Fades. Wirkt etwas „hüpfig“, erst den Überschwinger entfernen (`--ease-sheet` statt `--ease-spring`).
