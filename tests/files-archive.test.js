import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import JSZip from 'jszip';
import yauzl from 'yauzl';
import { eq } from 'drizzle-orm';

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onebox-files-test-'));
process.env.DATA_DIR = dataDir;
process.env.FILES_DIR = path.join(dataDir, 'files');
process.env.LOG_LEVEL = 'silent';
process.env.WEB_DIR = path.join(dataDir, 'web');

const { runMigrations, db, schema, closeDb } = await import('../server/db/index.js');
const { id } = await import('../server/lib/ids.js');
const { nameKey, mimeOf } = await import('../server/lib/names.js');
const { objectPath } = await import('../server/services/storage.js');

await runMigrations();
const { buildApp } = await import('../server/app.js');
const app = await buildApp({ logger: false });

let cookie = '';
const headers = () => ({ cookie, 'x-onebox-csrf': '1' });
const req = (method, url, payload) => app.inject({ method, url, payload, headers: headers() });
const post = (url, payload) => req('POST', url, payload);
const get = (url) => req('GET', url);

async function setup() {
  const result = await app.inject({
    method: 'POST',
    url: '/api/v1/system/setup',
    payload: { username: 'tester', password: 'super-secret-pass', displayName: 'Tester' },
    headers: { 'x-onebox-csrf': '1' },
  });
  assert.equal(result.statusCode, 200, result.payload);
  cookie = result.headers['set-cookie'].split(';')[0];
}

async function makeFolder(name, parentId = null) {
  const result = await post('/api/v1/folders', { name, parentId });
  assert.equal(result.statusCode, 200, result.payload);
  return result.json().node;
}

function insertNode({ parentId, name, kind = 'file', size = 10, hash = null, createdAt = Date.now() }) {
  const nodeId = id();
  db.insert(schema.nodes).values({
    id: nodeId,
    ownerId: db.select().from(schema.users).get().id,
    parentId: parentId || null,
    kind,
    name,
    nameKey: nameKey(name),
    size,
    mime: kind === 'folder' ? 'inode/directory' : mimeOf(name),
    hash,
    objectKey: hash,
    createdAt,
    updatedAt: createdAt,
  }).run();
  return nodeId;
}

async function makeStoredFile(parentId, name, content) {
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const file = objectPath(hash);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
  return insertNode({ parentId, name, size: Buffer.byteLength(content), hash });
}

