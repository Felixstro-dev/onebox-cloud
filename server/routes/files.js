import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireUser } from '../services/auth.js';
import {
  breadcrumbs, copyNode, createFolder, deleteForever, getNode, listChildren, moveNode, purgeTrash,
  renameNode, restoreTrash, searchNodes, toClient, trashNodes, trashSelection, selectionRows, selectionCount,
  activity, resolvePath,
} from '../services/nodes.js';
import { badRequest, notFound } from '../lib/errors.js';
import { objectPath, readObject, commitObject, tempPath, hashFile, fileSize } from '../services/storage.js';
import crypto from 'node:crypto';
import { safeInlineMime, isImage } from '../lib/names.js';
import { thumbnails } from '../services/runtime.js';

const MAX_RANGE_CHUNK = 8 * 1024 * 1024;

const selectAllSchema = {
  ids: { type: 'array', items: { type: 'string' } },
  selectAll: { type: 'boolean' },
  filter: {
    type: 'object',
    properties: {
      parentId: { type: ['string', 'null'] },
      q: { type: ['string', 'null'] },
      kind: { type: ['string', 'null'] },
      sort: { type: 'string' },
      dir: { type: 'string' },
    },
  },
  exclude: { type: 'array', items: { type: 'string' } },
  snapshot: { type: 'integer' },
};

function contentDisposition(name, inline = false) {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  let start = match[1] ? Number(match[1]) : null;
  let end = match[2] ? Number(match[2]) : null;
  if (start === null && end === null) return null;
  if (start === null) {
    start = Math.max(0, size - end);
    end = size - 1;
  } else if (end === null || end >= size) {
    end = size - 1;
  }
  if (start > end || start >= size) return { invalid: true };
  if (end - start + 1 > MAX_RANGE_CHUNK) end = start + MAX_RANGE_CHUNK - 1;
  return { start, end };
}

