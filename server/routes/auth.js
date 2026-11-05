import { eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { badRequest, unauthorized } from '../lib/errors.js';
import {
  COOKIE, accountLockSeconds, clearTwoFactorChallenge, createSession, createTwoFactorChallenge,
  destroySession, failTwoFactorChallenge, getTwoFactorChallenge, hashPassword, isAccountLocked,
  listSessions, rateLimit, recordFailedLogin, requireUser, resetAccountLock, resetRateLimit,
  revokeSession, userCount, verifyLoginPassword, verifyPassword,
} from '../services/auth.js';
import {
  generateSecret, hashRecoveryCode, matchRecoveryCode, otpauthUrl, recoveryCode, verifyTotp,
} from '../lib/totp.js';
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
    twoFactorEnabled: Boolean(user.totpEnabled),
  };
}

export async function registerAuthRoutes(app) {
  app.get('/api/v1/system/setup', async () => ({ needsSetup: userCount() === 0 }));

  app.post('/api/v1/system/setup', {
    config: { rateLimit: { max: 10, timeWindow: '5 minutes', keyGenerator: (req) => `setup:${req.ip}` } },
    schema: {
      body: {
        type: 'object', required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 2, maxLength: 64 },
          password: { type: 'string', minLength: 10, maxLength: 256 },
          displayName: { type: 'string', maxLength: 80 },
        },
      },
    },
  }, async (req, reply) => {
    const setupCompleted = userCount() > 0;
    if (setupCompleted) {
      req.log.info({ event: 'setup.already_completed' }, 'Setup request rejected because setup is already completed.');
      throw badRequest('Setup has already been completed.');
    }
    const username = req.body.username.trim();
    if (!/^[a-zA-Z0-9._-]+$/.test(username)) throw badRequest('Username may only use letters, numbers, dots, dashes, and underscores.');
    const passwordHash = await hashPassword(req.body.password);
    const userId = id();
    try {
      db.transaction((tx) => {
        if (tx.select({ count: sql`count(*)` }).from(schema.users).get().count > 0) {
          throw badRequest('Setup has already been completed.');
        }
        tx.insert(schema.users).values({
          id: userId, username, displayName: (req.body.displayName || '').trim() || username,
          passwordHash, role: 'admin', quotaBytes: 0, createdAt: Date.now(),
        }).run();
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw badRequest('Setup has already been completed.');
      }
      throw error;
    }
    const session = createSession(userId, req);
    reply.setCookie(COOKIE, session.token, cookieOptions);
    activity(userId, 'setup.completed', 'user', userId, null, req.ip);
    return { user: publicUser(db.select().from(schema.users).where(eq(schema.users.id, userId)).get()) };
  });

  app.post('/api/v1/auth/login', {
    config: { rateLimit: { max: 30, timeWindow: '5 minutes', keyGenerator: (req) => `login:${req.ip}` } },
    schema: {
      body: {
        type: 'object', required: ['username', 'password'],
        properties: { username: { type: 'string', maxLength: 64 }, password: { type: 'string', maxLength: 256 } },
      },
    },
  }, async (req, reply) => {
    const username = String(req.body.username || '');
    const key = `${req.ip}:${username.toLowerCase()}`;
    if (isAccountLocked(username)) {
      const retryAfter = accountLockSeconds(username);
      return reply.status(429).header('Retry-After', retryAfter).send({
        error: { code: 'invalid_credentials', message: 'Anmeldung fehlgeschlagen. Bitte später erneut versuchen.', retryAfter },
      });
    }
    if (!rateLimit(key, { max: 8, windowMs: 300000 })) {
      return reply.status(429).send({ error: { code: 'rate_limited', message: 'Zu viele Anmeldeversuche. Bitte fünf Minuten warten.' } });
    }
    const user = db.select().from(schema.users).where(sql`lower(${schema.users.username}) = ${username.toLowerCase()}`).get();
    const passwordOk = await verifyLoginPassword(user, req.body.password);
    if (!user || user.disabled || !passwordOk) {
      recordFailedLogin(username);
      activity(user?.id || null, 'auth.login.failed', 'user', user?.id || null, username.slice(0, 64), req.ip);
      // Bewusst identische Antwort für unbekannten Nutzer und falsches Passwort.
      return reply.status(401).send({ error: { code: 'invalid_credentials', message: 'Benutzername oder Passwort ist falsch.' } });
    }
    if (user.totpEnabled) {
      const { challenge, expiresIn } = createTwoFactorChallenge(user.id);
      return { twoFactorRequired: true, challengeToken: challenge, expiresIn };
    }
    resetRateLimit(key);
    resetAccountLock(username);
    db.update(schema.users).set({ lastLoginAt: Date.now() }).where(eq(schema.users.id, user.id)).run();
    const session = createSession(user.id, req);
    reply.setCookie(COOKIE, session.token, cookieOptions);
    activity(user.id, 'auth.login', 'user', user.id, null, req.ip);
    return { user: publicUser({ ...user, lastLoginAt: Date.now() }) };
  });

  app.post('/api/v1/auth/2fa/verify', {
    config: { rateLimit: { max: 20, timeWindow: '5 minutes', keyGenerator: (req) => `2fa:${req.ip}` } },
    schema: {
      body: {
        type: 'object', required: ['challengeToken', 'code'],
        properties: { challengeToken: { type: 'string', maxLength: 128 }, code: { type: 'string', maxLength: 32 } },
      },
    },
  }, async (req, reply) => {
    const entry = getTwoFactorChallenge(req.body.challengeToken);
    if (!entry) throw unauthorized('Die Anmeldung ist abgelaufen. Bitte erneut anmelden.');
    const user = db.select().from(schema.users).where(eq(schema.users.id, entry.userId)).get();
    if (!user || user.disabled || !user.totpEnabled || !user.totpSecret) {
      clearTwoFactorChallenge(req.body.challengeToken);
      throw unauthorized('Die Zwei-Faktor-Anmeldung ist nicht verfügbar.');
    }
    const code = String(req.body.code || '').trim();
    let matchedRecovery = null;
    let counter = null;
    if (/^\d{6}$/.test(code)) {
      counter = verifyTotp(user.totpSecret, code);
      if (counter !== null && user.totpLastCounter && counter <= user.totpLastCounter) counter = null;
    } else {
      const hashes = JSON.parse(user.recoveryCodes || '[]');
      matchedRecovery = matchRecoveryCode(code, hashes);
    }
    if (counter === null && !matchedRecovery) {
      failTwoFactorChallenge(req.body.challengeToken);
      recordFailedLogin(user.username);
      activity(user.id, 'auth.2fa.failed', 'user', user.id, null, req.ip);
      return reply.status(401).send({ error: { code: 'invalid_code', message: 'Der Code ist falsch oder abgelaufen.' } });
    }
    if (matchedRecovery) {
      const hashes = JSON.parse(user.recoveryCodes || '[]').filter((hash) => hash !== matchedRecovery);
      db.update(schema.users).set({ recoveryCodes: JSON.stringify(hashes) }).where(eq(schema.users.id, user.id)).run();
    } else {
      db.update(schema.users).set({ totpLastCounter: counter }).where(eq(schema.users.id, user.id)).run();
    }
    clearTwoFactorChallenge(req.body.challengeToken);
    resetAccountLock(user.username);
    db.update(schema.users).set({ lastLoginAt: Date.now() }).where(eq(schema.users.id, user.id)).run();
    const session = createSession(user.id, req);
    reply.setCookie(COOKIE, session.token, cookieOptions);
    activity(user.id, 'auth.login', 'user', user.id, '2FA', req.ip);
    const remaining = JSON.parse(db.select({ codes: schema.users.recoveryCodes }).from(schema.users).where(eq(schema.users.id, user.id)).get()?.codes || '[]').length;
    return { user: publicUser({ ...user, lastLoginAt: Date.now() }), recoveryCodesRemaining: remaining };
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

  app.get('/api/v1/auth/sessions', async (req) => {
    const user = requireUser(req);
    return { items: listSessions(user.id, req.cookies?.[COOKIE]) };
  });

  app.delete('/api/v1/auth/sessions/:id', async (req, reply) => {
    const user = requireUser(req);
    const sessions = listSessions(user.id, req.cookies?.[COOKIE]);
    const target = sessions.find((item) => item.id === req.params.id);
    if (!target) throw badRequest('Sitzung nicht gefunden.');
    revokeSession(user.id, target.id);
    if (target.current) reply.clearCookie(COOKIE, { path: '/' });
    activity(user.id, 'auth.session.revoke', 'session', target.id, target.current ? 'aktuelle Sitzung' : null, req.ip);
    return { ok: true, signedOut: target.current };
  });

  app.get('/api/v1/auth/2fa', async (req) => {
    const user = requireUser(req);
    const codes = user.recoveryCodes ? JSON.parse(user.recoveryCodes) : [];
    return { enabled: Boolean(user.totpEnabled), recoveryCodesRemaining: codes.length };
  });

  app.post('/api/v1/auth/2fa/setup', async (req) => {
    const user = requireUser(req);
    if (user.totpEnabled) throw badRequest('Zwei-Faktor-Authentifizierung ist bereits aktiv.');
    const secret = generateSecret();
    const codes = Array.from({ length: 10 }, () => recoveryCode());
    db.update(schema.users).set({
      totpSecret: secret,
      totpEnabled: false,
      recoveryCodes: JSON.stringify(codes.map(hashRecoveryCode)),
      totpLastCounter: null,
    }).where(eq(schema.users.id, user.id)).run();
    activity(user.id, 'auth.2fa.setup', 'user', user.id, null, req.ip);
    return {
      secret,
      otpauth: otpauthUrl(secret, user.username),
      recoveryCodes: codes,
    };
  });

  app.post('/api/v1/auth/2fa/enable', {
    schema: {
      body: {
        type: 'object', required: ['code'],
        properties: { code: { type: 'string', minLength: 6, maxLength: 8 } },
      },
    },
  }, async (req) => {
    const user = requireUser(req);
    if (!user.totpSecret) throw badRequest('Starte zuerst die Einrichtung.');
    const counter = verifyTotp(user.totpSecret, req.body.code);
    if (counter === null) throw badRequest('Der Code ist falsch oder abgelaufen.');
    db.update(schema.users).set({ totpEnabled: true, totpLastCounter: counter }).where(eq(schema.users.id, user.id)).run();
    activity(user.id, 'auth.2fa.enable', 'user', user.id, null, req.ip);
    return { ok: true, enabled: true };
  });

  app.post('/api/v1/auth/2fa/disable', {
    schema: {
      body: {
        type: 'object', required: ['password'],
        properties: { password: { type: 'string', maxLength: 256 } },
      },
    },
  }, async (req) => {
    const user = requireUser(req);
    if (!(await verifyPassword(user.passwordHash, req.body.password))) throw unauthorized('Passwort ist falsch.');
    db.update(schema.users).set({
      totpSecret: null, totpEnabled: false, recoveryCodes: null, totpLastCounter: null,
    }).where(eq(schema.users.id, user.id)).run();
    activity(user.id, 'auth.2fa.disable', 'user', user.id, null, req.ip);
    return { ok: true, enabled: false };
  });

  app.post('/api/v1/auth/2fa/recovery', {
    schema: {
      body: {
        type: 'object', required: ['password'],
        properties: { password: { type: 'string', maxLength: 256 } },
      },
    },
  }, async (req) => {
    const user = requireUser(req);
    if (!user.totpEnabled) throw badRequest('Zwei-Faktor-Authentifizierung ist nicht aktiv.');
    if (!(await verifyPassword(user.passwordHash, req.body.password))) throw unauthorized('Passwort ist falsch.');
    const codes = Array.from({ length: 10 }, () => recoveryCode());
    db.update(schema.users).set({ recoveryCodes: JSON.stringify(codes.map(hashRecoveryCode)) }).where(eq(schema.users.id, user.id)).run();
    activity(user.id, 'auth.2fa.recovery', 'user', user.id, '10 neue Codes', req.ip);
    return { recoveryCodes: codes };
  });
}
