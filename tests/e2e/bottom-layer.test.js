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

async function api(method, url, body) {
  const headers = { cookie, 'x-onebox-csrf': '1' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${base}${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${url} → ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function upload(name, content) {
  const created = await api('POST', '/api/v1/uploads', { name, size: content.length, mime: 'text/plain' });
  const id = created.upload.id;
  const patched = await fetch(`${base}/api/v1/uploads/${id}`, {
    method: 'PATCH',
    headers: {
      cookie,
      'x-onebox-csrf': '1',
      'content-type': 'application/offset+octet-stream',
      'upload-offset': '0',
      'upload-length': String(content.length),
    },
    body: content,
  });
  assert.equal(patched.status, 200, await patched.text());
  await api('POST', `/api/v1/uploads/${id}/complete`, {});
}

function overlaps(a, b) {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
}

async function boxes(page) {
  return {
    selection: await page.locator('.selection-bar').boundingBox(),
    panel: await page.locator('.upload-panel').boundingBox(),
    nav: await page.locator('.bottom-nav').boundingBox(),
    stack: await page.locator('.bottom-stack').boundingBox(),
  };
}

async function assertNoOverlap(page, label) {
  const box = await boxes(page);
  for (const [name, value] of Object.entries(box)) {
    assert.ok(value, `${label}: ${name} fehlt im Layout.`);
  }
  assert.equal(overlaps(box.selection, box.panel), false, `${label}: Auswahlleiste überlappt Aktivitätsfeld.`);
  assert.equal(overlaps(box.selection, box.nav), false, `${label}: Auswahlleiste überlappt Navigation.`);
  assert.equal(overlaps(box.panel, box.nav), false, `${label}: Aktivitätsfeld überlappt Navigation.`);
  return box;
}

async function openFiles(page) {
  await page.goto(`${base}/files`);
  await page.locator('.file-row:not(.file-row--head)').first().waitFor();
  await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--bottom-nav-height').trim() !== '');
}

async function deleteFirstVisible(page) {
  await page.locator('.file-row:not(.file-row--head)').first().click();
  await page.locator('.selection-bar').waitFor();
  await page.locator('.selection-bar').getByRole('button', { name: 'Löschen', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'In den Papierkorb', exact: true }).click();
}

before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onebox-e2e-'));
  server = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR: path.join(dataDir, 'data'),
      FILES_DIR: path.join(dataDir, 'files'),
      WEB_DIR: path.join(root, 'dist'),
      LOG_LEVEL: 'silent',
      SECURE_COOKIES: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  server.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/v1/system/health`);
      if (response.ok) { ready = true; break; }
    } catch { /* Server startet noch */ }
    await sleep(100);
  }
  assert.ok(ready, `Server nicht erreichbar:\n${stderr}`);

  const setup = await fetch(`${base}/api/v1/system/setup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-onebox-csrf': '1' },
    body: JSON.stringify({ username: 'e2e', password: 'e2e-super-secret', displayName: 'E2E' }),
  });
  assert.equal(setup.status, 200, await setup.text());
  cookie = setup.headers.get('set-cookie').split(';')[0];

  // Genug Einträge, damit die Liste tatsächlich scrollt.
  for (let index = 0; index < 80; index += 1) {
    await upload(`Datei ${String(index + 1).padStart(3, '0')}.txt`, `Inhalt ${index}\n`);
  }

  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.kill('SIGTERM');
  await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
});

