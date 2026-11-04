import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = (path) => fs.readFile(new URL(path, import.meta.url), 'utf8');
const files = await read('../web/src/views/Files.svelte');
const stores = await read('../web/src/lib/stores.js');
const toast = await read('../web/src/components/ToastHost.svelte');
const css = await read('../web/src/styles/app.css');

test('Auswahl: Klick, Shift-Bereich und Strg/Cmd-Umschalten', () => {
  assert.match(files, /function selectRange\(index\)/);
  assert.match(files, /event\.shiftKey/);
  assert.match(files, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(files, /function onItemClick\(event, item, index\)/);
  assert.match(files, /on:dblclick=\{\(\) => openItem\(item\)\}/);
});

test('Kontextmenü: Rechtsklick, Long-Press und ZIP-Aktionen', () => {
  assert.match(files, /on:contextmenu=\{\(event\) => showMenu\(event, item\)\}/);
  assert.match(files, /function startLongPress\(event, item\)/);
  assert.match(files, /pointerdown/);
  assert.match(files, /menuAction\('zipDownload'\)/);
  assert.match(files, /menuAction\('zipCreate'\)/);
  assert.match(files, /menuAction\('extract'\)/);
});

test('Internes Drag-and-drop auf Ordner und Breadcrumbs', () => {
  assert.match(files, /application\/x-onebox-nodes/);
  assert.match(files, /function onInternalDragStart/);
  assert.match(files, /function onNodeDrop/);
  assert.match(files, /function onCrumbDrop/);
  assert.match(files, /await moveNodes\(/);
  assert.match(css, /\.file-row\.is-drop/);
  assert.match(css, /\.crumb\.is-drop/);
});

test('Tastaturkürzel inklusive Hilfe und Suche', () => {
  for (const token of ["key === 'Delete'", "key === 'F2'", "key === 'Enter'", "key === ' '", "key === '/'", "key === '?'"]) {
    assert.ok(files.includes(token), `Shortcut fehlt: ${token}`);
  }
  assert.match(files, /key\.toLowerCase\(\) === 'c'/);
  assert.match(files, /key\.toLowerCase\(\) === 'x'/);
  assert.match(files, /key\.toLowerCase\(\) === 'v'/);
  assert.match(files, /function focusRow/);
  assert.match(files, /<Dialog open=\{helpOpen\} title="Tastaturkürzel"/);
  assert.match(css, /\.shortcut-keys kbd/);
});

test('Löschen bietet Rückgängig über Toast und Restore-Endpunkt', () => {
  assert.match(stores, /export function notify\(message, kind = 'info', timeout = 4200, action = null\)/);
  assert.match(stores, /export function runToastAction/);
  assert.match(toast, /toast\.action\.label/);
  assert.match(files, /function undoTrash\(stamp\)/);
  assert.match(files, /label: 'Rückgängig'/);
  assert.match(files, /\/api\/v1\/files\/trash\/restore/);
});

test('Ansicht und Sortierung stehen in der URL', () => {
  assert.match(files, /function syncUrl\(\)/);
  assert.match(files, /searchParams\.set\('view'/);
  assert.match(files, /searchParams\.set\('sort'/);
  assert.match(files, /searchParams\.set\('dir'/);
  assert.match(files, /addEventListener\('popstate'/);
});

test('Mobil: Bottom-Sheet und größere Touch-Ziele', () => {
  assert.match(files, /menu-pop--sheet/);
  assert.match(css, /\.menu-pop--sheet \{[^}]*bottom: 0/);
  assert.match(css, /\.menu-pop--sheet \.menu-item \{[^}]*min-height: 3rem/);
});
