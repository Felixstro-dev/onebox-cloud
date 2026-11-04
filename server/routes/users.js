import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireAdmin, requireUser, hashPassword } from '../services/auth.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { quotaFor, usedBytes, activity } from '../services/nodes.js';
import { id } from '../lib/ids.js';

function userRow(user, groupIds = []) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    quotaBytes: quotaFor(user),
    usedBytes: usedBytes(user.id),
    disabled: Boolean(user.disabled),
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    groupIds,
  };
}

function groupIdsOf(userId) {
  return db.select({ id: schema.groupMembers.groupId }).from(schema.groupMembers).where(eq(schema.groupMembers.userId, userId)).all().map((row) => row.id);
}

export async function registerUserRoutes(app) {
  app.get('/api/v1/users', async (req) => {
    const user = requireAdmin(req);
    const rows = db.select().from(schema.users).orderBy(schema.users.createdAt).all();
    return { items: rows.map((row) => userRow(row, groupIdsOf(row.id))), selfId: user.id };
  });

  app.post('/api/v1/users', {
    schema: {
      body: {
        type: 'object', required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 2, maxLength: 64 },
          password: { type: 'string', minLength: 10, maxLength: 256 },
          displayName: { type: 'string', maxLength: 80 },
          role: { type: 'string', enum: ['admin', 'user'] },
          quotaBytes: { type: 'integer', minimum: 0 },
          groupIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  }, async (req) => {
    const admin = requireAdmin(req);
    const username = req.body.username.trim();
    if (!/^[a-zA-Z0-9._-]+$/.test(username)) throw badRequest('Username may only use letters, numbers, dots, dashes, and underscores.');
    const exists = db.select().from(schema.users).where(sql`lower(${schema.users.username}) = ${username.toLowerCase()}`).get();
    if (exists) throw conflict('That username is already taken.');
    const passwordHash = await hashPassword(req.body.password);
    const userId = id();
    db.insert(schema.users).values({
      id: userId, username, displayName: (req.body.displayName || username).trim(), passwordHash,
      role: req.body.role || 'user', quotaBytes: req.body.quotaBytes || 0, createdAt: Date.now(),
    }).run();
    for (const groupId of req.body.groupIds || []) {
      db.insert(schema.groupMembers).values({ groupId, userId }).onConflictDoNothing().run();
    }
    activity(admin.id, 'user.create', 'user', userId, username, req.ip);
    return { user: userRow(db.select().from(schema.users).where(eq(schema.users.id, userId)).get(), req.body.groupIds || []) };
  });

  app.patch('/api/v1/users/:id', {
    schema: {
      body: {
        type: 'object',
        properties: {
          displayName: { type: 'string', minLength: 1, maxLength: 80 },
          role: { type: 'string', enum: ['admin', 'user'] },
          quotaBytes: { type: 'integer', minimum: 0 },
          disabled: { type: 'boolean' },
          password: { type: 'string', minLength: 10, maxLength: 256 },
          groupIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  }, async (req) => {
    const admin = requireAdmin(req);
    const target = db.select().from(schema.users).where(eq(schema.users.id, req.params.id)).get();
    if (!target) throw notFound('User not found.');
    if (target.id === admin.id && req.body.role === 'user') throw badRequest('You cannot remove your own administrator role.');
    if (target.id === admin.id && req.body.disabled) throw badRequest('You cannot disable your own account.');
    if (target.role === 'admin' && req.body.role === 'user') {
      const admins = db.select({ count: sql`count(*)` }).from(schema.users).where(and(eq(schema.users.role, 'admin'), eq(schema.users.disabled, false))).get().count;
      if (admins <= 1) throw badRequest('One active administrator is required.');
    }
    const patch = {};
    if (req.body.displayName !== undefined) patch.displayName = req.body.displayName.trim();
    if (req.body.role !== undefined) patch.role = req.body.role;
    if (req.body.quotaBytes !== undefined) patch.quotaBytes = req.body.quotaBytes;
    if (req.body.disabled !== undefined) patch.disabled = req.body.disabled;
    if (req.body.password) patch.passwordHash = await hashPassword(req.body.password);
    if (Object.keys(patch).length) db.update(schema.users).set(patch).where(eq(schema.users.id, target.id)).run();
    if (req.body.disabled) db.delete(schema.userSessions).where(eq(schema.userSessions.userId, target.id)).run();
    if (req.body.groupIds) {
      db.delete(schema.groupMembers).where(eq(schema.groupMembers.userId, target.id)).run();
      for (const groupId of req.body.groupIds) db.insert(schema.groupMembers).values({ groupId, userId: target.id }).onConflictDoNothing().run();
    }
    return { user: userRow(db.select().from(schema.users).where(eq(schema.users.id, target.id)).get(), groupIdsOf(target.id)) };
  });

  app.delete('/api/v1/users/:id', async (req) => {
    const admin = requireAdmin(req);
    if (req.params.id === admin.id) throw badRequest('You cannot delete your own account.');
    const target = db.select().from(schema.users).where(eq(schema.users.id, req.params.id)).get();
    if (!target) throw notFound('User not found.');
    if (target.role === 'admin') {
      const admins = db.select({ count: sql`count(*)` }).from(schema.users).where(eq(schema.users.role, 'admin')).get().count;
      if (admins <= 1) throw badRequest('One administrator is required.');
    }
    db.delete(schema.users).where(eq(schema.users.id, target.id)).run();
    activity(admin.id, 'user.delete', 'user', target.id, target.username, req.ip);
    return { ok: true };
  });

  app.get('/api/v1/users/groups', async (req) => {
    requireUser(req);
    const groups = db.select().from(schema.groups).orderBy(schema.groups.name).all();
    return {
      items: groups.map((group) => ({
        ...group,
        members: db.select({ userId: schema.groupMembers.userId }).from(schema.groupMembers).where(eq(schema.groupMembers.groupId, group.id)).all().map((row) => row.userId),
      })),
    };
  });

  app.post('/api/v1/users/groups', {
    schema: { body: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 80 } } } },
  }, async (req) => {
    requireAdmin(req);
    const name = req.body.name.trim();
    const exists = db.select().from(schema.groups).where(eq(schema.groups.name, name)).get();
    if (exists) throw conflict('A group with this name already exists.');
    const group = { id: id(), name, createdAt: Date.now() };
    db.insert(schema.groups).values(group).run();
    return { group: { ...group, members: [] } };
  });

  app.delete('/api/v1/users/groups/:id', async (req) => {
    requireAdmin(req);
    db.delete(schema.groups).where(eq(schema.groups.id, req.params.id)).run();
    return { ok: true };
  });
}
