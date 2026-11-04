import fsp from 'node:fs/promises';
import fs from 'node:fs';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import {
  allowedTypeMatch, getShareByToken, requireShareAccess, resolveSharePath, shareStatus,
  signAccess, verifyAccess,
} from '../services/shares.js';
import { badRequest, forbidden, notFound, tooLarge } from '../lib/errors.js';
import { rateLimit } from '../services/auth.js';
import { activity, createFile, toClient } from '../services/nodes.js';
import { fileSize, prepareUpload, tempPath, writeChunk } from '../services/storage.js';
import { cleanName, isImage, mimeOf } from '../lib/names.js';
import { sendFile } from './files.js';
import { thumbnails } from '../services/runtime.js';

function accessFrom(req) {
  return String(req.query.access || req.headers['x-share-access'] || '');
}

function meta(share) {
  return {
    id: share.id,
    kind: share.kind,
    requiresPassword: Boolean(share.passwordHash),
    status: shareStatus(share),
    maxFileSize: share.maxFileSize,
    maxTotalSize: share.maxTotalSize,
    totalUploaded: share.totalUploaded,
    expiresAt: share.expiresAt,
    maxDownloads: share.maxDownloads,
    downloadCount: share.downloadCount,
    allowedTypes: share.allowedTypes ? JSON.parse(share.allowedTypes) : null,
  };
}

function sharePath(req) {
  return String(req.query.path || '').split('/').filter(Boolean);
}

