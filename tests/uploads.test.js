import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onebox-upload-test-'));
process.env.DATA_DIR = dataDir;
process.env.FILES_DIR = path.join(dataDir, 'files');
process.env.LOG_LEVEL = 'silent';
process.env.WEB_DIR = path.join(dataDir, 'web');
process.env.MAX_UPLOAD_BYTES = '1024';

const { runMigrations } = await import('../server/db/index.js');
await runMigrations();
const { buildApp } = await import('../server/app.js');
const app = await buildApp({ logger: false });

let cookie = '';
const headers = (extra = {}) => ({ cookie, 'x-onebox-csrf': '1', ...extra });

async function setup() {
  const result = await app.inject({
    method: 'POST',
    url: '/api/v1/system/setup',
    payload: { username: 'uploader', password: 'super-secret-pass', displayName: 'Uploader' },
    headers: { 'x-onebox-csrf': '1' },
  });
  assert.equal(result.statusCode, 200, result.payload);
  cookie = result.headers['set-cookie'].split(';')[0];
}

async function create(name, size, extra = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/uploads',
    headers: headers({ 'tus-resumable': '1.0.0' }),
    payload: { name, size, mime: 'text/plain', ...extra },
  });
}

async function chunk(id, offset, body) {
  return app.inject({
    method: 'PATCH',
    url: `/api/v1/uploads/${id}`,
    headers: headers({ 'content-type': 'application/offset+octet-stream', 'upload-offset': String(offset), 'tus-resumable': '1.0.0' }),
    payload: Buffer.from(body),
  });
}

test('Resumable Uploads: tus-Semantik, Offset, Konflikte und Limits', async (t) => {
  await setup();

  await t.test('nimmt Chunks an und setzt nach HEAD am Offset fort', async () => {
    const created = await create('resume.txt', 10);
    assert.equal(created.statusCode, 201, created.payload);
    assert.equal(created.headers['tus-resumable'], '1.0.0');
    assert.ok(created.headers.location.endsWith(created.json().upload.id));
    const uploadId = created.json().upload.id;

    const first = await chunk(uploadId, 0, 'hello');
    assert.equal(first.statusCode, 200, first.payload);
    assert.equal(first.headers['upload-offset'], '5');

    const head = await app.inject({ method: 'HEAD', url: `/api/v1/uploads/${uploadId}`, headers: headers() });
    assert.equal(head.statusCode, 200);
    assert.equal(head.headers['upload-offset'], '5');
    assert.equal(head.headers['upload-length'], '10');

    const second = await chunk(uploadId, 5, 'world');
    assert.equal(second.statusCode, 200, second.payload);
    assert.equal(second.headers['upload-offset'], '10');

    const complete = await app.inject({ method: 'POST', url: `/api/v1/uploads/${uploadId}/complete`, headers: headers(), payload: {} });
    assert.equal(complete.statusCode, 200, complete.payload);
    assert.equal(complete.json().node.name, 'resume.txt');
    const list = await app.inject({ method: 'GET', url: '/api/v1/files', headers: headers() });
    assert.ok(list.json().items.some((item) => item.name === 'resume.txt'));
  });

  await t.test('lehnt einen falschen Offset ab', async () => {
    const uploadId = (await create('offset.txt', 4)).json().upload.id;
    const response = await chunk(uploadId, 2, 'abcd');
    assert.equal(response.statusCode, 409, response.payload);
  });

  await t.test('erzwingt das konfigurierte Upload-Limit', async () => {
    const response = await create('zu-gross.bin', 2048);
    assert.equal(response.statusCode, 413, response.payload);
  });

  await t.test('meldet Namenskonflikte und kann überspringen', async () => {
    const first = await create('doppelt.txt', 3);
    const firstId = first.json().upload.id;
    await chunk(firstId, 0, 'eins');
    await app.inject({ method: 'POST', url: `/api/v1/uploads/${firstId}/complete`, headers: headers(), payload: {} });

    const conflict = await create('doppelt.txt', 4);
    assert.equal(conflict.json().conflict, true);
    const conflictId = conflict.json().upload.id;
    await chunk(conflictId, 0, 'zwei');
    const skipped = await app.inject({ method: 'POST', url: `/api/v1/uploads/${conflictId}/complete`, headers: headers(), payload: { conflict: 'skip' } });
    assert.equal(skipped.statusCode, 200, skipped.payload);
    assert.equal(skipped.json().skipped, true);
    const list = await app.inject({ method: 'GET', url: '/api/v1/files', headers: headers() });
    assert.equal(list.json().items.filter((item) => item.name === 'doppelt.txt').length, 1);
  });
});
