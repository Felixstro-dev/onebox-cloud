import { parentPort } from 'node:worker_threads';
import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SIZES = [320, 768, 1600];
const PDF_TIMEOUT_MS = 20_000;
const PDF_MEMORY_KB = 786_432; // 768 MB Adressraum für pdftoppm
const PDF_MAX_OUTPUT = 48 * 1024 * 1024;

/**
 * Rendert die erste PDF-Seite mit pdftoppm. Der Aufruf ist zeitlich und im
 * Adressraum begrenzt; die Ausgabegröße wird anschließend geprüft.
 */
function renderPdfPage(file, prefix, targetPx) {
  return new Promise((resolve, reject) => {
    const script = `ulimit -v ${PDF_MEMORY_KB} 2>/dev/null || true; exec pdftoppm -png -f 1 -l 1 -scale-to ${targetPx} "$1" "$2"`;
    const child = spawn('sh', ['-c', script, 'sh', file, prefix], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('PDF-Vorschau hat das Zeitlimit überschritten.'));
    }, PDF_TIMEOUT_MS);
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 4000) stderr += chunk.toString();
    });
    child.on('error', (error) => finish(error));
    child.on('exit', (code) => {
      if (code === 0) finish();
      else finish(new Error(`pdftoppm fehlgeschlagen: ${stderr.trim().slice(0, 300) || `Code ${code}`}`));
    });
  });
}

async function pdfThumbnail({ file, outputDir, size, taskId }) {
  await fsp.mkdir(outputDir, { recursive: true });
  const base = path.join(outputDir, `pdf-${taskId}`);
  const target = Math.max(512, Math.min(1600, (size || 768) * 2));
  try {
    await renderPdfPage(file, base, target);
    const entries = await fsp.readdir(outputDir);
    const rendered = entries.find((entry) => entry.startsWith(`pdf-${taskId}`) && entry.endsWith('.png'));
    if (!rendered) throw new Error('pdftoppm hat keine Seite erzeugt.');
    const png = path.join(outputDir, rendered);
    const stat = await fsp.stat(png);
    if (stat.size > PDF_MAX_OUTPUT) throw new Error('Die gerenderte PDF-Seite ist zu groß.');
    const meta = await sharp(png, { failOn: 'none', limitInputPixels: 268_402_689 }).metadata();
    const out = path.join(outputDir, `${size || 'original'}.webp`);
    await sharp(png, { failOn: 'none', limitInputPixels: 268_402_689 })
      .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toFile(out);
    await fsp.rm(png, { force: true });
    return {
      output: out,
      meta: {
        width: meta.width,
        height: meta.height,
        takenAt: null,
        format: 'pdf',
        orientation: undefined,
      },
    };
  } catch (error) {
    // Aufräumen, damit keine halben Renderings liegen bleiben.
    for (const entry of await fsp.readdir(outputDir).catch(() => [])) {
      if (entry.startsWith(`pdf-${taskId}`)) await fsp.rm(path.join(outputDir, entry), { force: true }).catch(() => {});
    }
    throw error;
  }
}

parentPort.on('message', async (message) => {
  const { taskId, file, outputDir, size, kind } = message;
  try {
    if (kind === 'pdf') {
      const result = await pdfThumbnail({ file, outputDir, size, taskId });
      parentPort.postMessage({ taskId, ok: true, ...result });
      return;
    }
    await fsp.mkdir(outputDir, { recursive: true });
    const image = sharp(file, { failOn: 'none', limitInputPixels: 268402689 });
    const meta = await image.metadata();
    let takenAt = null;
    if (meta.exif) {
      const text = Buffer.from(meta.exif).toString('latin1');
      const match = /(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(text);
      if (match) {
        const stamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
        if (stamp > 0) takenAt = stamp;
      }
    }
    const out = path.join(outputDir, `${size || 'original'}.webp`);
    if (size) {
      await image.rotate().resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80, effort: 4 }).toFile(out);
    } else {
      await image.rotate().webp({ quality: 86, effort: 4 }).toFile(out);
    }
    parentPort.postMessage({
      taskId,
      ok: true,
      output: out,
      meta: {
        width: meta.width,
        height: meta.height,
        takenAt,
        format: meta.format,
        orientation: meta.orientation,
      },
    });
  } catch (error) {
    parentPort.postMessage({ taskId, ok: false, error: error.message });
  }
});
