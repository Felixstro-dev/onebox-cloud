import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onebox-pagination-test-'));
process.env.DATA_DIR = dataDir;
process.env.FILES_DIR = path.join(dataDir, 'files');
process.env.LOG_LEVEL = 'silent';
process.env.WEB_DIR = path.join(dataDir, 'web');

const { runMigrations, db, schema } = await import('../server/db/index.js');
const { id } = await import('../server/lib/ids.js');
const { nameKey, mimeOf } = await import('../server/lib/names.js');

await runMigrations();
const { buildApp } = await import('../server/app.js');
const app = await buildApp({ logger: false });

let cookie = '';
const post = (url, payload) => app.inject({ method: 'POST', url, payload, headers: { cookie, 'x-onebox-csrf': '1' } });
const get = (url) => app.inject({ method: 'GET', url, headers: { cookie, 'x-onebox-csrf': '1' } });

async function setup() {
  const result = await app.inject({
    method: 'POST',
    url: '/api/v1/system/setup',
    payload: { username: 'pager', password: 'super-secret-pass', displayName: 'Pager' },
    headers: { 'x-onebox-csrf': '1' },
  });
  assert.equal(result.statusCode, 200, result.payload);
  cookie = result.headers['set-cookie'].split(';')[0];
}

function insertNode({ parentId, name, kind = 'file', size = 10, createdAt = Date.now(), mime = null }) {
  const nodeId = id();
  db.insert(schema.nodes).values({
    id: nodeId,
    ownerId: db.select().from(schema.users).get().id,
    parentId: parentId || null,
    kind,
    name,
    nameKey: nameKey(name),
    size,
    mime: mime || (kind === 'folder' ? 'inode/directory' : mimeOf(name)),
    createdAt,
    updatedAt: createdAt,
  }).run();
  return nodeId;
}

async function walkPages(folderId, { limit = 50, sort = 'name', dir = 'asc', extra = '' } = {}) {
  const ids = [];
  let cursor = null;
  let total = null;
  let pages = 0;
  do {
    const query = `/api/v1/files?folder=${folderId}&limit=${limit}&sort=${sort}&dir=${dir}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}${extra}`;
    const response = await get(query);
    assert.equal(response.statusCode, 200, response.payload);
    const data = response.json();
    total = data.total;
    ids.push(...data.items.map((item) => item.id));
    cursor = data.nextCursor;
    pages += 1;
    assert.ok(pages < 30, 'Pagination did not terminate.');
  } while (cursor);
  return { ids, total, pages };
}

test('Dateibereich: Keyset-Pagination, Gesamtzahl und Filter', async (t) => {
  await setup();
  const folder = await post('/api/v1/folders', { name: 'Großer Ordner' }).then((r) => r.json().node);

  const folderIds = [];
  const fileIds = [];
  for (let index = 0; index < 12; index += 1) {
    folderIds.push(insertNode({ parentId: folder.id, name: `ordner-${String(index).padStart(2, '0')}`, kind: 'folder', size: 0 }));
  }
  for (let index = 0; index < 338; index += 1) {
    fileIds.push(insertNode({
      parentId: folder.id,
      name: `datei-${String(index).padStart(3, '0')}.txt`,
      size: (index * 37) % 5000,
      createdAt: 1_700_000_000_000 + index,
    }));
  }

  await t.test('liefert alle Elemente ohne Duplikate über mehrere Seiten', async () => {
    const result = await walkPages(folder.id, { limit: 50 });
    assert.equal(result.total, 350);
    assert.equal(result.ids.length, 350);
    assert.equal(new Set(result.ids).size, 350);
    assert.equal(result.pages, 7);
  });

  await t.test('Ordner stehen vor Dateien, auch absteigend sortiert', async () => {
    const page = (await get(`/api/v1/files?folder=${folder.id}&limit=500`)).json();
    const kinds = page.items.map((item) => item.kind);
    assert.deepEqual(kinds, [...Array(12).fill('folder'), ...Array(338).fill('file')]);
    const desc = (await get(`/api/v1/files?folder=${folder.id}&limit=500&dir=desc`)).json();
    assert.deepEqual(desc.items.slice(0, 12).map((item) => item.kind), Array(12).fill('folder'));
  });

  await t.test('sortiert nach Größe mit stabiler ID als Tiebreaker', async () => {
    const result = await walkPages(folder.id, { limit: 40, sort: 'size' });
    assert.equal(result.ids.length, 350);
    const rows = (await get(`/api/v1/files?folder=${folder.id}&limit=500&sort=size`)).json().items.filter((item) => item.kind === 'file');
    const sizes = rows.map((item) => item.size);
    assert.deepEqual(sizes, [...sizes].sort((a, b) => a - b));
  });

  await t.test('respektiert Such- und Typfilter und liefert die echte Gesamtzahl', async () => {
    const search = (await get(`/api/v1/files?folder=${folder.id}&q=datei-01&limit=5`)).json();
    assert.equal(search.total, 10);
    assert.equal(search.items.length, 5);
    assert.ok(search.nextCursor);
    const foldersOnly = (await get(`/api/v1/files?folder=${folder.id}&type=folder&limit=100`)).json();
    assert.equal(foldersOnly.total, 12);
    assert.ok(foldersOnly.items.every((item) => item.kind === 'folder'));
  });

  await t.test('begrenzt limit auf 500', async () => {
    const response = await get(`/api/v1/files?folder=${folder.id}&limit=9999`);
    assert.equal(response.statusCode, 200, response.payload);
    assert.equal(response.json().limit, 500);
    assert.equal(response.json().items.length, 350);
  });

  await t.test('Alle auswählen zählt auch nicht geladene Elemente', async () => {
    const filter = { parentId: folder.id, q: null, kind: null, sort: 'name', dir: 'asc' };
    const result = await post('/api/v1/files/selection', { selectAll: true, filter, exclude: [], snapshot: Date.now() });
    assert.equal(result.statusCode, 200, result.payload);
    assert.equal(result.json().count, 350);
  });
});
