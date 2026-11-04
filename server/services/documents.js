import fsp from 'node:fs/promises';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, schema, sqlite } from '../db/index.js';
import { id } from '../lib/ids.js';
import { cleanName, mimeOf, nameKey } from '../lib/names.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { commitObject, objectPath, readObject, removeObject, tempPath } from './storage.js';
import { activity, getNode, toClient, uniqueName } from './nodes.js';
import { readFileSync } from 'node:fs';

const d = schema.documents;
const v = schema.documentVersions;
const c = schema.documentComments;
const n = schema.nodes;

const MAX_CONTENT = 4 * 1024 * 1024; // 4 MB Markdown pro Dokument
const SNAPSHOT_INTERVAL = 10 * 60 * 1000; // 10 Minuten Aktivität
const SNAPSHOT_CHANGES = 50; // oder 50 Änderungen

export function isDocMime(mime, name = '') {
  return mime === 'text/markdown' || mime === 'text/x-markdown' || /\.(md|markdown)$/i.test(name);
}

/** Liest die Metadaten eines Dokumentknotens. Wirft 404, wenn keiner existiert. */
export function getDocumentRow(nodeId) {
  return db.select().from(d).where(eq(d.nodeId, nodeId)).get() || null;
}

export function assertDocument(node, userId) {
  if (node.kind !== 'file' || !isDocMime(node.mime, node.name)) {
    throw badRequest('Not a document.');
  }
  if (node.ownerId !== userId) throw notFound('Document not found.');
  return node;
}

/** Erzeugt die Dokument-Tabelle für einen bestehenden .md-Knoten (lazy). */
export function ensureDocument(nodeId, userId) {
  const existing = getDocumentRow(nodeId);
  if (existing) return existing;
  const row = {
    nodeId, status: 'draft', reviewBy: null, revision: 0, lastEditorId: userId,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  db.insert(d).values(row).run();
  return row;
}

function readContent(node) {
  if (!node.objectKey) return '';
  try {
    return readFileSync(objectPath(node.objectKey), 'utf8');
  } catch {
    return '';
  }
}

/** Liest den aktuellen Markdown-Inhalt als String. */
export function readDocumentContent(node) {
  return readContent(node);
}

/**
 * Schreibt den Inhalt als neue Fassung der echten .md-Datei.
 * Erzeugt bei Bededarf eine Momentaufnahme (Version).
 */
export async function writeDocumentContent({ node, userId, content, forceSnapshot = false, label = null }) {
  if (typeof content !== 'string') throw badRequest('Content must be a string.');
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > MAX_CONTENT) throw badRequest('Document is too large.');

  const doc = ensureDocument(node.id, userId);
  const before = readContent(node);

  // Identischer Inhalt: nichts schreiben, aber revisionslos bleiben.
  if (before === content && !forceSnapshot) {
    return { node: toClient(node), changed: false, snapshot: null, revision: doc.revision };
  }

  const temp = tempPath(`doc-${id(24)}`);
  await fsp.writeFile(temp, content, 'utf8');
  const hash = await commitObject(temp);
  const now = Date.now();

  db.update(n).set({ hash, objectKey: hash, size: bytes, updatedAt: now }).where(eq(n.id, node.id)).run();

  const snapshot = await maybeSnapshot({ doc, node, content, before, userId, forceSnapshot, label, now });

  const revision = doc.revision + 1;
  db.update(d).set({ revision, lastEditorId: userId, updatedAt: now }).where(eq(d.nodeId, node.id)).run();

  return {
    node: toClient({ ...node, hash, objectKey: hash, size: bytes, updatedAt: now }),
    changed: true,
    snapshot,
    revision,
  };
}

/**
 * Automatische Momentaufnahme: nach 10 Minuten Ruhe oder 50 Änderungen.
 * Benannte Versionen und Wiederherstellungen werden immer geschrieben.
 */
