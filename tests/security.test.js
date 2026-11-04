import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onebox-security-test-'));
process.env.DATA_DIR = dataDir;
process.env.FILES_DIR = path.join(dataDir, 'files');
process.env.LOG_LEVEL = 'silent';
process.env.WEB_DIR = path.join(dataDir, 'web');

const { runMigrations, db, schema } = await import('../server/db/index.js');
const { id } = await import('../server/lib/ids.js');
const { nameKey } = await import('../server/lib/names.js');
const { hashPassword } = await import('../server/services/auth.js');
const { objectPath } = await import('../server/services/storage.js');
const { counterFor, hotp } = await import('../server/lib/totp.js');

await runMigrations();
const { buildApp } = await import('../server/app.js');
const app = await buildApp({ logger: false });

let cookie = '';
const headers = (extra = {}) => ({ cookie, 'x-onebox-csrf': '1', ...extra });
const get = (url, extra = {}) => app.inject({ method: 'GET', url, headers: headers(extra) });
const post = (url, payload, extra = {}) => app.inject({ method: 'POST', url, payload, headers: headers(extra) });

async function setup() {
  const result = await app.inject({
    method: 'POST',
    url: '/api/v1/system/setup',
    payload: { username: 'security', password: 'super-secret-pass', displayName: 'Security' },
    headers: { 'x-onebox-csrf': '1' },
  });
  assert.equal(result.statusCode, 200, result.payload);
  cookie = result.headers['set-cookie'].split(';')[0];
}

async function insertNode({ name, kind = 'file', mime, content }) {
  const ownerId = db.select().from(schema.users).get().id;
  const hash = content ? crypto.createHash('sha256').update(content).digest('hex') : '';
  const nodeId = id();
  db.insert(schema.nodes).values({
    id: nodeId,
    ownerId,
    parentId: null,
    kind,
    name,
    nameKey: nameKey(name),
    size: content ? Buffer.byteLength(content) : 0,
    mime: mime || (kind === 'folder' ? 'inode/directory' : 'application/octet-stream'),
    hash: hash || null,
    objectKey: hash || null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }).run();
  if (content) {
    const file = objectPath(hash);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  }
  return { id: nodeId, hash };
}

