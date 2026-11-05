# Upload-Fenster (unten rechts): Fortschritt je Datei, Gesamtprozent, Restzeit

Dateien: `assets/upload-panel.css`, `assets/upload-panel.js` (stecken auch in `dist/felix-ui.*` und `dist/felix-loaders.*`). Demo: `assets/templates/upload.src.html`. Einbau-Anleitung mit fertigem Agenten-Prompt: `UPLOAD-PANEL-INTEGRATION.md`.

## Verhalten

- Erscheint, sobald die erste Datei hinzugefügt wird (Einblenden von unten rechts, 380 ms), auf dem Handy als breite Karte am unteren Rand.
- **Kopf:** „Lädt hoch · 2 von 5“, darunter fett die Gesamtprozent, die geschätzte Restzeit („noch etwa 2 Min. 10 Sek.“) und die Geschwindigkeit. Davor: „Berechne Dauer …“ mit Schimmer, bis genug Messwerte da sind (ab 1,5 s). Unter 3 s: „gleich fertig“.
- **Gesamtbalken:** gewichtet nach Bytes, nicht nach Dateianzahl. Prozent und Restzeit beziehen sich auf alle Dateien zusammen.
- **Liste:** jede Datei als Schritt im Stil von `.steps`: leerer Ring (wartet), drehender Ring plus Prozent und dünne Linie (lädt), Haken (fertig), rotes Kreuz mit „Erneut versuchen“ (Fehler), gestrichelter Ring (abgebrochen).
- **Einklappen:** Pfeil im Kopf klappt die Liste zu, Prozent und Restzeit bleiben sichtbar.
- **Abbrechen:** X im Kopf. Während des Uploads erst „Wirklich abbrechen?“ (3 s), zweiter Klick bricht alle ab. Ist nichts aktiv, schließt es das Fenster.
- **Ende:** „Alle Dateien hochgeladen“, Balken grün, Fenster schließt nach 6 s (nicht solange die Maus darüber liegt oder der Fokus darin ist). Mit Fehlern bleibt es offen.
- **Barrierefreiheit:** `role="region"`, Gesamtbalken mit `role="progressbar"`, Ansagen für Screenreader nur in 10-Prozent-Schritten und beim Ende, alle Knöpfe mit `aria-label`, bei reduzierter Bewegung stehen die drehenden Ringe still.

## API (alles in `UploadPanel`)

```js
const up = UploadPanel.create({ lang: 'de-DE', closeAfterMs: 6000, texts: { title: 'Lädt hoch' } });
const id = up.add({ name: 'urlaub.zip', size: 52428800 });  // Zeile anlegen, Fenster öffnen
up.start(id); up.progress(id, geladeneBytes); up.done(id); up.fail(id, 'Verbindung unterbrochen'); up.cancel(id);
up.onCancel = id => {}; up.onRetry = id => {}; up.onCancelAll = () => {}; up.onClose = () => {};
UploadPanel.uploadFiles(files, { url: '/api/upload', field: 'file', headers: {}, concurrency: 3, withCredentials: true, formData: file => new FormData(), panel: up });
```

`uploadFiles` nutzt `XMLHttpRequest`, weil `fetch` keinen Upload-Fortschritt meldet. Es hält höchstens `concurrency` Uploads gleichzeitig, kann abbrechen und Fehler erneut versuchen. Texte lassen sich über `texts` übersetzen.

## Schätzung der Restzeit (so rechnet es)

Geschwindigkeit = gleitender Mittelwert (75 % alt, 25 % neu) der Bytes pro Sekunde über alle Dateien, alle 500 ms gemessen. Restzeit = (Gesamtbytes − geladene Bytes) ÷ Geschwindigkeit. Sie wird erst nach 1,5 s angezeigt und nie als Genauigkeitsversprechen formuliert („noch etwa“). Hinter Reverse-Proxys, die Uploads puffern, springt der Fortschritt zuerst schnell und wird dann langsam, weil der Browser nur meldet, was an den Proxy gesendet wurde. Abhilfe steht in der Integrations-Anleitung.

## Regeln

- Genau ein Upload-Fenster pro App, global im Layout, nicht pro Seite.
- Dateigrößen immer mitgeben (`size`), sonst gibt es keine Prozent und keine Restzeit.
- Keine erfundenen Werte: ohne Messung steht „Berechne Dauer …“.
- Das Fenster ersetzt nicht die Fehlermeldung am Ort der Aktion (zum Beispiel „Datei zu groß“ schon vor dem Upload an der Ablagefläche).