async function maybeSnapshot({ doc, node, content, before, userId, forceSnapshot, label, now }) {
  const last = db.select().from(v).where(eq(v.nodeId, node.id)).orderBy(desc(v.createdAt)).limit(1).get();
  const changes = countChanges(before, content);
  const due = forceSnapshot
    || !last
    || (now - last.createdAt) >= SNAPSHOT_INTERVAL
    || changes >= SNAPSHOT_CHANGES;

  if (!due && !label) return null;

  const version = {
    id: id(),
    nodeId: node.id,
    label: label || null,
    kind: label ? 'named' : 'auto',
    content,
    authorId: userId,
    size: Buffer.byteLength(content, 'utf8'),
    createdAt: now,
  };
  db.insert(v).values(version).run();
  await pruneAutoVersions(node.id);
  return { id: version.id, kind: version.kind, label: version.label, createdAt: version.createdAt };
}

/** Zählt veränderte Zeichen grob (Differenz der langen gemeinsamen Stammteile). */
function countChanges(a, b) {
  if (a === b) return 0;
  let start = 0;
  const min = Math.min(a.length, b.length);
  while (start < min && a[start] === b[start]) start += 1;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) { endA -= 1; endB -= 1; }
  return (a.length - start - (a.length - 1 - endA)) + (b.length - start - (b.length - 1 - endB))
    + Math.max(0, (endA - start + 1) + (endB - start + 1));
}

/** Dünnt alte automatische Versionen aus: behält die letzten 50. */
async function pruneAutoVersions(nodeId) {
  const keep = Number(await setting('docVersionKeepAuto', 50)) || 50;
  const rows = db.select({ id: v.id }).from(v)
    .where(and(eq(v.nodeId, nodeId), eq(v.kind, 'auto')))
    .orderBy(desc(v.createdAt)).all();
  const stale = rows.slice(keep).map((r) => r.id);
  if (stale.length) {
    for (const versionId of stale) db.delete(v).where(eq(v.id, versionId)).run();
  }
}

async function setting(key, fallback) {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}

export function listVersions(nodeId, { limit = 100 } = {}) {
  return db.select().from(v).where(eq(v.nodeId, nodeId))
    .orderBy(desc(v.createdAt)).limit(limit).all()
    .map((row) => ({
      id: row.id, label: row.label, kind: row.kind, size: row.size,
      authorId: row.authorId, createdAt: row.createdAt,
    }));
}

export function getVersion(nodeId, versionId) {
  const row = db.select().from(v).where(and(eq(v.id, versionId), eq(v.nodeId, nodeId))).get();
  if (!row) throw notFound('Version not found.');
  return row;
}

/** Stellt eine Version wieder her — als neue Version, ohne etwas zu überschreiben. */
export async function restoreVersion({ node, userId, versionId }) {
  const version = getVersion(node.id, versionId);
  const result = await writeDocumentContent({
    node, userId, content: version.content, forceSnapshot: true, label: `Wiederhergestellt: ${version.label || formatStamp(version.createdAt)}`,
  });
  return result;
}

export function formatStamp(stamp) {
  return new Date(stamp).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Löscht Kommentare, die beim Löschen des Dokuments ohnehin mitwandern. */
export function listComments(nodeId, { includeResolved = true } = {}) {
  const rows = db
    .select({ comment: c, author: schema.users })
    .from(c)
    .leftJoin(schema.users, eq(schema.users.id, c.authorId))
    .where(eq(c.nodeId, nodeId))
    .orderBy(c.createdAt)
    .all();
  return rows
    .filter((row) => includeResolved || !row.comment.resolved)
    .map((row) => ({
      id: row.comment.id,
      parentId: row.comment.parentId,
      anchor: row.comment.anchor ? safeJson(row.comment.anchor) : null,
      body: row.comment.body,
      authorId: row.comment.authorId,
      authorName: row.author?.displayName || row.author?.username || null,
      resolved: !!row.comment.resolved,
      mentions: row.comment.mentions ? safeJson(row.comment.mentions) : [],
      createdAt: row.comment.createdAt,
      updatedAt: row.comment.updatedAt,
    }));
}

function safeJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}