export async function registerPublicRoutes(app) {
  app.get('/api/v1/public/shares/:token', async (req) => {
    const share = getShareByToken(req.params.token);
    const status = shareStatus(share);
    let node = null;
    try {
      node = resolveSharePath(share, []);
    } catch {
      node = null;
    }
    return {
      share: {
        ...meta(share),
        status,
        node: node ? { name: node.name, kind: node.kind, size: node.size, mime: node.mime } : null,
      },
    };
  });

  app.post('/api/v1/public/shares/:token/unlock', {
    schema: { body: { type: 'object', properties: { password: { type: 'string', maxLength: 256 } } } },
  }, async (req) => {
    if (!rateLimit(`share:${req.ip}:${req.params.token}`, { max: 10, windowMs: 300000 })) throw forbidden('Too many attempts.');
    const share = getShareByToken(req.params.token);
    const status = shareStatus(share);
    if (status !== 'active') throw forbidden('This link is no longer available.');
    const { verifyPassword } = await import('../services/auth.js');
    if (share.passwordHash && !(await verifyPassword(share.passwordHash, req.body.password || ''))) throw forbidden('Password is wrong.');
    return { accessToken: signAccess(share.id), expiresIn: 3600 };
  });

  app.get('/api/v1/public/shares/:token/files', async (req) => {
    const share = getShareByToken(req.params.token);
    requireShareAccess(share, accessFrom(req));
    const node = resolveSharePath(share, sharePath(req));
    if (node.kind !== 'folder') return { node: toClient(node), items: [] };
    const rows = db.select().from(schema.nodes).where(and(
      eq(schema.nodes.parentId, node.id),
      eq(schema.nodes.ownerId, share.ownerId),
      eq(schema.nodes.trashedAt, null),
    )).orderBy(schema.nodes.kind, schema.nodes.nameKey).all();
    return {
      node: toClient(node),
      items: rows.map((row) => ({ ...toClient(row), thumbUrl: row.kind === 'file' && isImage(row.mime) ? `/api/v1/public/shares/${req.params.token}/thumbnail?path=${encodeURIComponent([...sharePath(req), row.name].join('/'))}` : null })),
      path: sharePath(req),
    };
  });

  app.get('/api/v1/public/shares/:token/download', async (req, reply) => {
    const share = getShareByToken(req.params.token);
    requireShareAccess(share, accessFrom(req));
    const node = resolveSharePath(share, sharePath(req));
    if (node.kind !== 'file') throw badRequest('Choose a file to download.');
    if (share.maxDownloads && share.downloadCount >= share.maxDownloads) throw forbidden('Download limit reached.');
    db.update(schema.shares).set({ downloadCount: share.downloadCount + 1 }).where(eq(schema.shares.id, share.id)).run();
    activity(share.ownerId, 'share.download', 'share', share.id, node.name, req.ip);
    return sendFile(reply, node, { rangeHeader: req.headers.range });
  });

  app.get('/api/v1/public/shares/:token/thumbnail', async (req, reply) => {
    const share = getShareByToken(req.params.token);
    requireShareAccess(share, accessFrom(req));
    const node = resolveSharePath(share, sharePath(req));
    if (node.kind !== 'file' || !isImage(node.mime)) throw notFound('No preview.');
    const size = [320, 768, 1600].includes(Number(req.query.size)) ? Number(req.query.size) : 768;
    const file = await thumbnails.ensure(node, size);
    reply.header('Cache-Control', 'private, max-age=3600');
    reply.type('image/webp');
    return reply.send(fs.createReadStream(file));
  });

  app.get('/api/v1/public/uploads/:token', async (req) => {
    const share = getShareByToken(req.params.token);
    if (share.kind !== 'upload') throw notFound('Not an upload request.');
    let node = null;
    try { node = resolveSharePath(share, []); } catch { node = null; }
    return { request: { ...meta(share), folderName: node?.name || 'Upload' } };
  });

  app.post('/api/v1/public/uploads/:token/unlock', {
    schema: { body: { type: 'object', properties: { password: { type: 'string', maxLength: 256 } } } },
  }, async (req) => {
    if (!rateLimit(`upload:${req.ip}:${req.params.token}`, { max: 10, windowMs: 300000 })) throw forbidden('Too many attempts.');
    const share = getShareByToken(req.params.token);
    if (share.kind !== 'upload') throw notFound('Not an upload request.');
    if (shareStatus(share) !== 'active') throw forbidden('This request is closed.');
    const { verifyPassword } = await import('../services/auth.js');
    if (share.passwordHash && !(await verifyPassword(share.passwordHash, req.body.password || ''))) throw forbidden('Password is wrong.');
    return { accessToken: signAccess(share.id), expiresIn: 3600 };
  });

  app.post('/api/v1/public/uploads/:token/sessions', {
    schema: {
      body: {
        type: 'object', required: ['name', 'size'],
        properties: { name: { type: 'string', maxLength: 255 }, size: { type: 'integer', minimum: 1 }, mime: { type: 'string', maxLength: 200 } },
      },
    },
  }, async (req) => {
    const share = getShareByToken(req.params.token);
    if (share.kind !== 'upload') throw notFound('Not an upload request.');
    requireShareAccess(share, accessFrom(req));
    if (share.maxFileSize && req.body.size > share.maxFileSize) throw tooLarge('This file is larger than the upload request allows.');
    if (share.maxTotalSize && share.totalUploaded + req.body.size > share.maxTotalSize) throw tooLarge('The upload request has reached its total size.');
    const name = cleanName(req.body.name, 'Upload');
    const mime = req.body.mime || mimeOf(name);
    const allowed = share.allowedTypes ? JSON.parse(share.allowedTypes) : null;
    if (!allowedTypeMatch(allowed, mime, name)) throw badRequest('This file type is not allowed.');
    const { sessionId } = await prepareUpload(req.body.size);
    const row = {
      id: sessionId, userId: share.ownerId, parentId: share.nodeId, name, size: req.body.size, mime,
      offset: 0, tempKey: tempPath(sessionId), shareId: share.id, createdAt: Date.now(), updatedAt: Date.now(),
    };
    db.insert(schema.uploadSessions).values(row).run();
    return { session: { id: sessionId, name, size: req.body.size, offset: 0 } };
  });

  app.patch('/api/v1/public/uploads/:token/sessions/:id', async (req, reply) => {
    const share = getShareByToken(req.params.token);
    if (share.kind !== 'upload') throw notFound('Not an upload request.');
    requireShareAccess(share, accessFrom(req));
    const row = db.select().from(schema.uploadSessions).where(and(eq(schema.uploadSessions.id, req.params.id), eq(schema.uploadSessions.shareId, share.id))).get();
    if (!row) throw notFound('Upload not found.');
    const offset = Number(req.headers['upload-offset']);
    if (offset !== row.offset) throw badRequest(`Offset mismatch. Server has ${row.offset}.`);
    if (!req.body || typeof req.body.pipe !== 'function') throw badRequest('Expected an octet stream.');
    const bytesWritten = await writeChunk(row.tempKey, offset, req.body);
    const next = Math.min(offset + bytesWritten, row.size);
    db.update(schema.uploadSessions).set({ offset: next, updatedAt: Date.now() }).where(eq(schema.uploadSessions.id, row.id)).run();
    reply.header('Upload-Offset', next);
    return reply.send({ offset: next });
  });

  app.post('/api/v1/public/uploads/:token/sessions/:id/complete', async (req) => {
    const share = getShareByToken(req.params.token);
    if (share.kind !== 'upload') throw notFound('Not an upload request.');
    requireShareAccess(share, accessFrom(req));
    const row = db.select().from(schema.uploadSessions).where(and(eq(schema.uploadSessions.id, req.params.id), eq(schema.uploadSessions.shareId, share.id))).get();
    if (!row) throw notFound('Upload not found.');
    if (row.offset !== row.size) throw badRequest('Upload is incomplete.');
    if (share.maxTotalSize && share.totalUploaded + row.size > share.maxTotalSize) throw tooLarge('The upload request has reached its total size.');
    const owner = db.select().from(schema.users).where(eq(schema.users.id, share.ownerId)).get();
    const node = await createFile({ user: owner, parentId: share.nodeId, name: row.name, mime: row.mime, tempFile: row.tempKey });
    db.delete(schema.uploadSessions).where(eq(schema.uploadSessions.id, row.id)).run();
    db.update(schema.shares).set({ totalUploaded: share.totalUploaded + row.size }).where(eq(schema.shares.id, share.id)).run();
    activity(share.ownerId, 'share.upload', 'node', node.id, `${node.name} via upload request`, req.ip);
    return { node };
  });

  app.delete('/api/v1/public/uploads/:token/sessions/:id', async (req) => {
    const share = getShareByToken(req.params.token);
    requireShareAccess(share, accessFrom(req));
    const row = db.select().from(schema.uploadSessions).where(and(eq(schema.uploadSessions.id, req.params.id), eq(schema.uploadSessions.shareId, share.id))).get();
    if (!row) throw notFound('Upload not found.');
    db.delete(schema.uploadSessions).where(eq(schema.uploadSessions.id, row.id)).run();
    await fsp.unlink(row.tempKey).catch(() => {});
    return { ok: true };
  });
}
