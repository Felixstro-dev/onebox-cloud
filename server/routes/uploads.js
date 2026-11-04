import fsp from 'node:fs/promises';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireUser } from '../services/auth.js';
import { badRequest, conflict, notFound, tooLarge } from '../lib/errors.js';
import { createFile, getNode, activity } from '../services/nodes.js';
import { prepareUpload, tempPath, writeChunk, fileSize } from '../services/storage.js';
import { mimeOf, cleanName } from '../lib/names.js';
import { id } from '../lib/ids.js';

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

  app.post('/api/v1/uploads', {
    schema: {
      body: {
        type: 'object', required: ['name', 'size'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          size: { type: 'integer', minimum: 0 },
          mime: { type: 'string', maxLength: 200 },
          parentId: { type: ['string', 'null'] },
          sessionId: { type: 'string', maxLength: 64 },
        },
      },
    },
  }, async (req) => {
    const user = requireUser(req);
    if (req.body.parentId) getNode(req.body.parentId, user.id);
    if (req.body.sessionId) {
      const existing = db.select().from(schema.uploadSessions).where(and(eq(schema.uploadSessions.id, req.body.sessionId), eq(schema.uploadSessions.userId, user.id))).get();
      if (existing) return { upload: uploadResponse(existing), resumed: true };
    }
    const { sessionId } = await prepareUpload(req.body.size);
    const name = cleanName(req.body.name, 'Upload');
    const row = {
      id: sessionId,
      userId: user.id,
      parentId: req.body.parentId || null,
      name,
      size: req.body.size,
      mime: req.body.mime || mimeOf(name),
      offset: 0,
      tempKey: tempPath(sessionId),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    db.insert(schema.uploadSessions).values(row).run();
    return { upload: uploadResponse(row), resumed: false };
  });

  app.head('/api/v1/uploads/:id', async (req, reply) => {
    const user = requireUser(req);
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
    const row = db.select().from(schema.uploadSessions).where(and(eq(schema.uploadSessions.id, req.params.id), eq(schema.uploadSessions.userId, user.id))).get();
    if (!row) throw notFound('Upload not found.');
    const offset = Number(req.headers['upload-offset']);
    if (!Number.isFinite(offset) || offset !== row.offset) throw conflict(`Upload offset mismatch. Server has ${row.offset}.`);
    if (offset >= row.size && row.size > 0) throw badRequest('Upload is already complete.');
    if (!req.body || typeof req.body.pipe !== 'function') throw badRequest('Expected an octet stream.');
    const bytesWritten = await writeChunk(row.tempKey, offset, req.body);
    const next = Math.min(offset + bytesWritten, row.size);
    if (next > row.size) throw tooLarge('Upload is larger than announced.');
    db.update(schema.uploadSessions).set({ offset: next, updatedAt: Date.now() }).where(eq(schema.uploadSessions.id, row.id)).run();
    reply.header('Upload-Offset', next);
    reply.header('Upload-Length', row.size);
    return reply.send({ offset: next });
  });

  app.post('/api/v1/uploads/:id/complete', async (req) => {
    const user = requireUser(req);
    const row = db.select().from(schema.uploadSessions).where(and(eq(schema.uploadSessions.id, req.params.id), eq(schema.uploadSessions.userId, user.id))).get();
    if (!row) throw notFound('Upload not found.');
    const size = row.offset;
    if (size !== row.size) throw badRequest(`Upload is incomplete (${size} of ${row.size} bytes).`);
    const node = await createFile({ user, parentId: row.parentId, name: row.name, mime: row.mime, tempFile: row.tempKey });
    db.delete(schema.uploadSessions).where(eq(schema.uploadSessions.id, row.id)).run();
    activity(user.id, 'file.upload', 'node', node.id, `${node.name} (${size} bytes)`, req.ip);
    return { node };
  });

  app.delete('/api/v1/uploads/:id', async (req) => {
    const user = requireUser(req);
    const row = db.select().from(schema.uploadSessions).where(and(eq(schema.uploadSessions.id, req.params.id), eq(schema.uploadSessions.userId, user.id))).get();
    if (!row) throw notFound('Upload not found.');
    db.delete(schema.uploadSessions).where(eq(schema.uploadSessions.id, row.id)).run();
    await fsp.unlink(row.tempKey).catch(() => {});
    return { ok: true };
  });
}
