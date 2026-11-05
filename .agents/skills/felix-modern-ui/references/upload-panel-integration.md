# Upload-Fenster in die App einbauen (für Coding-Agenten)

Ziel: Sobald Dateien hochgeladen werden, erscheint unten rechts ein Fenster mit Fortschritt je Datei (Schritt-Loader), Gesamtprozent und geschätzter Restzeit. Referenz zum Ansehen: `upload-single-page.html` (eigenständig, Bausteine mit `>>>>> BEGIN` / `<<<<< END` markiert). Vollständige Beschreibung: `references/upload-panel.md` im Skill.

## Dateien

- `felix-loaders.css` und `felix-loaders.js` enthalten das Upload-Fenster samt Loader (alles Nötige, 44 Design-Tokens im `:root`-Block).
- Oder einzeln: `upload-panel.css` + `upload-panel.js` (brauchen zusätzlich `motion.css` und `loaders.css` für Drehung, Einblenden und Schimmer-Text).

## Agenten-Prompt (kopieren)

```text
AUFGABE: Baue ein Upload-Fenster unten rechts ein, das bei jedem Datei-Upload der App erscheint.

ANFORDERUNGEN
1. Sobald der erste Upload startet, öffnet sich ein Fenster unten rechts (am Handy: breite Karte am unteren Rand). Es zeigt:
   - Kopf: „Lädt hoch · 2 von 5“, Gesamtprozent, geschätzte Restzeit („noch etwa 2 Min. 10 Sek.“, ab ~1,5 s Messzeit, vorher „Berechne Dauer …“) und Geschwindigkeit.
   - Gesamtbalken, nach Bytes gewichtet.
   - Liste ALLER Dateien als Schritte: wartet (leerer Ring), lädt (drehender Ring + Prozent + dünne Linie), fertig (grüner Haken), Fehler (rotes Kreuz + „Erneut versuchen“), abgebrochen.
   - Einklappen, und Abbrechen mit zweistufiger Bestätigung („Wirklich abbrechen?“).
   - Am Ende „Alle Dateien hochgeladen“, schließt nach 6 s (nicht solange Maus oder Fokus im Fenster sind). Mit Fehlern bleibt es offen.
2. Verwende die mitgelieferten Dateien (felix-loaders.css und felix-loaders.js) unverändert. Passe nur die Design-Tokens im :root-Block an die Tokens der App an (Namen mappen, nichts hartkodieren).
3. Alle Upload-Wege der App laufen durch EINE Funktion, die UploadPanel.uploadFiles(files, { url, field, headers, concurrency: 3, withCredentials: true }) nutzt. Keine zweite Upload-Logik daneben. Drag-and-drop, „Dateien auswählen“ und Einfügen aus der Zwischenablage rufen diese Funktion auf.
4. Das Panel wird einmal global im Layout erzeugt: const up = UploadPanel.create({ lang: 'de-DE' }). Nur im Browser (in SvelteKit in onMount, nie beim Serverrendern).
5. Gib immer die echte Dateigröße mit (file.size). Ohne Größe gibt es weder Prozent noch Restzeit.
6. Fehler: Netzwerkfehler und HTTP-Fehler zeigt das Fenster pro Datei mit „Erneut versuchen“. Fehler vor dem Upload (Datei zu groß, falscher Typ) werden direkt an der Ablagefläche gemeldet und gar nicht erst ins Fenster gelegt.
7. Barrierefreiheit: Das Fenster ist ein region mit Ansagen in 10-%-Schritten, alle Knöpfe haben aria-label, bei „Bewegung reduzieren“ drehen die Ringe nicht. Prüfe das mit emulierter reduzierter Bewegung.

BACKEND (falls Fastify)
- @fastify/multipart verwenden, Datei als Stream auf die Platte schreiben (nicht in den Speicher laden), limits.fileSize passend setzen, Content-Length wird vom Browser mitgesendet.
- Hinter nginx oder einem anderen Reverse-Proxy: proxy_request_buffering off und client_max_body_size passend setzen, sonst puffert der Proxy den Upload und der Fortschritt springt (erst schnell, dann langsam).
- Fehler mit sinnvollem Statuscode beantworten (413 zu groß, 415 Typ, 507 Speicher voll), das Fenster zeigt „Fehler <Code>“.
- Für sehr große Dateien optional später: Upload in Teilen mit Wiederaufnahme. Das Fenster unterstützt das, wenn die Teile als eine Datei gemeldet werden (progress mit Gesamtbytes).

SVELTE
- CSS in +layout.svelte importieren. UploadPanel als Modul exportieren (am Ende von felix-loaders.js export { UploadPanel } ergänzen, window-Zuweisung entfernen) und in einem Store oder Kontext bereitstellen.
- Beispiel: const up = UploadPanel.create(); function onFiles(files){ UploadPanel.uploadFiles(files, { url: '/api/files', panel: up, withCredentials: true }); }

TESTS (müssen grün sein)
- Playwright: 3 Dateien (z. B. 6, 4, 2 MB) gegen den Dev-Server hochladen: Fenster erscheint, Gesamtprozent steigt monoton, Restzeit erscheint nach ~2 s, am Ende „Alle Dateien hochgeladen“, Fenster schließt von selbst.
- Fehlerfall (Server antwortet 500): Zeile zeigt Fehler und „Erneut versuchen“, Fenster bleibt offen. Abbrechen: zwei Klicks, laufende Uploads brechen ab (XHR abort), Server-Datei wird verworfen.
- 390 px Breite: kein horizontales Scrollen, Fenster bleibt komplett sichtbar. Keine Konsolenfehler.

ABGABE: geänderte Dateien nennen, Screenshots (aktiv, Fehler, fertig, mobil) zeigen, Testergebnis berichten.
```

## Hinweise

- Das Fenster zeigt nur, was der Browser meldet: gesendete Bytes. Der Server kann danach noch verarbeiten (Thumbnails, Virenscan). Wenn das lange dauert, zusätzlich pro Datei einen zweiten Schritt „Verarbeite …“ ergänzen (Zustand `active` bleibt, `meta` zeigt den Text), erst danach `done` aufrufen.
- Auf dem Server fertige Dateien nie „blind“ als fertig melden: `done` erst nach der HTTP-Antwort 2xx (macht `uploadFiles` so).
