import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { ZipArchive } from 'archiver';
import yauzl from 'yauzl';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { db, schema, sqlite } from '../db/index.js';
import { id } from '../lib/ids.js';
import { badRequest, notFound, tooLarge } from '../lib/errors.js';
import { cleanName, mimeOf, nameKey, extOf } from '../lib/names.js';
import {
  activity, assertQuota, createFile, createFolder, getNode, quotaFor, selectionRows,
  uniqueName, usedBytes,
} from './nodes.js';
import { commitObject, objectPath, removeObject, tempPath } from './storage.js';

const n = schema.nodes;

// Schutz vor Zip-Bomben und versehentlich riesigen Archiven.
export const ZIP_LIMITS = {
  maxFiles: Number(process.env.ZIP_MAX_FILES || 10000),
  maxTotalBytes: Number(process.env.ZIP_MAX_BYTES || 4 * 1024 * 1024 * 1024),
  maxRatioPerEntry: Number(process.env.ZIP_MAX_RATIO || 1000),
  maxTotalRatio: Number(process.env.ZIP_MAX_TOTAL_RATIO || 250),
};

const jobs = new Map();
const JOB_TTL = 30 * 60 * 1000;

function pruneJobs() {
  const now = Date.now();
  for (const [key, job] of jobs) {
    if (job.state !== 'running' && job.state !== 'queued' && now - job.updatedAt > JOB_TTL) jobs.delete(key);
  }
}

