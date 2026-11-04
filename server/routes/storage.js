import fsp from 'node:fs/promises';
import path from 'node:path';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireAdmin, requireUser } from '../services/auth.js';
import { quotaFor, usedBytes } from '../services/nodes.js';
import { diskStats, ensureMounted, setActiveStorageRoot } from '../services/storage.js';
import { badRequest, notFound } from '../lib/errors.js';
import { id } from '../lib/ids.js';
import { config } from '../config.js';

function toLocation(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, kind: row.kind, rootPath: row.rootPath, source: row.source || null, isDefault: Boolean(row.isDefault) };
}

function defaultLocation() {
  const rootPath = config.filesDir || path.resolve(process.cwd(), 'files');
  return { id: 'local', name: 'Lokaler Datenträger', kind: 'local', rootPath, source: null, isDefault: true };
}

export async function registerStorageRoutes(app) {
  app.get('/api/v1/storage', async (req) => {
    const user = requireUser(req);
    const quota = quotaFor(user);
    const used = usedBytes(user.id);
    const byType = db.select({
      mime: schema.nodes.mime,
      size: sql`sum(${schema.nodes.size})`,
      count: sql`count(*)`,
    }).from(schema.nodes)
      .where(and(eq(schema.nodes.ownerId, user.id), eq(schema.nodes.kind, 'file'), isNull(schema.nodes.trashedAt)))
      .groupBy(schema.nodes.mime).all();
    const trash = db.select({ size: sql`sum(${schema.nodes.size})`, count: sql`count(*)` }).from(schema.nodes)
      .where(and(eq(schema.nodes.ownerId, user.id), eq(schema.nodes.kind, 'file'), sql`${schema.nodes.trashedAt} is not null`)).get();
    return {
      used,
      quota,
      quotaUsedPercent: quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : null,
      trash: { size: trash?.size || 0, count: trash?.count || 0 },
      byType: byType.map((row) => ({ mime: row.mime, size: row.size, count: row.count })),
      disk: await diskStats(),
    };
  });

  app.get('/api/v1/storage/locations', async (req) => {
    requireUser(req);
    const rows = db.select().from(schema.storageLocations).orderBy(schema.storageLocations.createdAt).all();
    const locations = rows.length ? rows.map(toLocation) : [defaultLocation()];
    return { locations };
  });

  app.post('/api/v1/storage/locations', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'rootPath'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 120 },
          rootPath: { type: 'string', minLength: 1 },
          source: { type: 'string', minLength: 1, maxLength: 255 },
          isDefault: { type: 'boolean' },
        },
      },
    },
  }, async (req) => {
    requireAdmin(req);
    const name = String(req.body.name || '').trim();
    const rootPath = String(req.body.rootPath || '');
    const source = String(req.body.source || '').trim() || null;
    if (!name || !rootPath) throw badRequest('Name und Pfad sind erforderlich.');
    const resolved = path.resolve(rootPath);
    const stat = await fsp.stat(resolved).catch(() => null);
    if (!stat || !stat.isDirectory()) throw badRequest('Der angegebene Speicherpfad ist kein existierender Ordner.');
    const isDefault = req.body.isDefault === true;
    let root = resolved;
    if (isDefault) {
      const ensured = await ensureMounted(resolved, source);
      root = ensured.root;
      setActiveStorageRoot(root);
    }
    const row = db.insert(schema.storageLocations).values({
      id: id(24),
      name,
      kind: 'local',
      rootPath: root,
      source,
      isDefault,
    }).returning();
    const created = row[0];
    if (created && created.isDefault) setActiveStorageRoot(created.rootPath);
    return { location: toLocation(created) };
  });

  app.put('/api/v1/storage/locations/:id', {
    schema: {
      body: {
        type: 'object',
        required: ['isDefault'],
        properties: { isDefault: { type: 'boolean' }, source: { type: 'string', minLength: 1, maxLength: 255 } },
      },
    },
  }, async (req, reply) => {
    requireAdmin(req);
    const row = db.select().from(schema.storageLocations).where(eq(schema.storageLocations.id, req.params.id)).get();
    if (!row) throw notFound('Speicher nicht gefunden.');
    db.update(schema.storageLocations).set({ isDefault: req.body.isDefault === true }).where(eq(schema.storageLocations.id, row.id)).run();
    if (req.body.isDefault) {
      const source = row.source || String(req.body.source || '').trim() || null;
      const ensured = await ensureMounted(row.rootPath, source);
      setActiveStorageRoot(ensured.root);
    }
    const updated = db.select().from(schema.storageLocations).where(eq(schema.storageLocations.id, row.id)).get();
    return { location: toLocation(updated) };
  });

  app.delete('/api/v1/storage/locations/:id', async (req, reply) => {
    requireAdmin(req);
    const row = db.select().from(schema.storageLocations).where(eq(schema.storageLocations.id, req.params.id)).get();
    if (!row) throw notFound('Speicher nicht gefunden.');
    db.delete(schema.storageLocations).where(eq(schema.storageLocations.id, row.id)).run();
    if (row.isDefault) setActiveStorageRoot(config.filesDir);
    return { ok: true };
  });

  app.get('/api/v1/storage/overview', async (req) => {
    requireAdmin(req);
    const rows = db.select().from(schema.users).orderBy(schema.users.createdAt).all();
    const users = rows.map((user) => ({ id: user.id, username: user.username, displayName: user.displayName, usedBytes: usedBytes(user.id), quotaBytes: quotaFor(user), role: user.role }));
    const total = db.select({ size: sql`sum(${schema.nodes.size})` }).from(schema.nodes).where(and(eq(schema.nodes.kind, 'file'), isNull(schema.nodes.trashedAt))).get().size || 0;
    return { users, total, disk: await diskStats() };
  });
}
