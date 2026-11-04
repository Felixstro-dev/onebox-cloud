import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import exifReader from 'exif-reader';
import { and, desc, eq, inArray, isNull, like, or, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireUser } from '../services/auth.js';
import { getNode, toClient, createFile, activity, uniqueName, listChildren } from '../services/nodes.js';
import { badRequest, notFound } from '../lib/errors.js';
import { objectPath, tempPath } from '../services/storage.js';
import { isImage, mimeOf } from '../lib/names.js';
import { id } from '../lib/ids.js';
import { config, paths } from '../config.js';

const PHOTO_SQL = sql`${schema.nodes.mime} like 'image/%' and ${schema.nodes.mime} not like 'image/svg%'`;

function photo(row) {
  return { ...toClient(row), takenAt: row.takenAt || row.createdAt };
}

function exifDate(exif) {
  const value = exif?.exif?.DateTimeOriginal || exif?.exif?.DateTimeDigitized || exif?.image?.DateTime;
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

export async function registerPhotoRoutes(app) {
  app.get('/api/v1/photos', async (req) => {
    const user = requireUser(req);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const albumId = req.query.album ? String(req.query.album) : null;
    const base = [eq(schema.nodes.ownerId, user.id), isNull(schema.nodes.trashedAt), PHOTO_SQL];
    if (albumId) {
      const album = db.select().from(schema.albums).where(and(eq(schema.albums.id, albumId), eq(schema.albums.ownerId, user.id))).get();
      if (!album) throw notFound('Album not found.');
      const ids = db.select({ id: schema.albumItems.nodeId }).from(schema.albumItems).where(eq(schema.albumItems.albumId, albumId)).all().map((row) => row.id);
      if (!ids.length) return { items: [], total: 0, nextOffset: null, albums: [] };
      base.push(inArray(schema.nodes.id, ids));
    }
    const rows = db.select().from(schema.nodes).where(and(...base)).orderBy(desc(schema.nodes.takenAt), desc(schema.nodes.createdAt)).limit(limit).offset(offset).all();
    const total = db.select({ count: sql`count(*)` }).from(schema.nodes).where(and(...base)).get().count;
    return { items: rows.map(photo), total, nextOffset: offset + rows.length < total ? offset + rows.length : null };
  });

  app.get('/api/v1/photos/albums', async (req) => {
    const user = requireUser(req);
    const rows = db.select().from(schema.albums).where(eq(schema.albums.ownerId, user.id)).orderBy(desc(schema.albums.createdAt)).all();
    const items = rows.map((album) => {
      const count = db.select({ count: sql`count(*)` }).from(schema.albumItems).where(eq(schema.albumItems.albumId, album.id)).get().count;
      const first = db.select({ nodeId: schema.albumItems.nodeId }).from(schema.albumItems).where(eq(schema.albumItems.albumId, album.id)).get();
      const cover = first ? db.select().from(schema.nodes).where(eq(schema.nodes.id, first.nodeId)).get() : null;
      return { ...album, count, coverNodeId: cover?.id || null, coverThumb: cover ? `/api/v1/files/${cover.id}/thumbnail?size=320` : null };
    });
    return { items };
  });

  app.post('/api/v1/photos/albums', {
    schema: { body: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 120 } } } },
  }, async (req) => {
    const user = requireUser(req);
    const row = { id: id(), ownerId: user.id, name: req.body.name.trim(), createdAt: Date.now() };
    db.insert(schema.albums).values(row).run();
    return { album: { ...row, count: 0, coverThumb: null } };
  });

  app.patch('/api/v1/photos/albums/:id', {
    schema: { body: { type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 120 } } } },
  }, async (req) => {
    const user = requireUser(req);
    const album = db.select().from(schema.albums).where(and(eq(schema.albums.id, req.params.id), eq(schema.albums.ownerId, user.id))).get();
    if (!album) throw notFound('Album not found.');
    db.update(schema.albums).set({ name: req.body.name.trim() }).where(eq(schema.albums.id, album.id)).run();
    return { ok: true };
  });

  app.delete('/api/v1/photos/albums/:id', async (req) => {
    const user = requireUser(req);
    db.delete(schema.albums).where(and(eq(schema.albums.id, req.params.id), eq(schema.albums.ownerId, user.id))).run();
    return { ok: true };
  });

  app.post('/api/v1/photos/albums/:id/items', {
    schema: { body: { type: 'object', required: ['nodeIds'], properties: { nodeIds: { type: 'array', items: { type: 'string' } } } } },
  }, async (req) => {
    const user = requireUser(req);
    const album = db.select().from(schema.albums).where(and(eq(schema.albums.id, req.params.id), eq(schema.albums.ownerId, user.id))).get();
    if (!album) throw notFound('Album not found.');
    for (const nodeId of req.body.nodeIds) {
      const node = getNode(nodeId, user.id);
      if (!isImage(node.mime)) continue;
      db.insert(schema.albumItems).values({ albumId: album.id, nodeId }).onConflictDoNothing().run();
    }
    return { ok: true };
  });

  app.delete('/api/v1/photos/albums/:id/items/:nodeId', async (req) => {
    const user = requireUser(req);
    const album = db.select().from(schema.albums).where(and(eq(schema.albums.id, req.params.id), eq(schema.albums.ownerId, user.id))).get();
    if (!album) throw notFound('Album not found.');
    db.delete(schema.albumItems).where(and(eq(schema.albumItems.albumId, album.id), eq(schema.albumItems.nodeId, req.params.nodeId))).run();
    return { ok: true };
  });

  app.get('/api/v1/photos/:id/exif', async (req) => {
    const user = requireUser(req);
    const node = getNode(req.params.id, user.id);
    if (!node.hash) throw notFound('File is missing.');
    try {
      const meta = await sharp(objectPath(node.hash)).metadata();
      let exif = null;
      if (meta.exif) {
        try { exif = exifReader(meta.exif); } catch { exif = null; }
      }
      return {
        width: meta.width,
        height: meta.height,
        format: meta.format,
        size: node.size,
        camera: exif?.image?.Model || null,
        make: exif?.image?.Make || null,
        lens: exif?.exif?.LensModel || null,
        iso: exif?.exif?.ISOSpeedRatings || null,
        aperture: exif?.exif?.FNumber || null,
        shutter: exif?.exif?.ExposureTime || null,
        focalLength: exif?.exif?.FocalLength || null,
        takenAt: exifDate(exif) || node.takenAt || null,
        orientation: meta.orientation || null,
      };
    } catch {
      return { width: node.width, height: node.height, format: null, size: node.size };
    }
  });

  app.post('/api/v1/photos/:id/edit', {
    schema: {
      body: {
        type: 'object',
        properties: {
          rotate: { type: 'integer', enum: [0, 90, 180, 270] },
          flip: { type: 'boolean' },
          flop: { type: 'boolean' },
          crop: {
            type: 'object',
            properties: { left: { type: 'number' }, top: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' } },
          },
          brightness: { type: 'number', minimum: 0.3, maximum: 2 },
          saturation: { type: 'number', minimum: 0, maximum: 2 },
          contrast: { type: 'number', minimum: 0.3, maximum: 2 },
          grayscale: { type: 'boolean' },
          filter: { type: 'string', enum: ['none', 'warm', 'cool', 'mono', 'vivid'] },
        },
      },
    },
  }, async (req) => {
    const user = requireUser(req);
    const node = getNode(req.params.id, user.id);
    if (!isImage(node.mime) || !node.hash) throw badRequest('This file is not an editable photo.');
    const source = objectPath(node.hash);
    const meta = await sharp(source).metadata();
    let pipeline = sharp(source, { failOn: 'none' }).rotate();
    const ops = req.body;
    if (ops.crop && ops.crop.width > 0 && ops.crop.height > 0) {
      const width = Math.round(meta.width * Math.min(1, ops.crop.width));
      const height = Math.round(meta.height * Math.min(1, ops.crop.height));
      const left = Math.round(meta.width * Math.max(0, Math.min(1 - ops.crop.width, ops.crop.left)));
      const top = Math.round(meta.height * Math.max(0, Math.min(1 - ops.crop.height, ops.crop.top)));
      pipeline = pipeline.extract({ left, top, width: Math.max(1, width), height: Math.max(1, height) });
    }
    if (ops.rotate) pipeline = pipeline.rotate(ops.rotate);
    if (ops.flip) pipeline = pipeline.flip();
    if (ops.flop) pipeline = pipeline.flop();
    if (ops.grayscale) pipeline = pipeline.grayscale();
    if (ops.brightness || ops.saturation || ops.contrast) {
      pipeline = pipeline.modulate({ brightness: ops.brightness || 1, saturation: ops.saturation ?? 1 });
    }
    if (ops.contrast) pipeline = pipeline.linear(ops.contrast, -(ops.contrast - 1) * 128);
    if (ops.filter === 'warm') pipeline = pipeline.tint({ r: 255, g: 236, b: 220 });
    if (ops.filter === 'cool') pipeline = pipeline.tint({ r: 220, g: 236, b: 255 });
    if (ops.filter === 'vivid') pipeline = pipeline.modulate({ saturation: 1.35 }).sharpen();
    const ext = node.name.includes('.') ? node.name.slice(node.name.lastIndexOf('.')) : '.jpg';
    const temp = tempPath(`edit-${id(12)}`);
    await fsp.mkdir(path.dirname(temp), { recursive: true });
    if (/\.(jpe?g)$/i.test(ext)) await pipeline.jpeg({ quality: 92 }).toFile(temp);
    else if (/\.png$/i.test(ext)) await pipeline.png().toFile(temp);
    else await pipeline.webp({ quality: 92 }).toFile(temp);
    const stem = node.name.replace(/\.[^.]+$/, '');
    try {
      const created = await createFile({ user, parentId: node.parentId, name: `${stem} (bearbeitet)${ext}`, mime: node.mime, tempFile: temp });
      activity(user.id, 'photo.edit', 'node', created.id, node.name, req.ip);
      return { node: created };
    } finally {
      await fsp.unlink(temp).catch(() => {});
    }
  });
}