test('Sicherheit: Pfade, CSRF, Header, Rate-Limit und 2FA', async (t) => {
  await setup();

  await t.test('lehnt unsichere Ordnernamen und Pfade ab', async () => {
    for (const name of ['..', '.', 'CON', 'a/b', 'a\\b', 'x\u0000y', 'x'.repeat(300)]) {
      const response = await post('/api/v1/folders', { name });
      assert.equal(response.statusCode, 400, `${JSON.stringify(name)} wurde akzeptiert: ${response.payload}`);
    }
    const traversal = await post('/api/v1/files/resolve', { path: '../../etc/passwd' });
    assert.equal(traversal.statusCode, 400, traversal.payload);
    const absolute = await post('/api/v1/files/resolve', { path: '/etc/passwd' });
    assert.equal(absolute.statusCode, 400, absolute.payload);
  });

  await t.test('verlangt den CSRF-Header und passt auf den Origin auf', async () => {
    const missing = await app.inject({ method: 'POST', url: '/api/v1/folders', payload: { name: 'Ohne Header' }, headers: { cookie } });
    assert.equal(missing.statusCode, 403, missing.payload);
    assert.equal(missing.json().error.code, 'csrf');
    const badOrigin = await app.inject({
      method: 'POST',
      url: '/api/v1/folders',
      payload: { name: 'Falscher Origin' },
      headers: { cookie, 'x-onebox-csrf': '1', origin: 'https://evil.example' },
    });
    assert.equal(badOrigin.statusCode, 403, badOrigin.payload);
  });

  await t.test('setzt Helmet-Header mit strenger CSP', async () => {
    const response = await get('/api/v1/system/health');
    assert.equal(response.statusCode, 200, response.payload);
    const csp = response.headers['content-security-policy'];
    assert.ok(csp.includes("default-src 'self'"), csp);
    assert.ok(csp.includes("script-src 'self'"), csp);
    assert.ok(csp.includes("object-src 'none'"), csp);
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['x-frame-options'], 'DENY');
  });

  await t.test('liefert Downloads als Attachment und Inline nur für sichere Typen', async () => {
    const html = await insertNode({ name: 'boese.html', mime: 'text/html', content: '<script>alert(1)</script>' });
    const svg = await insertNode({ name: 'bild.svg', mime: 'image/svg+xml', content: '<svg onload="alert(1)"/>' });
    const pdf = await insertNode({ name: 'doc.pdf', mime: 'application/pdf', content: '%PDF-1.4\n%%EOF' });
    const png = await insertNode({ name: 'bild.png', mime: 'image/png', content: '\x89PNG\r\n\x1a\n' });

    const download = await get(`/api/v1/files/${html.id}/download`);
    assert.equal(download.statusCode, 200, download.payload);
    assert.match(download.headers['content-disposition'], /^attachment;/);
    assert.equal(download.headers['x-content-type-options'], 'nosniff');

    const htmlInline = await get(`/api/v1/files/${html.id}/content`);
    assert.match(htmlInline.headers['content-disposition'], /^attachment;/);
    assert.equal(htmlInline.headers['content-type'], 'application/octet-stream');

    const svgInline = await get(`/api/v1/files/${svg.id}/content`);
    assert.match(svgInline.headers['content-disposition'], /^attachment;/);
    assert.equal(svgInline.headers['content-type'], 'application/octet-stream');

    const pdfInline = await get(`/api/v1/files/${pdf.id}/content`);
    assert.match(pdfInline.headers['content-disposition'], /^inline;/);
    assert.equal(pdfInline.headers['content-type'], 'application/pdf');
    assert.equal(pdfInline.headers['accept-ranges'], 'bytes');

    const pngInline = await get(`/api/v1/files/${png.id}/content`);
    assert.match(pngInline.headers['content-disposition'], /^inline;/);
    assert.equal(pngInline.headers['content-type'], 'image/png');
  });

  await t.test('meldet unbekannte Nutzer und falsche Passwörter gleich und sperrt steigend', async () => {
    const passwordHash = await hashPassword('correct-horse-battery');
    db.insert(schema.users).values({
      id: id(), username: 'locktest', displayName: 'Lock', passwordHash, role: 'user', createdAt: Date.now(),
    }).run();

    const unknown = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { username: 'gibt-es-nicht', password: 'falsch-falsch' },
      headers: { 'x-onebox-csrf': '1' },
    });
    const wrong = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { username: 'locktest', password: 'falsch-falsch' },
      headers: { 'x-onebox-csrf': '1' },
    });
    assert.equal(unknown.statusCode, 401, unknown.payload);
    assert.equal(wrong.statusCode, 401, wrong.payload);
    assert.deepEqual(unknown.json().error, wrong.json().error);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await app.inject({
        method: 'POST', url: '/api/v1/auth/login',
        payload: { username: 'locktest', password: 'noch-falscher' },
        headers: { 'x-onebox-csrf': '1' },
      });
    }
    const locked = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { username: 'locktest', password: 'correct-horse-battery' },
      headers: { 'x-onebox-csrf': '1' },
    });
    assert.equal(locked.statusCode, 429, locked.payload);
    assert.equal(locked.json().error.code, 'invalid_credentials');
  });

  await t.test('richtet TOTP ein, verlangt den Code beim Login und verbraucht Recovery-Codes', async () => {
    const setupFactor = await post('/api/v1/auth/2fa/setup', {});
    assert.equal(setupFactor.statusCode, 200, setupFactor.payload);
    const { secret, recoveryCodes } = setupFactor.json();
    assert.equal(recoveryCodes.length, 10);

    const enable = await post('/api/v1/auth/2fa/enable', { code: hotp(secret, counterFor()) });
    assert.equal(enable.statusCode, 200, enable.payload);

    const logout = await post('/api/v1/auth/logout', {});
    assert.equal(logout.statusCode, 200, logout.payload);

    const login = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { username: 'security', password: 'super-secret-pass' },
      headers: { 'x-onebox-csrf': '1' },
    });
    assert.equal(login.statusCode, 200, login.payload);
    assert.equal(login.json().twoFactorRequired, true);
    const challengeToken = login.json().challengeToken;

    const wrongCode = await app.inject({
      method: 'POST', url: '/api/v1/auth/2fa/verify',
      payload: { challengeToken, code: '000000' },
      headers: { 'x-onebox-csrf': '1' },
    });
    assert.equal(wrongCode.statusCode, 401, wrongCode.payload);

    const verify = await app.inject({
      method: 'POST', url: '/api/v1/auth/2fa/verify',
      payload: { challengeToken, code: hotp(secret, counterFor() + 1) },
      headers: { 'x-onebox-csrf': '1' },
    });
    assert.equal(verify.statusCode, 200, verify.payload);
    cookie = verify.headers['set-cookie'].split(';')[0];
    assert.equal(verify.json().recoveryCodesRemaining, 10);

    const sessions = await get('/api/v1/auth/sessions');
    assert.equal(sessions.statusCode, 200, sessions.payload);
    assert.ok(sessions.json().items.some((session) => session.current));

    const secondLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { username: 'security', password: 'super-secret-pass' },
      headers: { 'x-onebox-csrf': '1' },
    });
    const secondChallenge = secondLogin.json().challengeToken;
    const recovery = await app.inject({
      method: 'POST', url: '/api/v1/auth/2fa/verify',
      payload: { challengeToken: secondChallenge, code: recoveryCodes[0] },
      headers: { 'x-onebox-csrf': '1' },
    });
    assert.equal(recovery.statusCode, 200, recovery.payload);
    assert.equal(recovery.json().recoveryCodesRemaining, 9);

    const reusable = await app.inject({
      method: 'POST', url: '/api/v1/auth/2fa/verify',
      payload: { challengeToken: secondChallenge, code: recoveryCodes[0] },
      headers: { 'x-onebox-csrf': '1' },
    });
    assert.equal(reusable.statusCode, 401, reusable.payload);
  });

  await t.test('zeigt Sitzungen und beendet sie einzeln', async () => {
    const list = await get('/api/v1/auth/sessions');
    assert.equal(list.statusCode, 200, list.payload);
    const other = list.json().items.find((session) => !session.current);
    assert.ok(other, 'Es sollte eine zweite Sitzung geben.');
    const response = await app.inject({ method: 'DELETE', url: `/api/v1/auth/sessions/${other.id}`, headers: headers() });
    assert.equal(response.statusCode, 200, response.payload);
    const after = await get('/api/v1/auth/sessions');
    assert.ok(!after.json().items.some((session) => session.id === other.id));
  });
});
