import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'onebox-pdf-test-'));
process.env.DATA_DIR = dataDir;
process.env.FILES_DIR = path.join(dataDir, 'files');
process.env.LOG_LEVEL = 'silent';
process.env.WEB_DIR = path.join(dataDir, 'web');

const { runMigrations, db, schema } = await import('../server/db/index.js');
const { id } = await import('../server/lib/ids.js');
const { nameKey } = await import('../server/lib/names.js');
const { objectPath } = await import('../server/services/storage.js');

await runMigrations();
const { thumbnails } = await import('../server/services/runtime.js');
const { buildApp } = await import('../server/app.js');
const app = await buildApp({ logger: false });

let cookie = '';
const headers = (extra = {}) => ({ cookie, 'x-onebox-csrf': '1', ...extra });
const get = (url, extra = {}) => app.inject({ method: 'GET', url, headers: headers(extra) });

function buildPdf(text = 'Onebox PDF') {
  const content = `BT /F1 24 Tf 40 100 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

async function setup() {
  const result = await app.inject({
    method: 'POST', url: '/api/v1/system/setup',
    payload: { username: 'pdfuser', password: 'super-secret-pass', displayName: 'PDF' },
    headers: { 'x-onebox-csrf': '1' },
  });
  assert.equal(result.statusCode, 200, result.payload);
  cookie = result.headers['set-cookie'].split(';')[0];
}

async function insertPdf(name, content) {
  const ownerId = db.select().from(schema.users).get().id;
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const nodeId = id();
  db.insert(schema.nodes).values({
    id: nodeId,
    ownerId,
    parentId: null,
    kind: 'file',
    name,
    nameKey: nameKey(name),
    size: content.length,
    mime: 'application/pdf',
    hash,
    objectKey: hash,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }).run();
  const file = objectPath(hash);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
  return nodeId;
}

test('PDF: Inline-Auslieferung, Range und Sandbox-Header', async () => {
  await setup();
  const content = buildPdf();
  const nodeId = await insertPdf('bericht.pdf', content);

  const inline = await get(`/api/v1/files/${nodeId}/content`);
  assert.equal(inline.statusCode, 200, inline.payload);
  assert.equal(inline.headers['content-type'], 'application/pdf');
  assert.match(inline.headers['content-disposition'], /^inline;/);
  assert.equal(inline.headers['accept-ranges'], 'bytes');
  assert.equal(inline.headers['x-content-type-options'], 'nosniff');
  assert.match(inline.headers['content-security-policy'], /sandbox/);
  assert.ok(inline.rawPayload.subarray(0, 5).equals(Buffer.from('%PDF-')));

  const range = await get(`/api/v1/files/${nodeId}/content`, { range: 'bytes=0-7' });
  assert.equal(range.statusCode, 206, range.payload);
  assert.equal(range.headers['content-range'], `bytes 0-7/${content.length}`);
  assert.equal(range.headers['content-length'], '8');
  assert.equal(range.rawPayload.toString('latin1'), '%PDF-1.4');

  const download = await get(`/api/v1/files/${nodeId}/download`);
  assert.equal(download.statusCode, 200, download.payload);
  assert.match(download.headers['content-disposition'], /^attachment;/);
});

test('PDF: Thumbnail über pdftoppm, WebP-Cache und Fehlerfall', async () => {
  const content = buildPdf('Miniatur');
  const nodeId = await insertPdf('miniatur.pdf', content);
  const node = db.select().from(schema.nodes).where(eq(schema.nodes.id, nodeId)).get();

  const file = await thumbnails.ensure(node, 320);
  assert.ok(file, 'Thumbnail wurde nicht erzeugt.');
  const stat = await fs.stat(file);
  assert.ok(stat.size > 0);
  const header = await fs.readFile(file);
  assert.equal(header.subarray(8, 12).toString('latin1'), 'WEBP');

  const response = await get(`/api/v1/files/${nodeId}/thumbnail?size=320`);
  assert.equal(response.statusCode, 200, response.payload);
  assert.equal(response.headers['content-type'], 'image/webp');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');

  const brokenId = await insertPdf('kaputt.pdf', Buffer.from('%PDF-1.4\nkaputt', 'latin1'));
  const broken = await get(`/api/v1/files/${brokenId}/thumbnail?size=320`);
  assert.equal(broken.statusCode, 404, broken.payload);

  thumbnails.close();
  await app.close();
});
