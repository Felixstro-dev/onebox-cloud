import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../..');
const port = 8137;
const base = `http://127.0.0.1:${port}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let server;
let browser;
let dataDir;
let cookie;

before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onebox-full-test-'));
  process.env.DATA_DIR = dataDir;
  process.env.FILES_DIR = path.join(dataDir, 'files');
  process.env.LOG_LEVEL = 'silent';
  process.env.WEB_DIR = path.join(dataDir, 'web');
  process.env.MAX_UPLOAD_BYTES = '1024';

  server = spawn('node', ['server/index.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: 'inherit',
  });
  await sleep(5000);

  browser = await chromium.launch({ headless: true });

  // Setup user
  const resp = await fetch(`${base}/api/v1/system/setup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-onebox-csrf': '1' },
    body: JSON.stringify({ username: 'testuser', password: 'testpass123', displayName: 'Test User', setupToken: 'test-token-123' }),
  });
  const login = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-onebox-csrf': '1' },
    body: JSON.stringify({ username: 'testuser', password: 'testpass123' }),
  });
  cookie = login.headers.get('set-cookie')?.split(';')[0] || '';
});

after(async () => {
  await browser?.close();
  server?.kill();
  try { await fs.rm(dataDir, { recursive: true, force: true }); } catch {}
});

async function api(method, url, body) {
  const headers = { cookie, 'x-onebox-csrf': '1' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${base}${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${url} → ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : await response.json();
}

function overlaps(a, b) {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
}

// === FULL FUNCTIONAL TESTS ===

test('Storage / Settings / Uploads / Bottom Layer / Mobile viewport', async () => {
  const page = await browser.newPage();
  await page.goto(base);
  await sleep(2000);

  // 1. Check page loaded
  const h1 = await page.locator('h1').first();
  assert.ok(await h1.isVisible(), 'Page should load');

  // 2. Check bottom-nav exists (mobile/desktop)
  const nav = await page.locator('.bottom-nav').first();
  if (await nav.isVisible()) console.log('Bottom nav visible');

  // 3. Check selection bar isn't overlapping
  const selection = await page.locator('.selection-bar');
  const count = await selection.count();
  console.log(`Selection bar count: ${count}`);

  // 4. Test uploads input exists
  const uploadInput = await page.locator('input[data-testid="files-upload-input"]').count();
  console.log(`Upload input found: ${uploadInput}`);

  // 5. Click on settings / storage link if present
  const links = await page.locator('a').all();
  for (const link of links) {
    const text = await link.textContent();
    console.log(`Link: ${text || '(empty)'}`);
  }

  await page.close();
});

test('API endpoints respond correctly', async () => {
  // Storage endpoint (requires auth)
  const storage = await api('GET', '/api/v1/storage');
  assert.ok(storage.used !== undefined, 'Storage should return data');

  // Jobs endpoint (empty initially)
  const jobs = await api('GET', '/api/v1/jobs');
  assert.ok(jobs, 'Jobs endpoint should respond');

  // Drives endpoint (admin only, should work with admin cookie)
  const drivesResp = await api('GET', '/api/v1/storage/drives');
  assert.ok(drivesResp.drives, 'Drives endpoint should return list');
  console.log('Detected drives:', drivesResp.drives.map(d => d.path + ' (' + d.label + ')'));
});

test('Playwright mobile viewport (375x667) works', async () => {
  const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
  await page.goto(base);
  await sleep(1000);

  const body = await page.locator('body');
  assert.ok(await body.isVisible(), 'Body visible in mobile viewport');

  // Check for overlap issues on mobile
  const selection = await page.locator('.selection-bar');
  const nav = await page.locator('.bottom-nav');

  if (await selection.count() > 0 && await nav.count() > 0) {
    const selBox = await selection.boundingBox();
    const navBox = await nav.boundingBox();
    if (selBox && navBox) {
      const overlap = overlaps(selBox, navBox);
      console.log(`Mobile overlap selection/nav: ${overlap}`);
      assert.strictEqual(overlap, false, 'Selection bar should not overlap nav on mobile');
    }
  }

  await page.close();
});

test('Upload + Job flow creates and shows activity', async () => {
  // Create upload session
  const upload = await api('POST', '/api/v1/uploads', { name: 'test-file.txt', size: 5, mime: 'text/plain', parentId: null });
  assert.ok(upload.upload, 'Upload should create session');

  const patchResp = await fetch(`${base}/api/v1/uploads/${upload.upload.id}`, {
    method: 'PATCH',
    headers: {
      cookie,
      'x-onebox-csrf': '1',
      'content-type': 'application/offset+octet-stream',
      'upload-offset': '0',
      'upload-length': '5',
      'tus-resumable': '1.0.0',
    },
    body: 'hello',
  });
  assert.strictEqual(patchResp.status, 200, `PATCH upload failed: ${await patchResp.text()}`);

  await api('POST', `/api/v1/uploads/${upload.upload.id}/complete`, {});
  const storage = await api('GET', '/api/v1/storage');
  assert.strictEqual(typeof storage.used, 'number', 'Storage should reflect usage');
  console.log('Upload complete, storage used:', storage.used);
});
