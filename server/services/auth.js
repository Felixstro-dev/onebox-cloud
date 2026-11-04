import { hash, verify, Algorithm } from '@node-rs/argon2';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
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

// Fester Argon2id-Hash, damit ein unbekannter Nutzername nicht schneller
// antwortet als ein bekanntes Konto mit falschem Passwort.
const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$wETw0zYnu2uTH0RC7Z/otg$3yEmOlF3DeTpURZT73uYxlhEBSpLto/3gmHF4fWPWTs';

export async function verifyLoginPassword(user, password) {
  const ok = await verifyPassword(user?.passwordHash || DUMMY_HASH, password);
  return Boolean(user) && ok;
}

export const COOKIE = 'onebox_session';

export function createSession(userId, req) {
  const raw = token(32);
  const previous = req?.cookies?.[COOKIE];
  // Session-Rotation: eine bereits vorhandene Sitzung wird beim Login
  // verworfen, damit ein Fixation-Angriff nicht auf die alte ID wirkt.
  if (previous) destroySession(previous);
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

export function listSessions(userId, currentRaw) {
  const currentHash = currentRaw ? hashToken(currentRaw) : null;
  return db.select().from(schema.userSessions)
    .where(and(eq(schema.userSessions.userId, userId), gt(schema.userSessions.expiresAt, Date.now())))
    .orderBy(desc(schema.userSessions.lastSeenAt)).all()
    .map((row) => ({
      id: row.id,
      current: Boolean(currentHash) && row.tokenHash === currentHash,
      userAgent: row.userAgent || '',
      ip: row.ip || '',
      createdAt: row.createdAt,
      lastSeenAt: row.lastSeenAt,
      expiresAt: row.expiresAt,
    }));
}

export function revokeSession(userId, sessionId) {
  const result = db.delete(schema.userSessions)
    .where(and(eq(schema.userSessions.id, sessionId), eq(schema.userSessions.userId, userId))).run();
  return result.changes > 0;
}

// Zustand bewusst auf globalThis, damit er auch dann geteilt wird, wenn
// das Modul durch Tests oder mehrere Einstiegspunkte zweimal geladen wird.
const authState = globalThis.__oneboxAuthState ??= {
  loginAttempts: new Map(),
  accountLocks: new Map(),
  twoFactorChallenges: new Map(),
};
const twoFactorChallenges = authState.twoFactorChallenges;
const CHALLENGE_TTL = 5 * 60 * 1000;

export function createTwoFactorChallenge(userId) {
  const challenge = token(32);
  twoFactorChallenges.set(challenge, { userId, expiresAt: Date.now() + CHALLENGE_TTL, attempts: 0 });
  return { challenge, expiresIn: Math.floor(CHALLENGE_TTL / 1000) };
}

export function getTwoFactorChallenge(challenge) {
  const entry = twoFactorChallenges.get(String(challenge || ''));
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    twoFactorChallenges.delete(String(challenge));
    return null;
  }
  return entry;
}

export function failTwoFactorChallenge(challenge) {
  const entry = getTwoFactorChallenge(challenge);
  if (!entry) return;
  entry.attempts += 1;
  if (entry.attempts >= 5) twoFactorChallenges.delete(String(challenge));
}

export function clearTwoFactorChallenge(challenge) {
  twoFactorChallenges.delete(String(challenge || ''));
}

export function requireAdmin(req) {
  const user = requireUser(req);
  if (user.role !== 'admin') throw unauthorized('Administrator access required.');
  return user;
}

const loginAttempts = authState.loginAttempts;
const accountLocks = authState.accountLocks; // username -> { count, firstAt, until }

// Steigende Sperrzeit: 1 min, 5 min, 15 min, 1 h, danach 24 h.
const LOCK_STEPS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 24 * 60 * 60_000];

export function isAccountLocked(username) {
  const key = String(username || '').toLowerCase();
  const lock = accountLocks.get(key);
  if (!lock) return false;
  // until === 0 bedeutet: Fehlversuche werden gezählt, aber noch keine Sperre.
  if (lock.until && Date.now() > lock.until) {
    accountLocks.delete(key);
    return false;
  }
  return Boolean(lock.until) && lock.until > Date.now();
}

export function accountLockSeconds(username) {
  const lock = accountLocks.get(String(username || '').toLowerCase());
  if (!lock || lock.until <= Date.now()) return 0;
  return Math.ceil((lock.until - Date.now()) / 1000);
}

export function recordFailedLogin(username) {
  const key = String(username || '').toLowerCase();
  const now = Date.now();
  const lock = accountLocks.get(key) || { count: 0, firstAt: now, until: 0 };
  // Ein neues Zeitfenster beginnt, wenn die letzte Serie über eine Stunde alt ist.
  if (now - lock.firstAt > 60 * 60_000) {
    lock.count = 0;
    lock.firstAt = now;
  }
  lock.count += 1;
  if (lock.count >= 5) {
    const step = Math.min(lock.count - 5, LOCK_STEPS.length - 1);
    lock.until = now + LOCK_STEPS[step];
  }
  accountLocks.set(key, lock);
}

export function resetAccountLock(username) {
  accountLocks.delete(String(username || '').toLowerCase());
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
