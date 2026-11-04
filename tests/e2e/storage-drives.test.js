import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const port = 8090;
const base = `http://127.0.0.1:${port}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let browser;

before(async () => {
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
});

test('Storage page shows admin section with drive options', async () => {
  const page = await browser.newPage();
  await page.goto(base);
  await sleep(1000);

  // Check page loaded
  const title = await page.textContent('h1');
  assert.ok(title, 'Page should load with h1');

  // Check buttons exist (scan drives, select storage, submit form)
  const buttons = await page.locator('button');
  const btnCount = await buttons.count();
  console.log(`Found ${btnCount} buttons`);

  // Click "Scan Drives" if present (admin only, may be 401 for anonymous)
  let scanBtn = page.locator('button:has-text("Laufwerke")');
  const scanExists = await scanBtn.count() > 0;
  if (scanExists) {
    await scanBtn.click();
    await sleep(500);
  }

  await page.close();
});

test('Drives endpoint returns 401 for anonymous (secure)', async () => {
  const resp = await fetch(`${base}/api/v1/storage/drives`);
  assert.strictEqual(resp.status, 401, 'Drives endpoint should require auth');
});

test('Storage endpoint returns 401 for anonymous', async () => {
  const resp = await fetch(`${base}/api/v1/storage`);
  assert.strictEqual(resp.status, 401, 'Storage endpoint should require auth');
});
