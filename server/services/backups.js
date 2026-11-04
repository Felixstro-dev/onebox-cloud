import { execSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, schema, sqlite } from '../db/index.js';
import { config, paths } from '../config.js';
import { id, hashToken } from '../lib/ids.js';
import { badRequest, notFound } from '../lib/errors.js';
import { activity, getNode, uniqueName } from './nodes.js';
import { objectPath, commitObject, tempPath } from './storage.js';
import { jobs } from './runtime.js';
import { realtime } from './realtime.js';

const n = schema.nodes;

export function agentRoot(ownerId, name = 'Backups') {
  let folder = db.select().from(n).where(and(eq(n.ownerId, ownerId), isNull(n.parentId), eq(n.kind, 'folder'), eq(n.nameKey, name.toLocaleLowerCase('de')))).get();
  if (!folder) {
    const now = Date.now();
    folder = { id: id(), ownerId, parentId: null, kind: 'folder', name, nameKey: name.toLocaleLowerCase('de'), size: 0, mime: 'inode/directory', storageId: 'local', createdAt: now, updatedAt: now };
    db.insert(n).values(folder).run();
  }
  return folder;
}

export function ensureFolder(ownerId, parentId, name) {
  const nameKey = name.toLocaleLowerCase('de');
  let folder = db.select().from(n).where(and(eq(n.ownerId, ownerId), eq(n.parentId, parentId), eq(n.kind, 'folder'), eq(n.nameKey, nameKey), isNull(n.trashedAt))).get();
  if (!folder) {
    const finalName = uniqueName(ownerId, parentId, name);
    const now = Date.now();
    folder = { id: id(), ownerId, parentId, kind: 'folder', name: finalName, nameKey: finalName.toLocaleLowerCase('de'), size: 0, mime: 'inode/directory', storageId: 'local', createdAt: now, updatedAt: now };
    db.insert(n).values(folder).run();
  }
  return folder;
}

function collect(ownerId, sourceNodeId) {
  if (sourceNodeId) {
    const source = getNode(sourceNodeId, ownerId);
    if (source.kind !== 'folder') throw badRequest('Backups need a folder as source.');
    const rows = sqlite.prepare(`
      with recursive tree(id) as (
        select id from nodes where id = ?
        union all select n.id from nodes n join tree on n.parent_id = tree.id where n.owner_id = ?
      )
      select * from nodes where id in (select id from tree)
    `).all(source.id, ownerId);
    return rows;
  }
  return db.select().from(n).where(and(eq(n.ownerId, ownerId), isNull(n.trashedAt))).all();
}

function manifestFor(rows, job) {
  return {
    version: 1,
    createdAt: Date.now(),
    jobId: job.id,
    sourceNodeId: job.sourceNodeId || null,
    nodes: rows.map((row) => ({
      id: row.id, parentId: row.parentId, kind: row.kind, name: row.name, mime: row.mime,
      size: row.size, hash: row.hash, width: row.width, height: row.height, takenAt: row.takenAt,
      createdAt: row.createdAt, updatedAt: row.updatedAt,
    })),
  };
}

async function runLocal(job, run, manifest, objects) {
  const cfg = JSON.parse(job.targetConfig || '{}');
  if (!cfg.path) throw new Error('No target directory configured.');
  const versionTag = job.name ? job.name.replace(/[^\w]/g, '-') : 'backup';
  const dated = new Date(run.startedAt || Date.now()).toISOString().slice(0, 10);
  const runDir = path.join(cfg.path, 'onebox', `${versionTag}-${dated}-${run.id}`);
  await fsp.mkdir(path.join(runDir, 'objects'), { recursive: true });
  for (const hash of objects) {
    const target = path.join(runDir, 'objects', hash);
    if (fs.existsSync(target)) continue;
    const source = objectPath(hash);
    if (fs.existsSync(source)) {
      try { await fsp.link(source, target); } catch { await fsp.copyFile(source, target); }
    }
  }
  if (job.ownerId) {
    const snapshot = path.join(runDir, 'database.sqlite');
    await sqlite.backup(snapshot);
  }
  await fsp.writeFile(path.join(runDir, 'manifest.json'), JSON.stringify(manifest));
  if (cfg.compress) {
    const gz = fs.createWriteStream(path.join(runDir, 'manifest.json.gz'));
    fs.createReadStream(path.join(runDir, 'manifest.json')).pipe(require('node:zlib').createGzip()).pipe(gz);
    await new Promise((r) => gz.on('finish', r));
  }
  return runDir;
}

