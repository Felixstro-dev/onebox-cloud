import fsp from 'node:fs/promises';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireUser } from '../services/auth.js';
import { badRequest, conflict, notFound, tooLarge } from '../lib/errors.js';
import { createFile, getNode, activity, assertQuota, findChildByName, toClient, trashRows } from '../services/nodes.js';
import { prepareUpload, tempPath, writeChunk } from '../services/storage.js';
import { resolveUploadMime } from '../services/content-type.js';
import { mimeOf, cleanName } from '../lib/names.js';
import { thumbnails } from '../services/runtime.js';
import { config } from '../config.js';

const TUS_VERSION = '1.0.0';
const TUS_EXTENSIONS = 'creation,termination';

function tusHeaders(reply) {
  reply.header('Tus-Resumable', TUS_VERSION);
  reply.header('Tus-Version', TUS_VERSION);
  reply.header('Tus-Extension', TUS_EXTENSIONS);
  if (config.maxUploadBytes > 0) reply.header('Tus-Max-Size', config.maxUploadBytes);
}

function parseMetadata(header) {
  if (!header) return {};
  const result = {};
  for (const pair of String(header).split(',')) {
    const [key, encoded] = pair.split(' ');
    if (!key) continue;
    try {
      result[key] = encoded ? Buffer.from(encoded, 'base64').toString('utf8') : '';
    } catch {
      result[key] = '';
    }
  }
  return result;
}

function uploadLocation(id) {
  return `${config.baseUrl}/api/v1/uploads/${id}`;
}

function uploadResponse(row) {
  return {
    id: row.id,
    name: row.name,
    size: row.size,
    offset: row.offset,
    mime: row.mime,
    parentId: row.parentId,
  };
}

