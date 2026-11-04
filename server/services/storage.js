import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { config, paths } from '../config.js';
import { id } from '../lib/ids.js';

export function tempPath(sessionId) {
  return path.join(paths.uploads, `${sessionId}.part`);
}

export function objectPath(hash) {
  return path.join(config.filesDir, 'objects', hash.slice(0, 2), hash);
}

export async function prepareUpload(size) {
  const sessionId = id(24);
  const file = tempPath(sessionId);
  await fsp.writeFile(file, '');
  if (size > 0) await fsp.truncate(file, size);
  return { sessionId, file };
}

export async function writeChunk(file, offset, stream) {
  const sink = fs.createWriteStream(file, { flags: 'r+', start: offset });
  let bytes = 0;
  const counter = new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      callback(null, chunk);
    }
  });
  await pipeline(stream, counter, sink);
  return bytes;
}

export async function fileSize(file) {
  try {
    const stat = await fsp.stat(file);
    return stat.size;
  } catch {
    return 0;
  }
}

export async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
}

export async function commitObject(tempFile) {
  const hash = await hashFile(tempFile);
  const target = objectPath(hash);
  await fsp.mkdir(path.dirname(target), { recursive: true });
  try {
    await fsp.access(target);
    await fsp.unlink(tempFile);
  } catch {
    try {
      await fsp.rename(tempFile, target);
    } catch {
      await fsp.copyFile(tempFile, target);
      await fsp.unlink(tempFile);
    }
  }
  return hash;
}

export async function removeObject(hash) {
  try {
    await fsp.unlink(objectPath(hash));
  } catch {
    // Already gone.
  }
}

export function readObject(hash, range) {
  return fs.createReadStream(objectPath(hash), range);
}

export async function copyObject(hash) {
  return hash;
}

export async function diskStats() {
  try {
    const stat = await fsp.statfs(config.filesDir);
    const total = stat.blocks * stat.bsize;
    const free = stat.bavail * stat.bsize;
    return { total, free, used: total - free };
  } catch {
    return { total: 0, free: 0, used: 0 };
  }
}

export async function cleanupTemp(maxAgeMs = 24 * 60 * 60 * 1000) {
  const files = await fsp.readdir(paths.uploads).catch(() => []);
  const now = Date.now();
  for (const file of files) {
    const full = path.join(paths.uploads, file);
    const stat = await fsp.stat(full).catch(() => null);
    if (stat && now - stat.mtimeMs > maxAgeMs) await fsp.unlink(full).catch(() => {});
  }
}

/**
 * Entfernt abgebrochene Upload-Sessions aus DB und Dateisystem. Läuft beim
 * Start und danach alle sechs Stunden; Standard sind 24 Stunden.
 */
export async function cleanupAbandonedUploads(maxAgeMs = 24 * 60 * 60 * 1000) {
  const [{ db, schema }, { eq, lt }] = await Promise.all([
    import('../db/index.js'),
    import('drizzle-orm'),
  ]);
  const cutoff = Date.now() - maxAgeMs;
  const rows = db.select().from(schema.uploadSessions).where(lt(schema.uploadSessions.updatedAt, cutoff)).all();
  for (const row of rows) {
    db.delete(schema.uploadSessions).where(eq(schema.uploadSessions.id, row.id)).run();
    await fsp.unlink(row.tempKey).catch(() => {});
  }
  await cleanupTemp(maxAgeMs);
  return rows.length;
}
