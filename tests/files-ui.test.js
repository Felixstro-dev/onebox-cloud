import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const files = await fs.readFile(new URL('../web/src/views/Files.svelte', import.meta.url), 'utf8');
const css = await fs.readFile(new URL('../web/src/styles/app.css', import.meta.url), 'utf8');

test('Auswahlleiste: Aufheben und Löschen sind echte Click-Handler', () => {
  // Regression: In Svelte 5 lösten die Buttons nur mit `on:click` im
  // Komponenten-Prop nicht aus, weil Button den Handler als `onclick` erwartet.
  assert.match(files, /<Button[^>]*onclick=\{resetSelection\}>Aufheben<\/Button>/);
  assert.match(files, /<Button[^>]*onclick=\{trashSelection\}>Löschen<\/Button>/);
  assert.doesNotMatch(files, /<Button[^>]*on:click=/);
  assert.match(css, /\.selection-bar \{[^}]*pointer-events:\s*auto/);
  assert.match(css, /\.selection-bar \{[^}]*z-index:\s*65/);
});

test('Dateiliste nutzt Browser-Virtualisierung und lädt seitenweise', () => {
  assert.match(css, /\.file-row \{[^}]*content-visibility:\s*auto/);
  assert.match(css, /\.file-tile \{[^}]*content-visibility:\s*auto/);
  assert.match(files, /limit=100/);
  assert.match(files, /nextCursor/);
});