for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
  test(`Bottom-Layer ohne Überlappung bei ${viewport.width}x${viewport.height}`, async () => {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await context.addCookies([{ name: 'onebox_session', value: cookie.split('=')[1], url: base }]);
    const page = await context.newPage();

    await openFiles(page);

    // 1) Löschen erzeugt einen Server-Job; das Aktivitätsfeld erscheint.
    await deleteFirstVisible(page);
    await page.locator('.upload-panel').waitFor({ timeout: 8000 });
    await page.locator('.activity-job').first().waitFor({ timeout: 8000 });

    // Solange der Job sichtbar ist, eine weitere Datei auswählen. Beide
    // Leisten müssen gleichzeitig im Stapel Platz haben.
    await page.locator('.file-row:not(.file-row--head)').first().click();
    await page.locator('.selection-bar').waitFor();
    await assertNoOverlap(page, `Löschen @${viewport.width}`);

    // Rückgängig ist per Tap bedienbar.
    const undo = page.getByRole('button', { name: 'Rückgängig' });
    if (await undo.count()) {
      await undo.first().tap();
      await page.locator('.toast-host').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    }

    // Ohne Jobs verschwindet das Feld vollständig aus dem DOM.
    await page.waitForFunction(() => !document.querySelector('.upload-panel'), null, { timeout: 9000 });
    assert.equal(await page.locator('.upload-panel').count(), 0);
    assert.equal(await page.locator('.upload-panel').evaluateAll((nodes) => nodes.some((node) => node.getBoundingClientRect().height > 0)), false);

    await context.close();
  });

  test(`Upload und Job gleichzeitig bei ${viewport.width}x${viewport.height}`, async () => {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await context.addCookies([{ name: 'onebox_session', value: cookie.split('=')[1], url: base }]);
    const page = await context.newPage();

    // Upload absichtlich verlangsamen, damit er während des Job-Tests aktiv bleibt.
    await page.route(/\/api\/v1\/uploads\/[^/]+$/, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      await sleep(4000);
      await route.continue().catch(() => {});
    });

    await openFiles(page);
    await page.setInputFiles('[data-testid="files-upload-input"]', {
      name: 'e2e-gross.bin',
      mimeType: 'application/octet-stream',
      buffer: Buffer.alloc(9 * 1024 * 1024, 7),
    });
    await page.locator('.upload-panel').waitFor({ timeout: 8000 });
    await page.locator('.upload-item').first().waitFor({ timeout: 8000 });

    await deleteFirstVisible(page);
    await page.locator('.activity-job').first().waitFor({ timeout: 8000 });
    await page.locator('.file-row:not(.file-row--head)').first().click();
    await page.locator('.selection-bar').waitFor();
    await assertNoOverlap(page, `Upload+Job @${viewport.width}`);

    // Letzter Listeneintrag bleibt trotz sichtbarem Stapel erreichbar.
    await page.locator('.app-view').evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await sleep(400);
    const stack = await page.locator('.bottom-stack').boundingBox();
    const last = await page.locator('.file-row:not(.file-row--head)').last().boundingBox();
    assert.ok(last && stack, 'Letzte Zeile oder Stapel nicht messbar.');
    assert.ok(last.y + last.height <= stack.y + 1, `Letzte Zeile (${last.y + last.height}) liegt hinter dem Stapel (${stack.y}).`);

    // Auswahl-Buttons reagieren auf Tap.
    await page.locator('.selection-bar').getByRole('button', { name: 'Aufheben' }).tap();
    await page.locator('.selection-bar').waitFor({ state: 'detached' });

    await context.close();
  });

  test(`Safe-Area bei ${viewport.width}x${viewport.height}`, async () => {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await context.addCookies([{ name: 'onebox_session', value: cookie.split('=')[1], url: base }]);
    const page = await context.newPage();
    await page.addStyleTag({ content: ':root { --safe-bottom: 34px !important; }' });
    await openFiles(page);

    await deleteFirstVisible(page);
    await page.locator('.upload-panel').waitFor({ timeout: 8000 });
    await page.locator('.activity-job').first().waitFor({ timeout: 8000 });
    await page.locator('.file-row:not(.file-row--head)').first().click();
    await page.locator('.selection-bar').waitFor();

    const box = await assertNoOverlap(page, `Safe-Area @${viewport.width}`);
    const navTop = viewport.height - box.nav.height;
    assert.ok(box.panel.y + box.panel.height <= navTop + 1, 'Aktivitätsfeld reicht in die Navigation.');
    assert.ok(box.selection.y + box.selection.height <= navTop + 1, 'Auswahlleiste reicht in die Navigation.');

    await context.close();
  });
}
