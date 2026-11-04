import { parentPort } from 'node:worker_threads';
import fsp from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SIZES = [320, 768, 1600];

parentPort.on('message', async (message) => {
  const { taskId, file, outputDir, size } = message;
  try {
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