export function sendFile(reply, node, { inline = false, rangeHeader = null } = {}) {
  if (!node.hash) throw notFound('File content is missing.');
  const file = objectPath(node.hash);
  if (!fs.existsSync(file)) throw notFound('File content is missing on disk.');
  const size = node.size;
  const range = parseRange(rangeHeader, size);
  const base = {
    'Content-Type': inline ? safeInlineMime(node.mime) : (node.mime === 'text/html' || node.mime === 'image/svg+xml' ? 'application/octet-stream' : node.mime),
    'Content-Disposition': contentDisposition(node.name, inline),
    'Cache-Control': inline ? 'private, max-age=3600' : 'private, no-store',
    'Accept-Ranges': 'bytes',
    'Last-Modified': new Date(node.updatedAt).toUTCString(),
    'X-Content-Type-Options': 'nosniff',
  };
  if (range?.invalid) {
    return reply.status(416).header('Content-Range', `bytes */${size}`).send();
  }
  if (range) {
    for (const [key, value] of Object.entries(base)) reply.header(key, value);
    reply.header('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    reply.header('Content-Length', range.end - range.start + 1);
    return reply.status(206).send(readObject(node.hash, { start: range.start, end: range.end }));
  }
  for (const [key, value] of Object.entries(base)) reply.header(key, value);
  reply.header('Content-Length', size);
  return reply.send(readObject(node.hash));
}

export async function registerFileRoutes(app) {
  app.get('/api/v1/files', async (req) => {
    const user = requireUser(req);
    const parentId = req.query.parent && req.query.parent !== 'root' ? String(req.query.parent) : null;
    if (parentId) getNode(parentId, user.id);
    const result = listChildren(user.id, parentId, {
      sort: String(req.query.sort || 'name'),
      dir: String(req.query.dir || 'asc'),
      limit: Math.min(200, Math.max(1, Number(req.query.limit) || 100)),
      cursor: req.query.cursor ? String(req.query.cursor) : null,
      kind: req.query.kind ? String(req.query.kind) : null,
    });
    return {
      ...result,
      parentId,
      breadcrumbs: parentId ? breadcrumbs(user.id, parentId) : [],
    };
  });

  app.get('/api/v1/files/search', async (req) => {
    const user = requireUser(req);
    const query = String(req.query.q || '').trim();
    if (query.length < 1) return { items: [] };
    return { items: searchNodes(user.id, query, { limit: 60 }) };
  });

  app.get('/api/v1/files/recent', async (req) => {
    const user = requireUser(req);
    const rows = db.select().from(schema.nodes)
      .where(and(eq(schema.nodes.ownerId, user.id), eq(schema.nodes.kind, 'file'), isNull(schema.nodes.trashedAt)))
      .orderBy(desc(schema.nodes.updatedAt)).limit(12).all();
    return { items: rows.map(toClient) };
  });

  app.get('/api/v1/files/trash', async (req) => {
    const user = requireUser(req);
    const result = listChildren(user.id, null, { trashed: true, limit: 200 });
    const groups = new Map();
    for (const item of result.items) {
      if (!groups.has(item.trashedAt)) groups.set(item.trashedAt, []);
      groups.get(item.trashedAt).push(item);
    }
    return { items: result.items, groups: [...groups.entries()].map(([stamp, items]) => ({ stamp, items })) };
  });

  app.post('/api/v1/folders', {
    schema: {
      body: {
        type: 'object', required: ['name'],
        properties: { name: { type: 'string', minLength: 1, maxLength: 255 }, parentId: { type: ['string', 'null'] } },
      },
    },
  }, async (req) => {
    const user = requireUser(req);
    const folder = createFolder(user.id, req.body.parentId || null, req.body.name);
    activity(user.id, 'folder.create', 'node', folder.id, folder.name, req.ip);
    return { node: folder };
  });

  app.get('/api/v1/files/:id', async (req) => {
    const user = requireUser(req);
    const node = getNode(req.params.id, user.id);
    return {
      node: toClient(node),
      breadcrumbs: node.parentId ? breadcrumbs(user.id, node.parentId) : [],
      path: breadcrumbs(user.id, node.id),
    };
  });

  app.patch('/api/v1/files/:id', {
    schema: {
      body: {
        type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 255 }, parentId: { type: ['string', 'null'] } },
      },
    },
  }, async (req) => {
    const user = requireUser(req);
    let node;
    if (req.body.name !== undefined) node = renameNode(user.id, req.params.id, req.body.name);
    if (req.body.parentId !== undefined) node = moveNode(user.id, req.params.id, req.body.parentId || null);
    if (!node) throw badRequest('Nothing to change.');
    activity(user.id, 'node.update', 'node', node.id, node.name, req.ip);
    return { node };
  });

  app.post('/api/v1/files/:id/copy', {
    schema: { body: { type: 'object', properties: { parentId: { type: ['string', 'null'] }, name: { type: 'string', maxLength: 255 } } } },
  }, async (req) => {
    const user = requireUser(req);
    const node = await copyNode(user.id, req.params.id, req.body.parentId || null, req.body.name || null);
    activity(user.id, 'node.copy', 'node', node.id, node.name, req.ip);
    return { node };
  });

  app.post('/api/v1/files/selection', {
    schema: { body: { type: 'object', properties: selectAllSchema } },
  }, async (req) => {
    const user = requireUser(req);
    const requested = Number(req.body.snapshot);
    // Ohne Snapshot bestimmt der Server den Zeitpunkt. Der Client übernimmt
    // diesen Wert anschließend für alle Bulk-Aktionen.
    const snapshot = Number.isFinite(requested) && requested > 0 ? requested : Date.now();
    return { count: selectionCount(user.id, { ...req.body, snapshot }), snapshot };
  });

  app.post('/api/v1/files/trash', {
    schema: { body: { type: 'object', properties: selectAllSchema } },
  }, async (req) => {
    const user = requireUser(req);
    const isSelectAll = req.body.selectAll === true;
    if (!isSelectAll && (!Array.isArray(req.body.ids) || !req.body.ids.length)) throw badRequest('Keine Elemente ausgewählt.');
    if (isSelectAll && !req.body.filter) throw badRequest('Für "Alle auswählen" fehlt der Filter.');
    const result = isSelectAll ? trashSelection(user.id, req.body) : await trashNodes(user.id, req.body.ids);
    const label = `${result.trashed} Element(e)`;
    activity(user.id, 'node.trash', 'node', isSelectAll ? null : req.body.ids[0], label, req.ip);
    return result;
  });

  app.post('/api/v1/files/trash/restore', {
    schema: { body: { type: 'object', required: ['stamp'], properties: { stamp: { type: 'integer' } } } },
  }, async (req) => {
    const user = requireUser(req);
    const count = restoreTrash(user.id, req.body.stamp);
    return { restored: count };
  });

  app.delete('/api/v1/files/trash', async (req) => {
    const user = requireUser(req);
    const count = await purgeTrash(user.id);
    return { purged: count };
  });

  app.post('/api/v1/files/delete', {
    schema: { body: { type: 'object', properties: selectAllSchema } },
  }, async (req) => {
    const user = requireUser(req);
    const ids = req.body.selectAll ? selectionRows(user.id, req.body, { includeTrashed: true }).map((row) => row.id) : req.body.ids;
    if (!Array.isArray(ids) || !ids.length) throw badRequest('Keine Elemente ausgewählt.');
    const count = await deleteForever(user.id, ids);
    activity(user.id, 'node.delete', 'node', req.body.selectAll ? null : ids[0], `${count} Element(e)`, req.ip);
    return { deleted: count };
  });

  app.get('/api/v1/files/:id/download', async (req, reply) => {
    const user = requireUser(req);
    const node = getNode(req.params.id, user.id);
    if (node.kind !== 'file') throw badRequest('Folders cannot be downloaded directly.');
    activity(user.id, 'file.download', 'node', node.id, node.name, req.ip);
    return sendFile(reply, node);
  });

  app.get('/api/v1/files/:id/content', async (req, reply) => {
    const user = requireUser(req);
    const node = getNode(req.params.id, user.id);
    if (node.kind !== 'file') throw badRequest('Not a file.');
    return sendFile(reply, node, { inline: true, rangeHeader: req.headers.range });
  });

  app.post('/api/v1/files/:id/content', {
    schema: { body: { type: 'object', required: ['content'], properties: { content: { type: 'string' } } } },
  }, async (req) => {
    const user = requireUser(req);
    const node = getNode(req.params.id, user.id);
    if (node.kind !== 'file') throw badRequest('Not a file.');
    const hash = crypto.createHash('sha256').update(req.body.content || '').digest('hex');
    const temp = tempPath('text-' + id(16));
    await fsp.writeFile(temp, req.body.content || '');
    const final = await commitObject(temp);
    db.update(schema.nodes).set({ hash: final, objectKey: final, size: Buffer.byteLength(req.body.content || '', 'utf8'), updatedAt: Date.now() }).where(eq(schema.nodes.id, node.id)).run();
    return { ok: true, hash: final, size: Buffer.byteLength(req.body.content || '', 'utf8') };
  });

  app.get('/api/v1/files/:id/thumbnail', async (req, reply) => {
    const user = requireUser(req);
    const node = getNode(req.params.id, user.id);
    if (node.kind !== 'file' || !isImage(node.mime)) throw notFound('No thumbnail for this file.');
    const size = [320, 768, 1600].includes(Number(req.query.size)) ? Number(req.query.size) : 768;
    try {
      const file = await thumbnails.ensure(node, size);
      reply.header('Cache-Control', 'private, max-age=86400');
      reply.type('image/webp');
      return reply.send(fs.createReadStream(file));
    } catch {
      throw notFound('Thumbnail is not ready.');
    }
  });

  app.get('/api/v1/files/:id/path', async (req) => {
    const user = requireUser(req);
    const node = getNode(req.params.id, user.id);
    return { path: breadcrumbs(user.id, node.id) };
  });

  app.post('/api/v1/files/resolve', {
    schema: { body: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } } },
  }, async (req) => {
    const user = requireUser(req);
    const parts = String(req.body.path).split('/').filter(Boolean);
    const folderId = resolvePath(user.id, parts);
    return { folderId };
  });
}
