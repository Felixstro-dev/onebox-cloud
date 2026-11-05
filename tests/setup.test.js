import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onebox-setup-test-'));
process.env.DATA_DIR = dataDir;
process.env.FILES_DIR = path.join(dataDir, 'files');
process.env.LOG_LEVEL = 'silent';
process.env.WEB_DIR = path.join(dataDir, 'web');
process.env.SETUP_TOKEN = 'test-setup-token-123456';

const { runMigrations, db, schema } = await import('../server/db/index.js');
await runMigrations();
const { buildApp } = await import('../server/app.js');
const app = await buildApp({ logger: false });
const setupToken = process.env.SETUP_TOKEN;

test.after(async () => {
  await app.close();
  await fs.rm(dataDir, { recursive: true, force: true });
});

test('Ersteinrichtung validiert Eingaben, erstellt eine Session und bleibt abgeschlossen', async (t) => {
  const invalidToken = await app.inject({
    method: 'POST', url: '/api/v1/system/setup',
    payload: { username: 'admin', password: 'correct horse battery', setupToken: 'wrong-setup-token' },
    headers: { 'x-onebox-csrf': '1' },
  });
  assert.equal(invalidToken.statusCode, 401);
  assert.equal(invalidToken.json().error.message, 'Setup token is wrong.');

  const invalid = await app.inject({
    method: 'POST', url: '/api/v1/system/setup',
    payload: { username: 'bad name', password: 'short', displayName: 'Test', setupToken },
    headers: { 'x-onebox-csrf': '1' },
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(db.select().from(schema.users).all().length, 0);

  const firstResponses = await Promise.all([
    app.inject({
      method: 'POST', url: '/api/v1/system/setup',
      payload: { username: 'admin', password: 'correct horse battery', displayName: 'Admin', setupToken },
      headers: { 'x-onebox-csrf': '1' },
    }),
    app.inject({
      method: 'POST', url: '/api/v1/system/setup',
      payload: { username: 'admin', password: 'correct horse battery', displayName: 'Admin', setupToken },
      headers: { 'x-onebox-csrf': '1' },
    }),
  ]);
  assert.deepEqual(firstResponses.map((response) => response.statusCode).sort(), [200, 400]);
  const first = firstResponses.find((response) => response.statusCode === 200);
  assert.ok(first);
  assert.match(first.headers['set-cookie'], /onebox_session=/);
  assert.equal(first.json().user.role, 'admin');

  const login = await app.inject({
    method: 'POST', url: '/api/v1/auth/login',
    payload: { username: 'admin', password: 'correct horse battery' },
    headers: { 'x-onebox-csrf': '1' },
  });
  assert.equal(login.statusCode, 200);
  assert.equal(login.json().user.username, 'admin');

  const duplicate = await app.inject({
    method: 'POST', url: '/api/v1/system/setup',
    payload: { username: 'second', password: 'another correct password', setupToken: 'wrong-setup-token' },
    headers: { 'x-onebox-csrf': '1' },
  });
  assert.equal(duplicate.statusCode, 400);
  assert.equal(duplicate.json().error.message, 'Setup has already been completed.');
  assert.equal(db.select().from(schema.users).all().length, 1);

  await t.test('Reload erkennt abgeschlossene Einrichtung', async () => {
    const setup = await app.inject({ method: 'GET', url: '/api/v1/system/setup' });
    assert.deepEqual(setup.json(), { needsSetup: false });
  });
});