import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { hashToken } from '../lib/ids.js';
import { cleanName, nameKey } from '../lib/names.js';
import { ensureFolder } from '../services/backups.js';
import { commitObject, objectPath, tempPath, hashFile, fileSize } from '../services/storage.js';
import { activity } from '../services/nodes.js';
import { id } from '../lib/ids.js';
import { getSetting } from '../services/settings.js';
import { paths } from '../config.js';

const n = schema.nodes;

function agentAuth(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) throw forbidden('Agent token missing.');
  const raw = header.slice(7).trim();
  const agent = db.select().from(schema.backupAgents).where(eq(schema.backupAgents.tokenHash, hashToken(raw))).get();
  if (!agent) throw forbidden('Agent token is wrong.');
  db.update(schema.backupAgents).set({ lastSeenAt: Date.now() }).where(eq(schema.backupAgents.id, agent.id)).run();
  return agent;
}

function splitPath(value) {
  const parts = String(value || '').replaceAll('\\', '/').split('/').filter(Boolean).slice(0, 40);
  return parts.map((part) => cleanName(part, 'file'));
}

function nodeIndex(agent) {
  const rows = db.select().from(n).where(and(eq(n.ownerId, agent.ownerId), isNull(n.trashedAt))).all();
  const byId = new Map(rows.map((row) => [row.id, row]));
  const cache = new Map();
  function rel(row) {
    if (!row) return '';
    if (cache.has(row.id)) return cache.get(row.id);
    if (row.id === agent.rootFolderId) return '';
    const parent = byId.get(row.parentId);
    const value = parent ? [rel(parent), row.name].filter(Boolean).join('/') : null;
    cache.set(row.id, value);
    return value;
  }
  const byPath = new Map();
  for (const row of rows) {
    const p = rel(row);
    if (p) byPath.set(p, row);
  }
  return byPath;
}

export async function registerAgentRoutes(app) {
  app.get('/api/v1/agents/me', async (req) => {
    const agent = agentAuth(req);
    const version = String(req.headers['x-agent-version'] || agent.agentVersion || '0.0.0');
    if (version !== (agent.agentVersion || '0.0.0')) {
      db.update(schema.backupAgents).set({ agentVersion: version, lastSeenAt: Date.now() }).where(eq(schema.backupAgents.id, agent.id)).run();
    } else {
      db.update(schema.backupAgents).set({ lastSeenAt: Date.now() }).where(eq(schema.backupAgents.id, agent.id)).run();
    }
    const paths = db.select().from(schema.agentPaths).where(eq(schema.agentPaths.agentId, agent.id)).all();
    return { agent: { id: agent.id, name: agent.name, lastSeenAt: agent.lastSeenAt, agentVersion: version, createdAt: agent.createdAt }, paths: paths.map((row) => row.path) };
  });

  app.put('/api/v1/agents/me/paths', {
    schema: { body: { type: 'object', required: ['paths'], properties: { paths: { type: 'array', items: { type: 'string', maxLength: 1024 } } } } },
  }, async (req) => {
    const agent = agentAuth(req);
    db.delete(schema.agentPaths).where(eq(schema.agentPaths.agentId, agent.id)).run();
    for (const p of req.body.paths) db.insert(schema.agentPaths).values({ id: id(), agentId: agent.id, path: p }).run();
    return { ok: true };
  });

  app.get('/api/v1/agents/me/index', async (req) => {
    const agent = agentAuth(req);
    const byPath = nodeIndex(agent);
    return {
      root: agent.rootFolderId,
      files: [...byPath.entries()].filter(([, row]) => row.kind === 'file').map(([p, row]) => ({ path: p, hash: row.hash, size: row.size, mtime: row.updatedAt })),
    };
  });

  app.post('/api/v1/agents/me/file', async (req, reply) => {
    const agent = agentAuth(req);
    const rel = String(req.query.path || '');
    const expectedHash = String(req.query.hash || '');
    const parts = splitPath(rel);
    if (!parts.length) throw badRequest('A file path is required.');
    const size = Number(req.query.size || 0);
    if (!expectedHash || !/^[a-f0-9]{64}$/.test(expectedHash)) throw badRequest('A SHA-256 hash is required.');
    if (!req.body || typeof req.body.pipe !== 'function') throw badRequest('Expected a file stream.');
    const temp = tempPath(`agent-${id(16)}`);
    if (String(req.headers['content-encoding'] || '') === 'gzip') {
      await pipeline(req.body, createGunzip(), (await import('node:fs')).createWriteStream(temp));
    } else {
      await pipeline(req.body, (await import('node:fs')).createWriteStream(temp));
    }
    const actual = await hashFile(temp);
    if (actual !== expectedHash) {
      await fsp.unlink(temp).catch(() => {});
      throw badRequest('Uploaded content does not match its hash.');
    }
    const finalHash = await commitObject(temp);
    let parent = agent.rootFolderId;
    for (const part of parts.slice(0, -1)) parent = ensureFolder(agent.ownerId, parent, part).id;
    const fileName = parts.at(-1);
    const existing = db.select().from(n).where(and(eq(n.ownerId, agent.ownerId), eq(n.parentId, parent), eq(n.nameKey, nameKey(fileName)), eq(n.kind, 'file'), isNull(n.trashedAt))).get();
    const now = Date.now();
    if (existing) {
      db.update(n).set({ hash: finalHash, objectKey: finalHash, size: await fileSize(objectPath(finalHash)), updatedAt: now, mime: req.query.mime || existing.mime }).where(eq(n.id, existing.id)).run();
    } else {
      db.insert(n).values({
        id: id(), ownerId: agent.ownerId, parentId: parent, kind: 'file', name: fileName, nameKey: nameKey(fileName),
        size: size || await fileSize(objectPath(finalHash)), mime: String(req.query.mime || 'application/octet-stream'),
        hash: finalHash, objectKey: finalHash, storageId: 'local', createdAt: now, updatedAt: now,
      }).run();
    }
    reply.header('X-Onebox-Stored', finalHash);
    return reply.send({ ok: true, hash: finalHash });
  });

  app.post('/api/v1/agents/me/delete', {
    schema: { body: { type: 'object', required: ['paths'], properties: { paths: { type: 'array', items: { type: 'string' } } } } },
  }, async (req) => {
    const agent = agentAuth(req);
    const byPath = nodeIndex(agent);
    let removed = 0;
    for (const p of req.body.paths) {
      const row = byPath.get(p);
      if (row?.kind === 'file') {
        db.delete(n).where(eq(n.id, row.id)).run();
        removed += 1;
      }
    }
    return { removed };
  });

  app.post('/api/v1/agents/me/complete', {
    schema: { body: { type: 'object', properties: { files: { type: 'integer' }, bytes: { type: 'integer' }, deleted: { type: 'integer' } } } },
  }, async (req) => {
    const agent = agentAuth(req);
    activity(agent.ownerId, 'agent.run', 'backup_agent', agent.id, `${req.body.files || 0} files, ${req.body.bytes || 0} bytes`, req.ip);
    return { ok: true };
  });
}

