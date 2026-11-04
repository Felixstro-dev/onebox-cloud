import { hash, verify, Algorithm } from '@node-rs/argon2';
import { and, eq, gt, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { id, token, hashToken } from '../lib/ids.js';
import { unauthorized } from '../lib/errors.js';
import { config } from '../config.js';

const ARGON = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashPassword(password) {
  return hash(password, ARGON);
}

export function verifyPassword(passwordHash, password) {
  return verify(passwordHash, password).catch(() => false);
}

export const COOKIE = 'onebox_session';

export function createSession(userId, req) {
  const raw = token(32);
  const expiresAt = Date.now() + config.sessionDays * 86400000;
  db.insert(schema.userSessions).values({
    id: id(),
    userId,
    tokenHash: hashToken(raw),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
    ip: req.ip,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    expiresAt,
  }).run();
  return { token: raw, expiresAt };
}

export function destroySession(raw) {
  if (!raw) return;
  db.delete(schema.userSessions).where(eq(schema.userSessions.tokenHash, hashToken(raw))).run();
}

export function sessionUser(req) {
  const raw = req.cookies?.[COOKIE];
  if (!raw) return null;
  const session = db.select().from(schema.userSessions).where(and(eq(schema.userSessions.tokenHash, hashToken(raw)), gt(schema.userSessions.expiresAt, Date.now()))).get();
  if (!session) return null;
  const user = db.select().from(schema.users).where(eq(schema.users.id, session.userId)).get();
  if (!user || user.disabled) return null;
  if (Date.now() - session.lastSeenAt > 300000) {
    db.update(schema.userSessions).set({ lastSeenAt: Date.now() }).where(eq(schema.userSessions.id, session.id)).run();
  }
  return user;
}

export function requireUser(req) {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function requireAdmin(req) {
  const user = requireUser(req);
  if (user.role !== 'admin') throw unauthorized('Administrator access required.');
  return user;
}

const loginAttempts = new Map();
const accountLocks = new Map(); // username -> { until, count }

export function isAccountLocked(username) {
  const lock = accountLocks.get(username.toLowerCase());
  if (!lock) return false;
  if (Date.now() > lock.until) { accountLocks.delete(username.toLowerCase()); return false; }
  return true;
}

export function recordFailedLogin(username) {
  const key = username.toLowerCase();
  const lock = accountLocks.get(key) || { until: 0, count: 0 };
  lock.count += 1;
  if (lock.count >= 5) lock.until = Date.now() + 15 * 60 * 1000; // 15 min lockout
  accountLocks.set(key, lock);
}

export function resetAccountLock(username) {
  accountLocks.delete(username.toLowerCase());
}

export function rateLimit(key, { max = 10, windowMs = 60000 } = {}) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.start > windowMs) {
    loginAttempts.set(key, { start: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= max;
}

export function resetRateLimit(key) {
  loginAttempts.delete(key);
}

export function userCount() {
  return db.select({ count: sql`count(*)` }).from(schema.users).get().count;
}