async function pushRemote(job, run, manifest, objects) {
  const cfg = JSON.parse(job.targetConfig || '{}');
  if (!cfg.url || !cfg.token) throw new Error('Remote target needs a URL and token.');
  const base = cfg.url.replace(/\/$/, '');
  const headers = { Authorization: `Bearer ${cfg.token}` };
  for (const hash of objects) {
    const source = objectPath(hash);
    if (!fs.existsSync(source)) continue;
    const res = await fetch(`${base}/api/v1/ingest/object?hash=${hash}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/octet-stream' }, body: fs.createReadStream(source), duplex: 'half' });
    if (!res.ok) throw new Error(`Remote object upload failed (${res.status}).`);
  }
  const res = await fetch(`${base}/api/v1/ingest/manifest`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ server: cfg.serverName || job.name, runId: run.id, manifest }) });
  if (!res.ok) throw new Error(`Remote manifest upload failed (${res.status}).`);
  return null;
}

export async function executeRun(job, { trigger = 'manual' } = {}) {
  const run = {
    id: id(), jobId: job.id, status: 'queued', trigger, startedAt: null, finishedAt: null,
    fileCount: 0, size: 0, manifest: null, error: null, createdAt: Date.now(),
  };
  db.insert(schema.backupRuns).values(run).run();
  realtime.send(job.ownerId, { type: 'backup.queued', run });
  return jobs.backups.add(async () => {
    db.update(schema.backupRuns).set({ status: 'running', startedAt: Date.now() }).where(eq(schema.backupRuns.id, run.id)).run();
    realtime.send(job.ownerId, { type: 'backup.running', run: { ...run, status: 'running' } });
    try {
      if (job.preRun) { try { execSync(job.preRun, { stdio: 'inherit' }); } catch (e) { console.error('Pre-run error:', e.message); } }
      const rows = collect(job.ownerId, job.sourceNodeId);
      const manifest = manifestFor(rows, job);
      const objects = [...new Set(rows.filter((row) => row.kind === 'file' && row.hash).map((row) => row.hash))];
      const totalSize = rows.filter((row) => row.kind === 'file').reduce((sum, row) => sum + row.size, 0);
      let dir = null;
      if (job.targetType === 'onebox') dir = await pushRemote(job, run, manifest, objects);
      else dir = await runLocal(job, run, manifest, objects);
      const manifestPath = path.join(paths.runtime, `run-${run.id}.json`);
      await fsp.writeFile(manifestPath, JSON.stringify(manifest));
      db.update(schema.backupRuns).set({
        status: 'success', finishedAt: Date.now(), fileCount: rows.filter((row) => row.kind === 'file').length,
        size: totalSize, manifest: manifestPath,
      }).where(eq(schema.backupRuns.id, run.id)).run();
      db.update(schema.backupJobs).set({ lastRunAt: Date.now() }).where(eq(schema.backupJobs.id, job.id)).run();
      await applyRetention(job);
      if (job.postRun) { try { execSync(job.postRun, { stdio: 'inherit' }); } catch (e) { console.error('Post-run error:', e.message); } }
      const done = db.select().from(schema.backupRuns).where(eq(schema.backupRuns.id, run.id)).get();
      realtime.send(job.ownerId, { type: 'backup.done', run: done });
      activity(job.ownerId, 'backup.run', 'backup_job', job.id, `${done.fileCount} files`, null);
      return done;
    } catch (error) {
      db.update(schema.backupRuns).set({ status: 'failed', finishedAt: Date.now(), error: error.message }).where(eq(schema.backupRuns.id, run.id)).run();
      const failed = db.select().from(schema.backupRuns).where(eq(schema.backupRuns.id, run.id)).get();
      realtime.send(job.ownerId, { type: 'backup.failed', run: failed });
      throw error;
    }
  }, { jobId: job.id, runId: run.id });
}

async function applyRetention(job) {
  if (!job.retention || job.retention < 1) return;
  const runs = db.select().from(schema.backupRuns).where(and(eq(schema.backupRuns.jobId, job.id), eq(schema.backupRuns.status, 'success'))).orderBy(sql`${schema.backupRuns.createdAt} desc`).all();
  const removable = runs.slice(job.retention);
  const cfg = JSON.parse(job.targetConfig || '{}');
  for (const run of removable) {
    if (job.targetType === 'local' && cfg.path) {
      await fsp.rm(path.join(cfg.path, 'onebox', job.id, run.id), { recursive: true, force: true }).catch(() => {});
    }
    if (run.manifest) await fsp.unlink(run.manifest).catch(() => {});
    db.delete(schema.backupRuns).where(eq(schema.backupRuns.id, run.id)).run();
  }
}

export async function restoreRun(job, run, ownerId, targetParentId) {
  if (!run.manifest || !fs.existsSync(run.manifest)) throw notFound('Manifest for this run is missing.');
  const manifest = JSON.parse(await fsp.readFile(run.manifest, 'utf8'));
  const cfg = JSON.parse(job.targetConfig || '{}');
  const rows = manifest.nodes;
  const set = new Set(rows.map((row) => row.id));
  const roots = rows.filter((row) => !row.parentId || !set.has(row.parentId));
  const stamp = new Date().toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }).replace(/[/:]/g, '-');
  const destination = ensureFolder(ownerId, targetParentId || null, `Restored ${stamp}`);
  const map = new Map();
  const ordered = [...rows].sort((a, b) => (a.kind === 'folder' ? -1 : 1) - (b.kind === 'folder' ? -1 : 1));
  let count = 0;
  for (const node of ordered) {
    const parentId = node.parentId ? map.get(node.parentId) ?? destination.id : destination.id;
    if (node.kind === 'folder') {
      const folder = ensureFolder(ownerId, parentId, node.name);
      map.set(node.id, folder.id);
      continue;
    }
    if (!node.hash) continue;
    if (!fs.existsSync(objectPath(node.hash))) {
      if (job.targetType === 'local') {
        const source = path.join(cfg.path, 'onebox', job.id, run.id, 'objects', node.hash);
        if (fs.existsSync(source)) {
          await fsp.mkdir(path.dirname(objectPath(node.hash)), { recursive: true });
          await fsp.copyFile(source, objectPath(node.hash));
        }
      } else {
        const res = await fetch(`${cfg.url.replace(/\/$/, '')}/api/v1/ingest/object/${node.hash}`, { headers: { Authorization: `Bearer ${cfg.token}` } });
        if (res.ok) {
          await fsp.mkdir(path.dirname(objectPath(node.hash)), { recursive: true });
          await fsp.writeFile(objectPath(node.hash), Buffer.from(await res.arrayBuffer()));
        }
      }
    }
    if (!fs.existsSync(objectPath(node.hash))) continue;
    const finalName = uniqueName(ownerId, parentId, node.name);
    const now = Date.now();
    db.insert(n).values({
      id: id(), ownerId, parentId, kind: 'file', name: finalName, nameKey: finalName.toLocaleLowerCase('de'),
      size: node.size, mime: node.mime, hash: node.hash, objectKey: node.hash, width: node.width, height: node.height,
      takenAt: node.takenAt, createdAt: node.createdAt || now, updatedAt: now,
    }).run();
    count += 1;
  }
  activity(ownerId, 'backup.restore', 'backup_job', job.id, `${count} files restored`, null);
  return { folderId: destination.id, files: count };
}