export async function registerIngestRoutes(app) {
  const verify = (req) => {
    const header = String(req.headers.authorization || '');
    if (!header.startsWith('Bearer ')) throw forbidden('Receive token missing.');
    const raw = header.slice(7).trim();
    if (hashToken(raw) !== getSetting('ingestTokenHash')) throw forbidden('Receive token is wrong.');
    return getSetting('ingestOwnerId');
  };

  app.post('/api/v1/ingest/object', async (req) => {
    verify(req);
    const hash = String(req.query.hash || '');
    if (!/^[a-f0-9]{64}$/.test(hash)) throw badRequest('A valid hash is required.');
    if (!req.body || typeof req.body.pipe !== 'function') throw badRequest('Expected a stream.');
    if (objectPath(hash) && await fsp.stat(objectPath(hash)).then(() => true).catch(() => false)) return { ok: true, existing: true };
    const temp = tempPath(`ingest-${id(16)}`);
    const { createWriteStream } = await import('node:fs');
    await pipeline(req.body, createWriteStream(temp));
    const stored = await commitObject(temp);
    if (stored !== hash) throw badRequest('Object hash mismatch.');
    return { ok: true };
  });

  app.post('/api/v1/ingest/manifest', {
    schema: {
      body: {
        type: 'object', required: ['server', 'runId', 'manifest'],
        properties: { server: { type: 'string', maxLength: 120 }, runId: { type: 'string', maxLength: 64 }, manifest: { type: 'object' } },
      },
    },
  }, async (req) => {
    const ownerId = verify(req);
    const { server, runId, manifest } = req.body;
    const backups = ensureFolder(ownerId, null, 'Backups');
    const remote = ensureFolder(ownerId, backups.id, 'Remote');
    const serverFolder = ensureFolder(ownerId, remote.id, cleanName(server, 'Server'));
    const runFolder = ensureFolder(ownerId, serverFolder.id, cleanName(runId, 'Run'));
    const map = new Map();
    const ordered = [...manifest.nodes].sort((a, b) => (a.kind === 'folder' ? -1 : 1) - (b.kind === 'folder' ? -1 : 1));
    for (const node of ordered) {
      const parentId = node.parentId ? map.get(node.parentId) || runFolder.id : runFolder.id;
      if (node.kind === 'folder') {
        map.set(node.id, ensureFolder(ownerId, parentId, cleanName(node.name, 'Folder')).id);
        continue;
      }
      if (!node.hash) continue;
      const fileName = cleanName(node.name, 'File');
      const existing = db.select().from(n).where(and(eq(n.ownerId, ownerId), eq(n.parentId, parentId), eq(n.nameKey, nameKey(fileName)), eq(n.kind, 'file'))).get();
      if (existing) continue;
      db.insert(n).values({
        id: id(), ownerId, parentId, kind: 'file', name: fileName, nameKey: nameKey(fileName),
        size: node.size || 0, mime: node.mime || 'application/octet-stream', hash: node.hash, objectKey: node.hash,
        takenAt: node.takenAt || null, createdAt: Date.now(), updatedAt: Date.now(),
      }).run();
    }
    await fsp.mkdir(paths.runtime, { recursive: true });
    const manifestPath = path.join(paths.runtime, `ingest-${runId}.json`);
    await fsp.writeFile(manifestPath, JSON.stringify(manifest));
    return { ok: true, folderId: runFolder.id };
  });

  app.get('/api/v1/ingest/object/:hash', async (req, reply) => {
    verify(req);
    const hash = req.params.hash;
    if (!/^[a-f0-9]{64}$/.test(hash)) throw badRequest('Bad hash.');
    const file = objectPath(hash);
    if (!(await fsp.stat(file).then(() => true).catch(() => false))) throw notFound('Object not found.');
    reply.type('application/octet-stream');
    return reply.send((await import('node:fs')).createReadStream(file));
  });
}
