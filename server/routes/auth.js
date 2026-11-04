import { eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { badRequest, unauthorized } from '../lib/errors.js';
import {
  COOKIE, createSession, destroySession, hashPassword, isAccountLocked, rateLimit, recordFailedLogin,
  requireUser, resetAccountLock, resetRateLimit, userCount, verifyPassword,
} from '../services/auth.js';
import { config } from '../config.js';
import { usedBytes, quotaFor, activity } from '../services/nodes.js';
import { getAllSettings } from '../services/settings.js';
import { id } from '../lib/ids.js';

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.secureCookies,
  path: '/',
  maxAge: config.sessionDays * 86400,
};

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    quotaBytes: quotaFor(user),
    usedBytes: usedBytes(user.id),
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export async function registerAuthRoutes(app) {
  app.get('/api/v1/system/setup', async () => ({ needsSetup: userCount() === 0 }));

  app.post('/api/v1/system/setup', {
    schema: {
      body: {
        type: 'object', required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 2, maxLength: 64 },
          password: { type: 'string', minLength: 10, maxLength: 256 },
          displayName: { type: 'string', maxLength: 80 },
          setupToken: { type: 'string', maxLength: 256 },
        },
      },
    },
  }, async (req, reply) => {
    if (userCount() > 0) throw badRequest('Setup has already been completed.');
    if (config.setupToken && req.body.setupToken !== config.setupToken) throw unauthorized('Setup token is wrong.');
    const username = req.body.username.trim();
    if (!/^[a-zA-Z0-9._-]+$/.test(username)) throw badRequest('Username may only use letters, numbers, dots, dashes, and underscores.');
    const passwordHash = await hashPassword(req.body.password);
    const userId = id();
    db.insert(schema.users).values({
      id: userId, username, displayName: (req.body.displayName || username).trim(),
      passwordHash, role: 'admin', quotaBytes: 0, createdAt: Date.now(),
    }).run();
    const session = createSession(userId, req);
    reply.setCookie(COOKIE, session.token, cookieOptions);
    activity(userId, 'setup.completed', 'user', userId, null, req.ip);
    return { user: publicUser(db.select().from(schema.users).where(eq(schema.users.id, userId)).get()) };
  });

  app.post('/api/v1/auth/login', {
    schema: {
      body: {
        type: 'object', required: ['username', 'password'],
        properties: { username: { type: 'string', maxLength: 64 }, password: { type: 'string', maxLength: 256 } },
      },
    },
  }, async (req, reply) => {
    const key = `${req.ip}:${req.body.username.toLowerCase()}`;
    if (isAccountLocked(req.body.username)) {
      return reply.status(429).send({ error: { code: 'account_locked', message: 'Konto gesperrt. Versuche es in 15 Minuten erneut.' } });
    }
    if (!rateLimit(key, { max: 8, windowMs: 300000 })) {
      return reply.status(429).send({ error: { code: 'rate_limited', message: 'Too many sign-in attempts. Wait five minutes.' } });
    }
    const user = db.select().from(schema.users).where(sql`lower(${schema.users.username}) = ${req.body.username.toLowerCase()}`).get();
    if (!user || user.disabled || !(await verifyPassword(user.passwordHash, req.body.password))) {
      recordFailedLogin(req.body.username);
      return reply.status(401).send({ error: { code: 'invalid_credentials', message: 'Username or password is wrong.' } });
    }
    resetRateLimit(key);
    resetAccountLock(req.body.username);
    db.update(schema.users).set({ lastLoginAt: Date.now() }).where(eq(schema.users.id, user.id)).run();
    const session = createSession(user.id, req);
    reply.setCookie(COOKIE, session.token, cookieOptions);
    activity(user.id, 'auth.login', 'user', user.id, null, req.ip);
    return { user: publicUser({ ...user, lastLoginAt: Date.now() }) };
  });

  app.post('/api/v1/auth/logout', async (req, reply) => {
    destroySession(req.cookies?.[COOKIE]);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/v1/auth/me', async (req) => {
    if (!req.user) throw unauthorized();
    return { user: publicUser(req.user), settings: getAllSettings() };
  });

  app.patch('/api/v1/auth/me', {
    schema: { body: { type: 'object', properties: { displayName: { type: 'string', minLength: 1, maxLength: 80 } } } },
  }, async (req) => {
    const user = requireUser(req);
    const name = req.body.displayName?.trim();
    if (!name) throw badRequest('Display name cannot be empty.');
    db.update(schema.users).set({ displayName: name }).where(eq(schema.users.id, user.id)).run();
    return { user: publicUser({ ...user, displayName: name }) };
  });

  app.post('/api/v1/auth/password', {
    schema: {
      body: {
        type: 'object', required: ['currentPassword', 'newPassword'],
        properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string', minLength: 10, maxLength: 256 } },
      },
    },
  }, async (req) => {
    const user = requireUser(req);
    if (!(await verifyPassword(user.passwordHash, req.body.currentPassword))) throw unauthorized('Current password is wrong.');
    const hash = await hashPassword(req.body.newPassword);
    db.update(schema.users).set({ passwordHash: hash }).where(eq(schema.users.id, user.id)).run();
    db.delete(schema.userSessions).where(eq(schema.userSessions.userId, user.id)).run();
    return { ok: true, signedOut: true };
  });
}
