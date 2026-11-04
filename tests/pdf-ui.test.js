import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = (path) => fs.readFile(new URL(path, import.meta.url), 'utf8');
const viewer = await read('../web/src/components/PdfViewer.svelte');
const preview = await read('../web/src/components/FilePreview.svelte');

test('pdfjs wird lazy geladen und führt keine Skripte aus', () => {
  assert.match(viewer, /await import\('pdfjs-dist'\)/);
  assert.match(viewer, /pdf\.worker\.min\.mjs\?url/);
  assert.match(viewer, /enableScripting: false/);
  assert.match(viewer, /isEvalSupported: false/);
  assert.doesNotMatch(viewer, /https?:\/\//);
});

test('Seiten sind virtualisiert und werden erst bei Sichtbarkeit gerendert', () => {
  assert.match(viewer, /IntersectionObserver/);
  assert.match(viewer, /rootMargin: '400px 0px'/);
  assert.match(viewer, /function renderPage\(index\)/);
  assert.match(viewer, /renderVisible\(\)/);
  assert.match(viewer, /ResizeObserver/);
});

test('Navigation, Zoom, Suche, Download und Tastatur', () => {
  assert.match(viewer, /function goToPage\(page\)/);
  assert.match(viewer, /zoomMode === 'width'/);
  assert.match(viewer, /zoomMode === 'page'/);
  assert.match(viewer, /async function runSearch\(\)/);
  assert.match(viewer, /stepMatch\(-1\)/);
  assert.match(viewer, /\?download=1/);
  assert.match(viewer, /event\.key === 'ArrowRight'/);
  assert.match(viewer, /event\.key === 'Escape'/);
  assert.match(viewer, /key\.toLowerCase\(\) === 'f'/);
});

test('Fehlerzustand bietet erneut versuchen und Download', () => {
  assert.match(viewer, /PDF konnte nicht dargestellt werden/);
  assert.match(viewer, /onclick=\{load\}>Erneut versuchen/);
  assert.match(viewer, /href=\{`\$\{contentUrl\}\?download=1`\}>Datei herunterladen/);
});

test('Vorschau nutzt den PdfViewer statt eines iframe', () => {
  assert.match(preview, /import PdfViewer/);
  assert.match(preview, /<PdfViewer \{node\} \{contentUrl\} \{onclose\} \/>/);
  assert.doesNotMatch(preview, /<iframe/);
});