export function createComment({ nodeId, userId, body, anchor = null, parentId = null, mentions = [] }) {
  const text = String(body || '').trim();
  if (!text) throw badRequest('Comment cannot be empty.');
  if (text.length > 4000) throw badRequest('Comment is too long.');
  const row = {
    id: id(),
    nodeId,
    parentId: parentId || null,
    anchor: anchor ? JSON.stringify(anchor) : null,
    body: text,
    authorId: userId,
    resolved: false,
    mentions: JSON.stringify(Array.isArray(mentions) ? mentions : []),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  db.insert(c).values(row).run();
  return {
    id: row.id, parentId: row.parentId, anchor, body: row.body, authorId: userId,
    resolved: false, mentions: row.mentions ? JSON.parse(row.mentions) : [], createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

export function updateComment({ nodeId, userId, commentId, patch }) {
  const row = db.select().from(c).where(and(eq(c.id, commentId), eq(c.nodeId, nodeId))).get();
  if (!row) throw notFound('Comment not found.');
  if (row.authorId !== userId) throw forbidden('Only the author can change this comment.');
  const set = { updatedAt: Date.now() };
  if (patch.body !== undefined) {
    const text = String(patch.body || '').trim();
    if (!text) throw badRequest('Comment cannot be empty.');
    set.body = text.slice(0, 4000);
  }
  if (patch.resolved !== undefined) set.resolved = patch.resolved ? 1 : 0;
  db.update(c).set(set).where(eq(c.id, commentId)).run();
  return { id: commentId, ...set };
}

export function deleteComment({ nodeId, userId, commentId }) {
  const row = db.select().from(c).where(and(eq(c.id, commentId), eq(c.nodeId, nodeId))).get();
  if (!row) throw notFound('Comment not found.');
  if (row.authorId !== userId) throw forbidden('Only the author can delete this comment.');
  db.delete(c).where(eq(c.id, commentId)).run();
  db.delete(c).where(eq(c.parentId, commentId)).run();
  return true;
}

const STATUSES = ['draft', 'review', 'changes', 'approved'];

export function setStatus({ node, userId, status, reviewBy = null }) {
  if (!STATUSES.includes(status)) throw badRequest('Unknown review status.');
  ensureDocument(node.id, userId);
  db.update(d).set({ status, reviewBy, updatedAt: Date.now() }).where(eq(d.nodeId, node.id)).run();
  return { status, reviewBy };
}

/**
 * Legt ein neues Dokument als echte .md-Datei im Dateibaum an.
 */
export async function createDocument({ user, parentId, name }) {
  const desired = cleanName(name || 'Neues Dokument', 'Neues Dokument');
  const withExt = /\.(md|markdown|txt)$/i.test(desired) ? desired : `${desired}.md`;
  const finalName = uniqueName(user.id, parentId, withExt);
  const content = `# ${finalName.replace(/\.(md|markdown|txt)$/i, '')}\n\n`;
  const bytes = Buffer.byteLength(content, 'utf8');

  const temp = tempPath(`doc-${id(24)}`);
  await fsp.writeFile(temp, content, 'utf8');
  const hash = await commitObject(temp);

  const row = {
    id: id(), ownerId: user.id, parentId: parentId || null, kind: 'file', name: finalName,
    nameKey: nameKey(finalName), size: bytes, mime: mimeOf(finalName) || 'text/markdown',
    hash, objectKey: hash, createdAt: Date.now(), updatedAt: Date.now(),
  };
  db.insert(n).values(row).run();
  ensureDocument(row.id, user.id);
  return toClient(row);
}

/** Prüft, ob der Nutzer Zugriff hat — über Besitz oder eine aktive Freigabe. */
export function canViewDocument(node, userId) {
  if (node.ownerId === userId) return true;
  if (node.trashedAt) return false;
  const share = db.select().from(schema.shares).where(and(
    eq(schema.shares.nodeId, node.id),
    isNull(schema.shares.revokedAt),
    sql`${schema.shares.expiresAt} is null or ${schema.shares.expiresAt} > ${Date.now()}`,
  )).get();
  return !!share;
}

export { MAX_CONTENT, SNAPSHOT_INTERVAL, SNAPSHOT_CHANGES };
