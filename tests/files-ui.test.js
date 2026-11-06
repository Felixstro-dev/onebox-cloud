import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = (path) => fs.readFile(new URL(path, import.meta.url), 'utf8');
const files = await read('../web/src/views/Files.svelte');
const selectionBar = await read('../web/src/components/SelectionBar.svelte');
const bottomLayer = await read('../web/src/components/BottomLayer.svelte');
const app = await read('../web/src/App.svelte');
const css = await read('../web/src/styles/app.css');

test('Auswahlleiste: Aufheben und Löschen sind echte Click-Handler', () => {
  // Regression: In Svelte 5 lösten die Buttons nur mit `on:click` im
  // Komponenten-Prop nicht aus, weil Button den Handler als `onclick` erwartet.
  assert.match(selectionBar, /onclick=\{\$selectionBar\.onClear\}>Aufheben<\/Button>/);
  assert.match(selectionBar, /onclick=\{\$selectionBar\.onTrash\}/);
  assert.doesNotMatch(selectionBar, /<Button[^>]*on:click=/);
  assert.doesNotMatch(files, /<Button[^>]*on:click=/);
  assert.match(css, /\.bottom-stack > \* \{[^}]*pointer-events:\s*auto/);
  assert.match(css, /\.bottom-layer \{[^}]*z-index:\s*68/);
});

test('Auswahlleiste lebt im gemeinsamen Bottom-Layer', () => {
  assert.match(bottomLayer, /<SelectionBar \/>/);
  assert.match(bottomLayer, /<UploadPanel \/>/);
  assert.match(app, /<ToastHost \/>/);
  assert.match(files, /selectionBar\.set\(/);
  assert.doesNotMatch(files, /class="selection-bar"/);
});

test('Dateiliste nutzt Browser-Virtualisierung und lädt seitenweise', () => {
  assert.match(css, /\.file-row \{[^}]*content-visibility:\s*auto/);
  assert.match(css, /\.file-tile \{[^}]*content-visibility:\s*auto/);
  assert.match(files, /limit=100/);
  assert.match(files, /nextCursor/);
});

test('Checkbox-Labels bewahren die Mehrfachauswahl', () => {
  assert.match(files, /closest\?\.\('\input\[type="checkbox"\], \.file-row__check, \.file-tile__check'\)/);
});

test('Dateiliste bietet serverseitige Suche mit URL-Filter', () => {
  assert.match(files, /id="files-search"/);
  assert.match(files, /bind:value=\{searchQuery\}/);
  assert.match(files, /q=\$\{query\}/);
  assert.match(files, /url\.searchParams\.set\('q', searchQuery\.trim\(\)\)/);
});