export async function registerUploadRoutes(app) {
  app.addHook('onRequest', async (req) => {
    if (req.url.startsWith('/api/v1/uploads') && req.method === 'PATCH') {
      req.raw.setTimeout?.(0);
    }
  });

  app.options('/api/v1/uploads', async (req, reply) => {
    tusHeaders(reply);
    reply.header('Allow', 'POST, OPTIONS');
    return reply.status(204).send();
  });

  app.options('/api/v1/uploads/:id', async (req, reply) => {
    tusHeaders(reply);
    reply.header('Allow', 'HEAD, PATCH, DELETE, OPTIONS');
    return reply.status(204).send();
  });

  app.post('/api/v1/uploads', {
    schema: {
      body: {
        type: ['object', 'null'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          size: { type: 'integer', minimum: 0 },
          mime: { type: 'string', maxLength: 200 },
          parentId: { type: ['string', 'null'] },
          sessionId: { type: 'string', maxLength: 64 },
          conflict: { type: 'string', enum: ['keepBoth', 'replace', 'skip'] },
        },
      },
    },
  }, async (req, reply) => {
    const user = requireUser(req);
    tusHeaders(reply);
    const meta = parseMetadata(req.headers['upload-metadata']);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const name = cleanName(body.name || meta.filename || 'Upload');
    const size = Number(body.size ?? req.headers['upload-length'] ?? -1);
    if (!Number.isFinite(size) || size < 0) throw badRequest('Upload-Length is missing.');
    if (config.maxUploadBytes > 0 && size > config.maxUploadBytes) throw tooLarge('This file exceeds the configured upload limit.');
    const parentId = body.parentId || meta.parentId || null;
    if (parentId) getNode(parentId, user.id);
    assertQuota(user, size);
    if (body.sessionId) {
      const existing = db.select().from(schema.uploadSessions).where(and(eq(schema.uploadSessions.id, body.sessionId), eq(schema.uploadSessions.userId, user.id))).get();
      if (existing) {
        reply.header('Location', uploadLocation(existing.id));
        reply.header('Upload-Offset', existing.offset);
        reply.header('Upload-Length', existing.size);
        return { upload: uploadResponse(existing), resumed: true };
      }
    }
    const { sessionId } = await prepareUpload(size);
    const mime = body.mime || meta.filetype || mimeOf(name);
    const row = {
      id: sessionId,
      userId: user.id,
      parentId,
      name,
      size,
      mime,
      offset: 0,
      tempKey: tempPath(sessionId),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    db.insert(schema.uploadSessions).values(row).run();
    const existing = findChildByName(user.id, parentId, name);
    reply.header('Location', uploadLocation(sessionId));
    reply.header('Upload-Offset', 0);
    reply.header('Upload-Length', size);
    reply.status(201);
    return {
      upload: uploadResponse(row),
      resumed: false,
      conflict: Boolean(existing && !body.conflict),
      existing: existing ? toClient(existing) : null,
    };
  });

  app.head('/api/v1/uploads/:id', async (req, reply) => {
    const user = requireUser(req);
    tusHeaders(reply);
    const row = db.select().from(schema.uploadSessions).where(and(eq(schema.uploadSessions.id, req.params.id), eq(schema.uploadSessions.userId, user.id))).get();
    if (!row) throw notFound('Upload not found.');
    reply.header('Upload-Offset', row.offset);
    reply.header('Upload-Length', row.size);
    reply.header('Cache-Control', 'no-store');
    return reply.send();
  });

  app.get('/api/v1/uploads/:id', async (req) => {
    const user = requireUser(req);
    const row = db.select().from(schema.uploadSessions).where(and(eq(schema.uploadSessions.id, req.params.id), eq(schema.uploadSessions.userId, user.id))).get();
    if (!row) throw notFound('Upload not found.');
    return { upload: uploadResponse(row) };
  });

  app.patch('/api/v1/uploads/:id', async (req, reply) => {
    const user = requireUser(req);
    tusHeaders(reply);
    const row = db.select().from(schema.uploadSessions).where(and(eq(schema.uploadSessions.id, req.params.id), eq(schema.uploadSessions.userId, user.id))).get();
    if (!row) throw notFound('Upload not found.');
    const offset = Number(req.headers['upload-offset']);
    if (!Number.isFinite(offset) || offset !== row.offset) throw conflict(`Upload offset mismatch. Server has ${row.offset}.`);
    if (offset >= row.size && row.size > 0) throw badRequest('Upload is already complete.');
    if (!req.body || typeof req.body.pipe !== 'function') throw badRequest('Expected an octet stream.');
    const bytesWritten = await writeChunk(row.tempKey, offset, req.body, Math.max(0, row.size - offset));
    const next = offset + bytesWritten;
    if (next > row.size) throw tooLarge('Upload is larger than announced.');
    db.update(schema.uploadSessions).set({ offset: next, updatedAt: Date.now() }).where(eq(schema.uploadSessions.id, row.id)).run();
    reply.header('Upload-Offset', next);
    reply.header('Upload-Length', row.size);
    return reply.send({ offset: next });
  });

  app.post('/api/v1/uploads/:id/complete', {
    schema: {
      body: {
        type: ['object', 'null'],
        properties: { conflict: { type: 'string', enum: ['keepBoth', 'replace', 'skip'] } },
      },
    },
  }, async (req) => {
    const user = requireUser(req);
    const row = db.select().from(schema.uploadSessions).where(and(eq(schema.uploadSessions.id, req.params.id), eq(schema.uploadSessions.userId, user.id))).get();
    if (!row) throw notFound('Upload not found.');
    const size = row.offset;
    if (size !== row.size) throw badRequest(`Upload is incomplete (${size} of ${row.size} bytes).`);
    const conflictMode = req.body?.conflict || 'keepBoth';
    const existing = findChildByName(user.id, row.parentId, row.name);
    if (existing && conflictMode === 'skip') {
      db.delete(schema.uploadSessions).where(eq(schema.uploadSessions.id, row.id)).run();
      await fsp.unlink(row.tempKey).catch(() => {});
      return { node: toClient(existing), skipped: true };
    }
    if (existing && conflictMode === 'replace') {
      trashRows(user.id, [existing]);
    }
    const mime = await resolveUploadMime(row.tempKey, row.mime, row.name);
    const node = await createFile({ user, parentId: row.parentId, name: row.name, mime, tempFile: row.tempKey });
    db.delete(schema.uploadSessions).where(eq(schema.uploadSessions.id, row.id)).run();
    activity(user.id, 'file.upload', 'node', node.id, `${node.name} (${size} bytes)`, req.ip);
    // Thumbnails und Metadaten laufen in der Hintergrund-Queue, nicht im Request.
    if (node.isImage) {
      const stored = db.select({ hash: schema.nodes.hash }).from(schema.nodes).where(eq(schema.nodes.id, node.id)).get();
      if (stored?.hash) thumbnails.generateAll({ id: node.id, hash: stored.hash, mime: node.mime, width: node.width }).catch(() => {});
    }
    return { node, skipped: false };
  });

  app.delete('/api/v1/uploads/:id', async (req, reply) => {
    const user = requireUser(req);
    tusHeaders(reply);
    const row = db.select().from(schema.uploadSessions).where(and(eq(schema.uploadSessions.id, req.params.id), eq(schema.uploadSessions.userId, user.id))).get();
    if (!row) throw notFound('Upload not found.');
    db.delete(schema.uploadSessions).where(eq(schema.uploadSessions.id, row.id)).run();
    await fsp.unlink(row.tempKey).catch(() => {});
    reply.status(204);
    return reply.send();
  });
}
