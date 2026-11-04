import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireAdmin, requireUser } from '../services/auth.js';
import { quotaFor, usedBytes } from '../services/nodes.js';
import { diskStats } from '../services/storage.js';
import { db as database } from '../db/index.js';

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

  app.get('/api/v1/storage/overview', async (req) => {
    requireAdmin(req);
    const rows = db.select().from(schema.users).orderBy(schema.users.createdAt).all();
    const users = rows.map((user) => ({ id: user.id, username: user.username, displayName: user.displayName, usedBytes: usedBytes(user.id), quotaBytes: quotaFor(user), role: user.role }));
    const total = db.select({ size: sql`sum(${schema.nodes.size})` }).from(schema.nodes).where(and(eq(schema.nodes.kind, 'file'), isNull(schema.nodes.trashedAt))).get().size || 0;
    return { users, total, disk: await diskStats() };
  });
}