export function publicJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    kind: job.kind,
    state: job.state,
    processed: job.processed,
    total: job.total,
    bytes: job.bytes,
    current: job.current || null,
    message: job.message || null,
    result: job.result || null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function createJob(userId, kind, extra = {}) {
  pruneJobs();
  const job = {
    id: id(18),
    userId,
    kind,
    state: 'queued',
    processed: 0,
    total: 0,
    bytes: 0,
    current: null,
    message: null,
    result: null,
    cancelled: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...extra,
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(userId, jobId) {
  const job = jobs.get(jobId);
  if (!job || job.userId !== userId) throw notFound('Auftrag nicht gefunden.');
  return job;
}

export function cancelJob(userId, jobId) {
  const job = getJob(userId, jobId);
  if (job.cancelled || ['done', 'error', 'cancelled'].includes(job.state)) return publicJob(job);
  job.cancelled = true;
  job.current = null;
  try { job.abort?.(); } catch { /* already closed */ }
  if (job.state === 'queued') {
    job.state = 'cancelled';
    job.updatedAt = Date.now();
  }
  return publicJob(job);
}

function setState(job, state, message = null) {
  job.state = state;
  job.message = message;
  job.updatedAt = Date.now();
}

function isZipNode(node) {
  return node.kind === 'file' && (node.mime === 'application/zip' || extOf(node.name) === 'zip');
}

function archiveName(name) {
  return name.replaceAll('\\', '/').replace(/^\/+/, '');
}

function uniqueTopName(name, used) {
  let candidate = name;
  if (!used.has(candidate.toLocaleLowerCase('de'))) {
    used.add(candidate.toLocaleLowerCase('de'));
    return candidate;
  }
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let index = 2; index < 10000; index += 1) {
    candidate = `${stem} (${index})${ext}`;
    if (!used.has(candidate.toLocaleLowerCase('de'))) {
      used.add(candidate.toLocaleLowerCase('de'));
      return candidate;
    }
  }
  candidate = `${stem}-${Date.now()}${ext}`;
  used.add(candidate.toLocaleLowerCase('de'));
  return candidate;
}

function descendantsWithPaths(userId, folderId) {
  return sqlite.prepare(`
    with recursive tree(id, parent_id, name, kind, hash, size, rel) as (
      select id, parent_id, name, kind, hash, size, name from nodes
        where parent_id = ? and owner_id = ? and trashed_at is null
      union all
      select n.id, n.parent_id, n.name, n.kind, n.hash, n.size, tree.rel || '/' || n.name
        from nodes n join tree on n.parent_id = tree.id
        where n.owner_id = ? and n.trashed_at is null
    ) select id, name, kind, hash, size, rel from tree
  `).all(folderId, userId, userId);
}

/**
 * Erzeugt die Eintragsliste für ein ZIP. Ordnernamen bleiben als Präfix
 * erhalten, doppelte Namen auf oberster Ebene werden eindeutig gemacht.
 */
export function collectZipEntries(userId, rows) {
  const entries = [];
  const used = new Set();
  for (const row of rows) {
    if (!row || row.trashedAt) continue;
    const top = uniqueTopName(row.name, used);
    if (row.kind === 'folder') {
      entries.push({ name: top, kind: 'folder' });
      for (const child of descendantsWithPaths(userId, row.id)) {
        entries.push({
          name: archiveName(`${top}/${child.rel}`),
          kind: child.kind,
          hash: child.hash,
          size: child.size,
        });
      }
    } else {
      entries.push({ name: top, kind: 'file', hash: row.hash, size: row.size });
    }
  }
  return entries;
}

function addEntries(archive, entries, job = null) {
  let total = 0;
  for (const entry of entries) {
    if (job?.cancelled) break;
    if (entry.kind === 'folder') {
      archive.append('', { name: `${entry.name.replace(/\/+$/, '')}/` });
    } else {
      if (!entry.hash) continue;
      const file = objectPath(entry.hash);
      if (!fs.existsSync(file)) continue;
      archive.file(file, { name: entry.name });
      total += 1;
    }
  }
  return total;
}

function waitForArchive(archive, output, job) {
  return new Promise((resolve, reject) => {
    archive.on('warning', (error) => {
      if (error.code !== 'ENOENT') reject(error);
    });
    archive.on('error', reject);
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('progress', (progress) => {
      if (job) {
        job.processed = progress.entries?.processed ?? job.processed;
        job.total = progress.entries?.total ?? job.total;
        job.bytes = progress.fs?.processedBytes ?? job.bytes;
        job.updatedAt = Date.now();
      }
    });
    if (job) {
      job.abort = () => {
        try { archive.abort(); } catch { /* noop */ }
        output.destroy(new Error('cancelled'));
      };
    }
  });
}

export function streamSelectionZip(reply, request, userId, selection) {
  const rows = selectionRows(userId, selection);
  if (!rows.length) throw badRequest('Keine Elemente ausgewählt.');
  const entries = collectZipEntries(userId, rows);
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `Archiv ${stamp}.zip`;
  reply.header('Content-Type', 'application/zip');
  reply.header('Content-Disposition', `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  reply.header('Cache-Control', 'private, no-store');
  const abort = () => { try { archive.abort(); } catch { /* noop */ } };
  reply.raw.once('close', abort);
  archive.on('error', abort);
  addEntries(archive, entries);
  archive.finalize();
  return reply.send(archive);
}

async function runZipJob(job, user, body) {
  setState(job, 'running');
  let temp = null;
  let output = null;
  try {
    const rows = selectionRows(user.id, body.selection || body);
    if (!rows.length) throw badRequest('Keine Elemente ausgewählt.');
    const entries = collectZipEntries(user.id, rows);
    const parentId = body.parentId || null;
    if (parentId) {
      const parent = getNode(parentId, user.id);
      if (parent.kind !== 'folder') throw badRequest('Ziel ist kein Ordner.');
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const desired = cleanName(body.name || `Archiv ${stamp}.zip`, `Archiv ${stamp}.zip`);
    const finalName = /\.zip$/i.test(desired) ? desired : `${desired}.zip`;
    job.total = entries.filter((entry) => entry.kind === 'file').length;
    job.updatedAt = Date.now();

    temp = tempPath(id(24));
    output = fs.createWriteStream(temp);
    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.pipe(output);
    const done = waitForArchive(archive, output, job);
    addEntries(archive, entries, job);
    archive.finalize();
    await done;

    if (job.cancelled) {
      await fsp.unlink(temp).catch(() => {});
      temp = null;
      setState(job, 'cancelled', 'ZIP-Erstellung abgebrochen.');
      return;
    }

    const node = await createFile({ user, parentId, name: finalName, mime: 'application/zip', tempFile: temp });
    temp = null;
    job.result = { node, name: node.name, count: entries.filter((entry) => entry.kind === 'file').length };
    job.processed = job.total;
    setState(job, 'done');
    activity(user.id, 'file.zip', 'node', node.id, node.name, null);
  } catch (error) {
    if (job.cancelled) {
      setState(job, 'cancelled', 'ZIP-Erstellung abgebrochen.');
    } else {
      setState(job, 'error', error.message || 'ZIP konnte nicht erstellt werden.');
    }
  } finally {
    if (temp) await fsp.unlink(temp).catch(() => {});
    output?.destroy?.();
  }
}

export function startZipJob(user, body) {
  const job = createJob(user.id, 'zip');
  void runZipJob(job, user, body);
  return publicJob(job);
}

function openZip(file) {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: true }, (error, zipfile) => {
      if (error) reject(error);
      else resolve(zipfile);
    });
  });
}

function readZipEntries(zipfile) {
  return new Promise((resolve, reject) => {
    const entries = [];
    zipfile.on('entry', (entry) => {
      entries.push(entry);
      zipfile.readEntry();
    });
    zipfile.on('end', () => resolve(entries));
    zipfile.on('error', reject);
    zipfile.readEntry();
  });
}

function safeEntryName(entry) {
  const raw = String(entry.fileName || '');
  if (!raw || raw.includes('\u0000')) throw badRequest('Ungültiger Dateiname im ZIP.');
  if (raw.includes('\\') || raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) {
    throw badRequest(`Unsicherer Pfad im ZIP: ${raw}`);
  }
  const parts = raw.split('/');
  if (parts.some((part) => part === '..')) throw badRequest(`Unsicherer Pfad im ZIP: ${raw}`);
  return parts.filter((part) => part && part !== '.').join('/');
}

function validateZip(entries) {
  let files = 0;
  let totalBytes = 0;
  let compressedBytes = 0;
  for (const entry of entries) {
    const name = safeEntryName(entry);
    if (!name) continue;
    if (name.endsWith('/')) continue;
    files += 1;
    totalBytes += entry.uncompressedSize || 0;
    compressedBytes += entry.compressedSize || 0;
    if (entry.uncompressedSize > ZIP_LIMITS.maxTotalBytes) {
      throw tooLarge('Das ZIP enthält eine Datei, die zu groß ist.');
    }
    if (entry.uncompressedSize > 0) {
      const ratio = entry.uncompressedSize / Math.max(1, entry.compressedSize || 0);
      if (ratio > ZIP_LIMITS.maxRatioPerEntry) {
        throw badRequest('Das ZIP wirkt wie eine Zip-Bombe (zu hohes Kompressionsverhältnis).');
      }
    }
    if (files > ZIP_LIMITS.maxFiles) {
      throw tooLarge(`Das ZIP enthält mehr als ${ZIP_LIMITS.maxFiles} Dateien.`);
    }
    if (totalBytes > ZIP_LIMITS.maxTotalBytes) {
      throw tooLarge('Das ZIP ist entpackt zu groß.');
    }
  }
  if (compressedBytes > 0 && totalBytes / compressedBytes > ZIP_LIMITS.maxTotalRatio) {
    throw badRequest('Das ZIP wirkt wie eine Zip-Bombe (zu hohes Gesamt-Kompressionsverhältnis).');
  }
  return { files, totalBytes };
}

function findChild(userId, parentId, name) {
  const clauses = [eq(n.ownerId, userId), eq(n.nameKey, nameKey(name)), isNull(n.trashedAt)];
  if (parentId) clauses.push(eq(n.parentId, parentId));
  else clauses.push(isNull(n.parentId));
  return db.select().from(n).where(and(...clauses)).get();
}

function ensureFolderPath(job, userId, rootId, parts) {
  let parentId = rootId;
  for (const part of parts) {
    if (job.cancelled) throw Object.assign(new Error('cancelled'), { cancelled: true });
    let existing = findChild(userId, parentId, part);
    if (existing && existing.kind === 'folder') {
      parentId = existing.id;
      continue;
    }
    if (existing && existing.kind === 'file') {
      if (job.conflict === 'skip') throw Object.assign(new Error('skip'), { skip: true });
      if (job.conflict === 'replace') {
        // Eine Datei kann nicht als Ordner dienen; wir ersetzen sie durch den Ordner.
        db.delete(n).where(eq(n.id, existing.id)).run();
        existing = null;
      }
    }
    const folder = createFolder(userId, parentId, part);
    parentId = folder.id;
  }
  return parentId;
}

function baseFolderName(zipName) {
  return cleanName(zipName.replace(/\.zip$/i, '') || 'Entpackt', 'Entpackt');
}

async function writeEntryToTemp(zipfile, entry, job) {
  const temp = tempPath(id(24));
  await new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (error, stream) => {
      if (error) return reject(error);
      let received = 0;
      const counter = new Transform({
        transform(chunk, encoding, callback) {
          received += chunk.length;
          if (received > ZIP_LIMITS.maxTotalBytes) return callback(new Error('ZIP entry is too large.'));
          callback(null, chunk);
        },
      });
      job._stream = stream;
      pipeline(stream, counter, fs.createWriteStream(temp)).then(resolve).catch(reject);
    });
  }).finally(() => { job._stream = null; });
  return temp;
}

async function runExtractJob(job, user, zipNode, options) {
  setState(job, 'running');
  const zipPath = objectPath(zipNode.hash);
  if (!zipNode.hash || !fs.existsSync(zipPath)) throw notFound('ZIP-Datei fehlt auf dem Datenträger.');
  const metaZip = await openZip(zipPath);
  let entries;
  try {
    entries = await readZipEntries(metaZip);
  } catch (error) {
    if (/relative path|absolute path|invalid.*path/i.test(error.message || '')) {
      throw badRequest('Unsicherer Pfad im ZIP. Das Archiv wurde abgelehnt.');
    }
    throw error;
  }
  const plan = validateZip(entries);

  const quota = quotaFor(user);
  if (quota > 0 && usedBytes(user.id) + plan.totalBytes > quota) {
    throw tooLarge('Der Speicherplatz reicht für das entpackte ZIP nicht aus.');
  }

  const target = options.target === 'newFolder' ? 'newFolder' : 'here';
  let rootId = zipNode.parentId || null;
  let folder = null;
  if (target === 'newFolder') {
    folder = createFolder(user.id, rootId, options.folderName || baseFolderName(zipNode.name));
    rootId = folder.id;
  }

  job.total = plan.files;
  job.conflict = ['skip', 'replace', 'keepBoth'].includes(options.conflict) ? options.conflict : 'keepBoth';
  job.updatedAt = Date.now();

  const zipfile = await openZip(zipPath);
  job.abort = () => {
    try { zipfile.close(); } catch { /* noop */ }
    job._stream?.destroy?.(new Error('cancelled'));
  };

  let extracted = 0;
  let skipped = 0;
  let foldersCreated = 0;

  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };

    zipfile.on('entry', (entry) => {
      (async () => {
        if (job.cancelled) {
          try { zipfile.close(); } catch { /* noop */ }
          return finish();
        }
        const name = safeEntryName(entry);
        if (!name) return;
        job.current = name;
        const isDirectory = name.endsWith('/') || entry.fileName.endsWith('/');
        const parts = name.replace(/\/+$/, '').split('/').filter(Boolean);
        if (!parts.length) return;
        if (isDirectory) {
          ensureFolderPath(job, user.id, rootId, parts);
          foldersCreated += 1;
          return;
        }
        const fileName = parts.pop();
        const parentId = ensureFolderPath(job, user.id, rootId, parts);
        let existing = findChild(user.id, parentId, fileName);
        let finalName = fileName;
        if (existing) {
          if (job.conflict === 'skip') {
            skipped += 1;
            return;
          }
          if (job.conflict === 'keepBoth' || existing.kind !== 'file') {
            finalName = uniqueName(user.id, parentId, fileName);
            existing = null;
          }
        }
        const temp = await writeEntryToTemp(zipfile, entry, job);
        try {
          const size = (await fsp.stat(temp)).size;
          if (job.cancelled) return;
          if (job.bytes + size > ZIP_LIMITS.maxTotalBytes) {
            throw tooLarge('Das ZIP ist entpackt zu groß.');
          }
          if (existing) {
            const hash = await commitObject(temp);
            db.update(n).set({
              name: finalName,
              nameKey: nameKey(finalName),
              mime: entry.fileName.toLowerCase().endsWith('.zip') ? 'application/zip' : mimeOf(finalName),
              hash,
              objectKey: hash,
              size,
              updatedAt: Date.now(),
            }).where(eq(n.id, existing.id)).run();
            if (existing.hash && existing.hash !== hash) {
              const other = db.select({ id: n.id }).from(n)
                .where(and(eq(n.hash, existing.hash), ne(n.id, existing.id))).get();
              if (!other) await removeObject(existing.hash);
            }
          } else {
            await createFile({ user, parentId, name: finalName, mime: mimeOf(finalName), tempFile: temp });
          }
          extracted += 1;
          job.bytes += size;
        } finally {
          await fsp.unlink(temp).catch(() => {});
        }
      })().then(() => {
        job.processed = Math.min(job.total, extracted + skipped);
        job.updatedAt = Date.now();
        zipfile.readEntry();
      }).catch((error) => {
        if (error?.skip) {
          skipped += 1;
          zipfile.readEntry();
          return;
        }
        finish(error);
      });
    });
    zipfile.on('end', () => finish());
    zipfile.on('error', finish);
    zipfile.readEntry();
  });

  if (job.cancelled) {
    setState(job, 'cancelled', 'Entpacken abgebrochen.');
    return;
  }
  job.result = {
    extracted,
    skipped,
    foldersCreated,
    folderId: folder?.id || rootId,
    folderName: folder?.name || null,
  };
  job.processed = job.total;
  setState(job, 'done');
  activity(user.id, 'file.unzip', 'node', zipNode.id, `${extracted} Datei(en) entpackt`, null);
}

export function startExtractJob(user, zipNode, options = {}) {
  const job = createJob(user.id, 'extract');
  void runExtractJob(job, user, zipNode, options).catch((error) => {
    if (job.cancelled) setState(job, 'cancelled', 'Entpacken abgebrochen.');
    else setState(job, 'error', error.message || 'ZIP konnte nicht entpackt werden.');
  });
  return publicJob(job);
}

export { isZipNode };
