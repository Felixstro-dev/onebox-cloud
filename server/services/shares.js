import crypto from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { hashToken, id, token } from '../lib/ids.js';
import { getSetting, setSetting } from './settings.js';
import { getNode } from './nodes.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { hashPassword, verifyPassword } from './auth.js';
import { cleanName } from '../lib/names.js';

function secret() {
  let value = getSetting('shareSecret');
  if (!value) {
    value = crypto.randomBytes(32).toString('base64url');
    setSetting('shareSecret', value);
  }
  return value;
}

export function signAccess(shareId, ttlMs = 3600000) {
  const payload = `${shareId}.${Date.now() + ttlMs}`;
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

export function verifyAccess(shareId, accessToken) {
  if (!accessToken) return false;
  const [encoded, sig] = String(accessToken).split('.');
  if (!encoded || !sig) return false;
  let payload;
  try {
    payload = Buffer.from(encoded, 'base64url').toString();
  } catch {
    return false;
  }
  const [idPart, expires] = payload.split('.');
  if (idPart !== shareId || Number(expires) < Date.now()) return false;
  const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function shareStatus(share) {
  if (share.revokedAt) return 'revoked';
  if (share.expiresAt && share.expiresAt < Date.now()) return 'expired';
  if (share.maxDownloads && share.downloadCount >= share.maxDownloads) return 'used_up';
  return 'active';
}

export async function createShare(ownerId, body) {
  const kind = body.kind === 'upload' ? 'upload' : 'link';
  const node = getNode(body.nodeId, ownerId);
  if (kind === 'upload' && node.kind !== 'folder') throw badRequest('Upload requests need a folder.');
  if (kind === 'link' && node.kind === 'folder' && body.maxDownloads) throw badRequest('Download limits apply to files, not folders.');
  const raw = token(24);
  const row = {
    id: id(),
    tokenHash: hashToken(raw),
    tokenPrefix: raw.slice(0, 6),
    kind,
    nodeId: node.id,
    ownerId,
    passwordHash: body.password ? await hashPassword(body.password) : null,
    expiresAt: body.expiresAt || null,
    maxDownloads: body.maxDownloads || null,
    downloadCount: 0,
    maxFileSize: body.maxFileSize || null,
    maxTotalSize: body.maxTotalSize || null,
    allowedTypes: Array.isArray(body.allowedTypes) && body.allowedTypes.length ? JSON.stringify(body.allowedTypes) : null,
    totalUploaded: 0,
    createdAt: Date.now(),
  };
  db.insert(schema.shares).values(row).run();
  return { share: clientShare(row, node), token: raw, url: `${kind === 'upload' ? '/u/' : '/s/'}${raw}` };
}

export function clientShare(row, node = null) {
  return {
    id: row.id,
    kind: row.kind,
    nodeId: row.nodeId,
    nodeName: node?.name ?? null,
    nodeKind: node?.kind ?? null,
    tokenPrefix: row.tokenPrefix,
    passwordProtected: Boolean(row.passwordHash),
    expiresAt: row.expiresAt,
    maxDownloads: row.maxDownloads,
    downloadCount: row.downloadCount,
    maxFileSize: row.maxFileSize,
    maxTotalSize: row.maxTotalSize,
    allowedTypes: row.allowedTypes ? JSON.parse(row.allowedTypes) : null,
    totalUploaded: row.totalUploaded,
    status: shareStatus(row),
    createdAt: row.createdAt,
  };
}

export function listShares(ownerId) {
  const rows = db.select().from(schema.shares).where(eq(schema.shares.ownerId, ownerId)).orderBy(desc(schema.shares.createdAt)).all();
  return rows.map((row) => {
    const node = row.nodeId ? db.select().from(schema.nodes).where(eq(schema.nodes.id, row.nodeId)).get() : null;
    return clientShare(row, node);
  });
}

export function revokeShare(ownerId, shareId) {
  const row = db.select().from(schema.shares).where(and(eq(schema.shares.id, shareId), eq(schema.shares.ownerId, ownerId))).get();
  if (!row) throw notFound('Share not found.');
  db.update(schema.shares).set({ revokedAt: Date.now() }).where(eq(schema.shares.id, shareId)).run();
}

export function getShareByToken(raw) {
  const row = db.select().from(schema.shares).where(eq(schema.shares.tokenHash, hashToken(raw))).get();
  if (!row) throw notFound('This link does not exist.');
  return row;
}

export function resolveSharePath(share, parts) {
  let node = db.select().from(schema.nodes).where(eq(schema.nodes.id, share.nodeId)).get();
  if (!node) throw notFound('The shared item was removed.');
  for (const part of parts) {
    if (node.kind !== 'folder') throw notFound('Path not found.');
    node = db.select().from(schema.nodes).where(and(
      eq(schema.nodes.ownerId, share.ownerId),
      eq(schema.nodes.parentId, node.id),
      eq(schema.nodes.nameKey, String(part).toLocaleLowerCase('de')),
      isNull(schema.nodes.trashedAt),
    )).get();
    if (!node) throw notFound('Path not found.');
  }
  return node;
}

export function requireShareAccess(share, accessToken) {
  const status = shareStatus(share);
  if (status !== 'active') throw forbidden(status === 'expired' ? 'This link has expired.' : 'This link is no longer available.');
  if (share.passwordHash && !verifyAccess(share.id, accessToken)) throw forbidden('Password required.');
}

export function allowedTypeMatch(allowed, mime, name) {
  if (!allowed?.length) return true;
  return allowed.some((pattern) => {
    if (pattern.endsWith('/*')) return mime.startsWith(pattern.slice(0, -1));
    if (pattern.startsWith('.')) return cleanName(name).toLowerCase().endsWith(pattern.toLowerCase());
    return mime === pattern;
  });
}