async function waitJob(jobId, expected = ['done', 'error', 'cancelled']) {
  const started = Date.now();
  for (;;) {
    const result = await get(`/api/v1/files/archive/jobs/${jobId}`);
    assert.equal(result.statusCode, 200, result.payload);
    const job = result.json().job;
    if (expected.includes(job.state)) return job;
    if (Date.now() - started > 30000) throw new Error(`Job ${jobId} timed out with state ${job.state}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function readZipBuffer(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zipfile) => {
      if (error) return reject(error);
      const entries = [];
      zipfile.on('entry', (entry) => {
        const chunks = [];
        if (entry.fileName.endsWith('/')) {
          entries.push({ name: entry.fileName, data: Buffer.alloc(0) });
          zipfile.readEntry();
          return;
        }
        zipfile.openReadStream(entry, (streamError, stream) => {
          if (streamError) return reject(streamError);
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('end', () => {
            entries.push({ name: entry.fileName, data: Buffer.concat(chunks) });
            zipfile.readEntry();
          });
          stream.on('error', reject);
        });
      });
      zipfile.on('end', () => resolve(entries));
      zipfile.on('error', reject);
      zipfile.readEntry();
    });
  });
}

test('Dateibereich: Auswahl, Snapshot, ZIP und Zip-Slip-Schutz', async (t) => {
  await setup();

  await t.test('Alle auswählen zählt 1.897 und respektiert den Snapshot', async () => {
    const folder = await makeFolder('Massenordner');
    const ids = [];
    const before = Date.now();
    for (let index = 0; index < 1897; index += 1) {
      ids.push(insertNode({ parentId: folder.id, name: `datei-${String(index).padStart(4, '0')}.txt`, createdAt: before }));
    }
    const list = await get(`/api/v1/files?parent=${folder.id}&limit=200`);
    assert.equal(list.json().total, 1897);

    const snapshot = Date.now() + 2;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const lateId = insertNode({ parentId: folder.id, name: 'spaeter-hinzugefuegt.txt', createdAt: Date.now() + 10 });

    const filter = { parentId: folder.id, q: null, kind: null, sort: 'name', dir: 'asc' };
    const selection = await post('/api/v1/files/selection', { selectAll: true, filter, exclude: [], snapshot });
    assert.equal(selection.statusCode, 200, selection.payload);
    assert.equal(selection.json().count, 1897);

    const excluded = await post('/api/v1/files/selection', {
      selectAll: true, filter, exclude: [ids[0], ids[1]], snapshot,
    });
    assert.equal(excluded.json().count, 1895);

    const trash = await post('/api/v1/files/trash', { selectAll: true, filter, exclude: [], snapshot });
    assert.equal(trash.statusCode, 200, trash.payload);
    assert.equal(trash.json().trashed, 1897);

    const remaining = await get(`/api/v1/files?parent=${folder.id}&limit=200`);
    assert.equal(remaining.json().total, 1);
    assert.equal(remaining.json().items[0].id, lateId);
  });

  await t.test('ZIP mit 210 Dateien erstellen, herunterladen und wieder entpacken', async () => {
    const folder = await makeFolder('ZIP-Quelle');
    const expected = new Map();
    const ids = [];
    for (let index = 0; index < 210; index += 1) {
      const name = `bild-${String(index).padStart(3, '0')}.txt`;
      const content = `Inhalt Nummer ${index}\n`.repeat(20);
      expected.set(name, Buffer.from(content));
      ids.push(await makeStoredFile(folder.id, name, content));
    }

    const created = await post('/api/v1/files/archive', {
      ids, parentId: folder.id, name: 'Abnahme 2026-11-04.zip',
    });
    assert.equal(created.statusCode, 200, created.payload);
    const job = await waitJob(created.json().job.id);
    assert.equal(job.state, 'done', job.message);
    assert.equal(job.result.count, 210);

    const zipNode = job.result.node;
    const download = await post('/api/v1/files/archive/download', { ids });
    assert.equal(download.statusCode, 200, download.payload);
    assert.match(download.headers['content-type'], /application\/zip/);
    const entries = await readZipBuffer(download.rawPayload);
    assert.equal(entries.length, 210);
    for (const entry of entries) {
      assert.ok(expected.has(entry.name), `Unerwarteter Eintrag ${entry.name}`);
      assert.deepEqual(entry.data, expected.get(entry.name));
    }

    const extracted = await post(`/api/v1/files/${zipNode.id}/extract`, {
      target: 'newFolder', conflict: 'keepBoth',
    });
    assert.equal(extracted.statusCode, 200, extracted.payload);
    const extractJob = await waitJob(extracted.json().job.id);
    assert.equal(extractJob.state, 'done', extractJob.message);
    assert.equal(extractJob.result.extracted, 210);

    const target = db.select().from(schema.nodes).where(eq(schema.nodes.parentId, extractJob.result.folderId)).all();
    assert.equal(target.length, 210);
    const got = new Map(target.map((item) => [item.name, item.size]));
    for (const [name, data] of expected) {
      assert.equal(got.get(name), data.length, `Größe von ${name} weicht ab`);
    }
  });

  await t.test('ZIP mit ../ im Pfad wird abgelehnt', async () => {
    const zip = new JSZip();
    zip.file('../ausbruch.txt', 'böse');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const safeFolder = await makeFolder('ZipSlip');
    const malicious = await makeStoredFile(safeFolder.id, 'boese.zip', buffer);

    const result = await post(`/api/v1/files/${malicious}/extract`, { target: 'here', conflict: 'keepBoth' });
    assert.equal(result.statusCode, 200, result.payload);
    const job = await waitJob(result.json().job.id);
    assert.equal(job.state, 'error');
    assert.match(job.message, /Unsicherer Pfad/);

    const escaped = await fs.stat(path.join(dataDir, 'ausbruch.txt')).catch(() => null);
    assert.equal(escaped, null);
  });
});

after(async () => {
  await app.close();
  closeDb();
  await fs.rm(dataDir, { recursive: true, force: true });
});
