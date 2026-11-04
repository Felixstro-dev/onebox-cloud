import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onebox-jobs-test-'));
process.env.DATA_DIR = dataDir;
process.env.FILES_DIR = path.join(dataDir, 'files');
process.env.LOG_LEVEL = 'silent';
process.env.WEB_DIR = path.join(dataDir, 'web');

const { runMigrations, db, schema } = await import('../server/db/index.js');
const { id } = await import('../server/lib/ids.js');
const { nameKey } = await import('../server/lib/names.js');
const { objectPath } = await import('../server/services/storage.js');

await runMigrations();
const { buildApp } = await import('../server/app.js');
const app = await buildApp({ logger: false });

let cookie = '';
const headers = (extra = {}) => ({ cookie, 'x-onebox-csrf': '1', ...extra });

async function setup() {
  const result = await app.inject({
    method: 'POST', url: '/api/v1/system/setup',
    payload: { username: 'jobsuser', password: 'super-secret-pass', displayName: 'Jobs' },
    headers: { 'x-onebox-csrf': '1' },
  });
  assert.equal(result.statusCode, 200, result.payload);
  cookie = result.headers['set-cookie'].split(';')[0];
}

async function insertFile(name) {
  const content = Buffer.from(`Inhalt von ${name}`);
  const ownerId = db.select().from(schema.users).get().id;
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const nodeId = id();
  db.insert(schema.nodes).values({
    id: nodeId, ownerId, parentId: null, kind: 'file', name,
    nameKey: nameKey(name), size: content.length, mime: 'text/plain',
    hash, objectKey: hash, createdAt: Date.now(), updatedAt: Date.now(),
  }).run();
  const file = objectPath(hash);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
  return nodeId;
}

test('Job-Queue meldet Löschvorgänge serverseitig und räumt sie auf', async () => {
  await setup();
  const first = await insertFile('eins.txt');
  await insertFile('zwei.txt');

  const trash = await app.inject({
    method: 'POST', url: '/api/v1/files/trash',
    payload: { ids: [first] }, headers: headers(),
  });
  assert.equal(trash.statusCode, 200, trash.payload);
  assert.equal(trash.json().trashed, 1);
  assert.ok(trash.json().jobId, 'Antwort enthält keine Job-ID.');

  const list = await app.inject({ method: 'GET', url: '/api/v1/jobs', headers: headers() });
  assert.equal(list.statusCode, 200, list.payload);
  const job = list.json().jobs.find((entry) => entry.id === trash.json().jobId);
  assert.ok(job, 'Job fehlt in der Queue.');
  assert.equal(job.kind, 'trash');
  assert.equal(job.status, 'done');
  assert.equal(job.total, 1);
  assert.equal(job.progress, 100);
  assert.match(job.title, /gelöscht/);

  // Erledigte Jobs verschwinden nach kurzer Zeit vollständig.
  await new Promise((resolve) => setTimeout(resolve, 2700));
  const after = await app.inject({ method: 'GET', url: '/api/v1/jobs', headers: headers() });
  assert.equal(after.json().jobs.some((entry) => entry.id === trash.json().jobId), false);

  // Ein zweiter Nutzer sieht die Queue nicht.
  const anonymous = await app.inject({ method: 'GET', url: '/api/v1/jobs' });
  assert.equal(anonymous.statusCode, 401);

  await app.close();
});
