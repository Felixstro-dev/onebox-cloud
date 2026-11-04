import fsp from 'node:fs/promises';
import path from 'node:path';
import { and, asc, desc, eq, inArray, isNull, like, ne, sql } from 'drizzle-orm';
import { db, schema, sqlite } from '../db/index.js';
import { id } from '../lib/ids.js';
import { cleanName, isImage, mimeOf, nameKey } from '../lib/names.js';
import { badRequest, conflict, forbidden, notFound, tooLarge } from '../lib/errors.js';
import { commitObject, objectPath, removeObject } from './storage.js';
import { config, paths } from '../config.js';

const n = schema.nodes;

export function getNode(nodeId, userId, { includeTrashed = false, anyOwner = false } = {}) {
  const row = db.select().from(n).where(eq(n.id, nodeId)).get();
  if (!row) throw notFound('File not found.');
  if (!anyOwner && row.ownerId !== userId) throw notFound('File not found.');
  if (!includeTrashed && row.trashedAt) throw notFound('File is in the trash.');
  return row;
}

export function rootList(userId, parentId = null) {
  if (parentId) {
    const parent = getNode(parentId, userId);
    if (parent.kind !== 'folder') throw badRequest('Parent is not a folder.');
  }
  return parentId;
}

export function breadcrumbs(userId, folderId) {
  const rows = sqlite.prepare(`
    with recursive chain(id, name, parent_id, kind, depth) as (
      select id, name, parent_id, kind, 0 from nodes where id = ? and owner_id = ?
      union all
      select n.id, n.name, n.parent_id, n.kind, chain.depth + 1
      from nodes n join chain on n.id = chain.parent_id where n.owner_id = ?
    )
    select id, name, kind from chain order by depth desc
  `).all(folderId, userId, userId);
  return rows;
}

/**
 * Sortierfelder für die Keyset-Pagination. Der Ordner-Rang wird immer zuerst
 * sortiert, damit Ordner unabhängig von der Richtung vor Dateien stehen.
 */
const SORT_FIELDS = {
  name: 'nameKey',
  size: 'size',
  updated: 'updatedAt',
  updatedAt: 'updatedAt',
  created: 'createdAt',
  createdAt: 'createdAt',
  kind: 'kind',
  type: 'kind',
};

export function normalizeSort(sort) {
  return SORT_FIELDS[sort] ? sort : 'name';
}

function sortField(sort) {
  return n[SORT_FIELDS[normalizeSort(sort)]];
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    if (!parsed || typeof parsed.i !== 'string') return null;
    return { value: parsed.v, id: parsed.i, rank: parsed.rank };
  } catch {
    return null;
  }
}

function cursorClause(cursor, sort, dir) {
  const decoded = decodeCursor(cursor);
  if (!decoded) return null;
  const rank = sql`case when ${n.kind} = 'folder' then 0 else 1 end`;
  const field = sortField(sort);
  const move = dir === 'desc' ? sql`<` : sql`>`;
  const value = decoded.value;
  const sameRankAfter = sql`(${field} ${move} ${value} or (${field} = ${value} and ${n.id} ${move} ${decoded.id}))`;
  return sql`(${rank} > ${decoded.rank ?? 0} or (${rank} = ${decoded.rank ?? 0} and ${sameRankAfter}))`;
}

function buildClauses(userId, parentId, { trashed = false, kind = null, q = null } = {}) {
  const clauses = [eq(n.ownerId, userId)];
  if (!trashed) {
    clauses.push(isNull(n.trashedAt));
    if (parentId) clauses.push(eq(n.parentId, parentId));
    else clauses.push(isNull(n.parentId));
  } else {
    clauses.push(sql`${n.trashedAt} is not null`);
    if (parentId) clauses.push(eq(n.parentId, parentId));
  }
  if (kind) clauses.push(eq(n.kind, kind));
  if (q) clauses.push(like(n.nameKey, `%${escapeLike(q)}%`));
  return clauses;
}

export function listChildren(userId, parentId, { sort = 'name', dir = 'asc', limit = 100, cursor = null, trashed = false, kind = null, q = null } = {}) {
  sort = normalizeSort(sort);
  const direction = dir === 'desc' ? desc : asc;
  const rank = sql`case when ${n.kind} = 'folder' then 0 else 1 end`;
  const field = sortField(sort);
  const clauses = buildClauses(userId, parentId, { trashed, kind, q });
  const total = db.select({ c: sql`count(*)` }).from(n).where(and(...clauses)).get()?.c || 0;

  let rows = [];
  if (!total) {
    return { items: [], nextCursor: null, next: null, total: 0 };
  }

  if (trashed) {
    // Papierkorb: Kinder eines mitgelöschten Ordners nicht doppelt anzeigen.
    const all = db.select().from(n).where(and(...clauses)).orderBy(asc(rank), direction(field), direction(n.id)).all();
    const filtered = all.filter((row) => {
      const parent = row.parentId ? db.select({ t: n.trashedAt }).from(n).where(eq(n.id, row.parentId)).get() : null;
      return !parent || parent.t !== row.trashedAt;
    });
    let start = 0;
    if (cursor) {
      const index = filtered.findIndex((row) => row.id === cursor);
      start = index >= 0 ? index + 1 : 0;
    }
    const page = filtered.slice(start, start + limit);
    const next = start + limit < filtered.length ? page.at(-1)?.id || null : null;
    return { items: page.map(toClient), nextCursor: next, next, total: filtered.length };
  }

  const sqlCursor = cursor ? decodeCursor(cursor) : null;
  const after = sqlCursor && sqlCursor.rank !== undefined ? cursorClause(cursor, sort, dir) : null;
  const where = after ? and(...clauses, after) : and(...clauses);
  rows = db.select().from(n).where(where).orderBy(asc(rank), direction(field), direction(n.id)).limit(limit + 1).all();

  const page = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const last = page.at(-1);
  const nextCursor = hasMore && last
    ? Buffer.from(JSON.stringify({ v: last[SORT_FIELDS[sort]], i: last.id, rank: last.kind === 'folder' ? 0 : 1 }), 'utf8').toString('base64url')
    : null;
  return {
    items: page.map(toClient),
    nextCursor,
    next: nextCursor,
    total: Math.max(total, 0),
  };
}

export function searchNodes(userId, query, { limit = 50, parentId = null } = {}) {
  const term = `%${String(query || '').toLocaleLowerCase('de').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
  const rows = db.select().from(n)
    .where(and(eq(n.ownerId, userId), isNull(n.trashedAt), like(n.nameKey, term)))
    .orderBy(asc(n.nameKey)).limit(limit).all();
  return rows.map(toClient);
}

function escapeLike(value) {
  return String(value).toLocaleLowerCase('de').replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

/**
 * Filter für "alle auswählen". Sortierung ist nur Teil des Vertrags, damit
 * der Client den exakten Zustand mitschicken kann; für die ID-Auflösung ist
 * sie ohne Bedeutung.
 */
export function normalizeSelectionFilter(filter = {}) {
  return {
    parentId: filter.parentId === undefined || filter.parentId === 'root' ? null : filter.parentId,
    q: typeof filter.q === 'string' && filter.q.trim() ? filter.q.trim() : null,
    kind: filter.kind === 'file' || filter.kind === 'folder' ? filter.kind : null,
    sort: typeof filter.sort === 'string' ? filter.sort : 'name',
    dir: filter.dir === 'desc' ? 'desc' : 'asc',
  };
}

function selectionClauses(userId, selection, { includeTrashed = false } = {}) {
  if (!selection || (!selection.selectAll && !Array.isArray(selection.ids))) {
    throw badRequest('Selection must contain ids or selectAll with a filter.');
  }
  const clauses = [eq(n.ownerId, userId)];
  if (!includeTrashed) clauses.push(isNull(n.trashedAt));
  if (!selection.selectAll) return { clauses, filter: null };
  const filter = normalizeSelectionFilter(selection.filter || {});
  if (filter.q) {
    clauses.push(like(n.nameKey, `%${escapeLike(filter.q)}%`));
  } else if (filter.parentId) {
    clauses.push(eq(n.parentId, filter.parentId));
  } else {
    clauses.push(isNull(n.parentId));
  }
  if (filter.kind) clauses.push(eq(n.kind, filter.kind));
  // Snapshot: nur Elemente, die zum Zeitpunkt der Auswahl bereits existierten.
  const snapshot = Number(selection.snapshot);
  if (Number.isFinite(snapshot) && snapshot > 0) clauses.push(sql`${n.createdAt} <= ${Math.floor(snapshot)}`);
  return { clauses, filter };
}

function applyExclusions(rows, selection) {
  const exclude = new Set(Array.isArray(selection?.exclude) ? selection.exclude : []);
  return exclude.size ? rows.filter((row) => !exclude.has(row.id)) : rows;
}

/** Löst eine Bulk-Auswahl serverseitig in Knoten auf. */
export function selectionRows(userId, selection, { includeTrashed = false } = {}) {
  const { clauses } = selectionClauses(userId, selection, { includeTrashed });
  if (!selection.selectAll) {
    const ids = [...new Set((selection.ids || []).filter((value) => typeof value === 'string' && value))];
    if (!ids.length) return [];
    const rows = [];
    for (let index = 0; index < ids.length; index += 500) {
      rows.push(...db.select().from(n).where(and(...clauses, inArray(n.id, ids.slice(index, index + 500)))).all());
    }
    return applyExclusions(rows, selection);
  }
  return applyExclusions(db.select().from(n).where(and(...clauses)).all(), selection);
}

export function selectionCount(userId, selection) {
  return selectionRows(userId, selection).length;
}

export function findChildByName(userId, parentId, desired) {
  const name = cleanName(desired);
  const clauses = [eq(n.ownerId, userId), eq(n.nameKey, nameKey(name)), isNull(n.trashedAt)];
  if (parentId) clauses.push(eq(n.parentId, parentId));
  else clauses.push(isNull(n.parentId));
  return db.select().from(n).where(and(...clauses)).get() || null;
}

export function uniqueName(userId, parentId, desired, ignoreId = null) {
  const name = cleanName(desired);
  const clauses = [eq(n.ownerId, userId), eq(n.nameKey, nameKey(name)), sql`${n.trashedAt} is null`];
  if (parentId) clauses.push(eq(n.parentId, parentId));
  else clauses.push(isNull(n.parentId));
  if (ignoreId) clauses.push(ne(n.id, ignoreId));
  const exists = db.select({ id: n.id }).from(n).where(and(...clauses)).get();
  if (!exists) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 2; i < 500; i += 1) {
    const candidate = `${stem} (${i})${ext}`;
    const c = [eq(n.ownerId, userId), eq(n.nameKey, nameKey(candidate)), sql`${n.trashedAt} is null`];
    if (parentId) c.push(eq(n.parentId, parentId));
    else c.push(isNull(n.parentId));
    if (ignoreId) c.push(ne(n.id, ignoreId));
    if (!db.select({ id: n.id }).from(n).where(and(...c)).get()) return candidate;
  }
  return `${stem}-${Date.now()}${ext}`;
}

export function usedBytes(userId) {
  const row = db.select({ total: sql`coalesce(sum(${n.size}), 0)` }).from(n)
    .where(and(eq(n.ownerId, userId), eq(n.kind, 'file'), isNull(n.trashedAt))).get();
  return row?.total ?? 0;
}

export function quotaFor(user) {
  if (user.quotaBytes > 0) return user.quotaBytes;
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, 'defaultQuota')).get();
  const value = row ? Number(JSON.parse(row.value)) : 0;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function assertQuota(user, addBytes) {
  const quota = quotaFor(user);
  if (quota > 0 && usedBytes(user.id) + addBytes > quota) throw tooLarge('Storage quota is full.');
}

export function createFolder(userId, parentId, name) {
  rootList(userId, parentId);
  const finalName = uniqueName(userId, parentId, name || 'New folder');
  const row = {
    id: id(), ownerId: userId, parentId: parentId || null, kind: 'folder', name: finalName,
    nameKey: nameKey(finalName), size: 0, mime: 'inode/directory', createdAt: Date.now(), updatedAt: Date.now(),
  };
  db.insert(n).values(row).run();
  return toClient(row);
}

export async function createFile({ user, parentId, name, mime, tempFile }) {
  const userId = user.id;
  rootList(userId, parentId);
  const stat = await fsp.stat(tempFile);
  assertQuota(user, stat.size);
  const finalName = uniqueName(userId, parentId, name);
  const hash = await commitObject(tempFile);
  const row = {
    id: id(), ownerId: userId, parentId: parentId || null, kind: 'file', name: finalName,
    nameKey: nameKey(finalName), size: stat.size, mime: mime || mimeOf(finalName), hash,
    objectKey: hash, createdAt: Date.now(), updatedAt: Date.now(),
  };
  db.insert(n).values(row).run();
  return toClient(row);
}

export async function renameNode(userId, nodeId, name) {
  const node = getNode(nodeId, userId);
  const finalName = uniqueName(userId, node.parentId, name, nodeId);
  db.update(n).set({ name: finalName, nameKey: nameKey(finalName), updatedAt: Date.now() }).where(eq(n.id, nodeId)).run();
  return toClient({ ...node, name: finalName, nameKey: nameKey(finalName) });
}

export function assertNotDescendant(userId, folderId, targetParentId) {
  if (!targetParentId) return;
  if (folderId === targetParentId) throw badRequest('A folder cannot be moved into itself.');
  const rows = sqlite.prepare(`
    with recursive chain(id, parent_id) as (
      select id, parent_id from nodes where id = ? and owner_id = ?
      union all select n.id, n.parent_id from nodes n join chain on n.id = chain.parent_id
    ) select id from chain where id = ?
  `).get(targetParentId, userId, folderId);
  if (rows) throw badRequest('A folder cannot be moved into its own subtree.');
}

export function moveNode(userId, nodeId, parentId) {
  const node = getNode(nodeId, userId);
  if (parentId) {
    const parent = getNode(parentId, userId);
    if (parent.kind !== 'folder') throw badRequest('Target is not a folder.');
  }
  if (node.kind === 'folder') assertNotDescendant(userId, node.id, parentId);
  const finalName = uniqueName(userId, parentId, node.name, node.id);
  db.update(n).set({ parentId: parentId || null, name: finalName, nameKey: nameKey(finalName), updatedAt: Date.now() }).where(eq(n.id, nodeId)).run();
  return toClient({ ...node, parentId: parentId || null, name: finalName });
}

export async function copyNode(userId, nodeId, parentId, copyName = null) {
  const node = getNode(nodeId, userId);
  rootList(userId, parentId);
  if (node.kind === 'folder') assertNotDescendant(userId, node.id, parentId);
  const finalName = uniqueName(userId, parentId, copyName || node.name);
  const newId = id();
  const now = Date.now();
  db.insert(n).values({
    ...node, id: newId, parentId: parentId || null, name: finalName, nameKey: nameKey(finalName),
    trashedAt: null, trashedFrom: null, createdAt: now, updatedAt: now,
  }).run();
  if (node.kind === 'folder') {
    const children = db.select().from(n).where(and(eq(n.parentId, node.id), isNull(n.trashedAt))).all();
    for (const child of children) await copyNode(userId, child.id, newId, child.name);
  }
  return { id: newId, name: finalName };
}

function descendantsOfMany(userId, folderIds) {
  const ids = [...new Set(folderIds.filter(Boolean))];
  if (!ids.length) return [];
  const found = new Map();
  for (let index = 0; index < ids.length; index += 400) {
    const chunk = ids.slice(index, index + 400);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = sqlite.prepare(`
      with recursive tree(id, parent_id) as (
        select id, parent_id from nodes
          where parent_id in (${placeholders}) and owner_id = ? and trashed_at is null
        union all
        select n.id, n.parent_id from nodes n join tree on n.parent_id = tree.id
          where n.owner_id = ? and n.trashed_at is null
      ) select id from tree
    `).all(...chunk, userId, userId);
    for (const row of rows) found.set(row.id, row);
  }
  return [...found.values()];
}

function chunkedUpdateTrash(userId, ids, stamp, trashedFrom) {
  for (let index = 0; index < ids.length; index += 500) {
    db.update(n).set({ trashedAt: stamp, trashedFrom })
      .where(and(eq(n.ownerId, userId), inArray(n.id, ids.slice(index, index + 500)))).run();
  }
}

/**
 * Verschiebt eine aufgelöste Auswahl in den Papierkorb. Ordnerinhalte werden
 * über eine rekursive Abfrage ermittelt und in Batches aktualisiert, statt
 * pro Element einen einzelnen Request/Update auszuführen.
 */
export function trashRows(userId, rows, stamp = Date.now()) {
  const topLevel = rows.filter((row) => row && !row.trashedAt);
  if (!topLevel.length) return { trashed: 0, stamp };
  const folders = topLevel.filter((row) => row.kind === 'folder').map((row) => row.id);
  const descendants = descendantsOfMany(userId, folders);
  const topIds = new Set(topLevel.map((row) => row.id));
  const allIds = [...new Set([...topLevel.map((row) => row.id), ...descendants.map((row) => row.id)])];
  const trashedFrom = topLevel.length === 1 ? topLevel[0].parentId : null;
  chunkedUpdateTrash(userId, allIds, stamp, trashedFrom);
  return { trashed: allIds.length, stamp, topLevel: topIds.size };
}

export async function trashNodes(userId, nodeIds) {
  return trashRows(userId, selectionRows(userId, { ids: nodeIds }));
}

export function trashSelection(userId, selection) {
  return trashRows(userId, selectionRows(userId, selection));
}

export function descendantsOf(userId, folderId) {
  return sqlite.prepare(`
    with recursive tree(id) as (
      select id from nodes where parent_id = ? and owner_id = ?
      union all select n.id from nodes n join tree on n.parent_id = tree.id where n.owner_id = ?
    ) select id from tree
  `).all(folderId, userId, userId);
}

export function restoreTrash(userId, stamp) {
  const rows = db.select().from(n).where(and(eq(n.ownerId, userId), eq(n.trashedAt, stamp))).all();
  if (!rows.length) throw notFound('Nothing to restore.');
  for (const row of rows) {
    const parent = row.parentId ? db.select().from(n).where(eq(n.id, row.parentId)).get() : null;
    const parentOk = parent && !parent.trashedAt;
    const finalParent = parentOk ? row.parentId : null;
    const finalName = uniqueName(userId, finalParent, row.name, row.id);
    db.update(n).set({ trashedAt: null, trashedFrom: null, parentId: finalParent, name: finalName, nameKey: nameKey(finalName), updatedAt: Date.now() }).where(eq(n.id, row.id)).run();
  }
  return rows.length;
}

export async function purgeTrash(userId, nodeIds = null) {
  const rows = nodeIds?.length
    ? db.select().from(n).where(and(eq(n.ownerId, userId), inArray(n.id, nodeIds))).all()
    : db.select().from(n).where(and(eq(n.ownerId, userId), sql`${n.trashedAt} is not null`)).all();
  let removed = 0;
  for (const row of rows) {
    if (row.kind === 'file' && row.hash) {
      const other = db.select({ id: n.id }).from(n).where(and(eq(n.hash, row.hash), ne(n.id, row.id))).get();
      if (!other) await removeObject(row.hash);
    }
    db.delete(n).where(eq(n.id, row.id)).run();
    await fsp.rm(path.join(paths.thumbs, row.id), { recursive: true, force: true }).catch(() => {});
    removed += 1;
  }
  return removed;
}

export async function purgeExpiredTrash(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - maxAgeMs;
  const rows = db.select().from(n).where(and(sql`${n.trashedAt} is not null`, sql`${n.trashedAt} < ${cutoff}`)).all();
  let removed = 0;
  for (const row of rows) {
    if (row.kind === 'file' && row.hash) {
      const other = db.select({ id: n.id }).from(n).where(and(eq(n.hash, row.hash), ne(n.id, row.id))).get();
      if (!other) await removeObject(row.hash);
    }
    db.delete(n).where(eq(n.id, row.id)).run();
    await fsp.rm(path.join(paths.thumbs, row.id), { recursive: true, force: true }).catch(() => {});
    removed += 1;
  }
  if (removed) console.log(`[trash] ${removed} item(s) older than ${Math.round(maxAgeMs / 86400000)} days purged.`);
  return removed;
}

export async function deleteForever(userId, nodeIds) {
  const rows = [];
  for (const nodeId of nodeIds) {
    const node = getNode(nodeId, userId, { includeTrashed: true });
    rows.push(node);
    if (node.kind === 'folder') {
      for (const d of descendantsOf(userId, node.id)) {
        rows.push(db.select().from(n).where(eq(n.id, d.id)).get());
      }
    }
  }
  return purgeTrash(userId, [...new Set(rows.filter(Boolean).map((r) => r.id))]);
}

export function resolvePath(userId, parts) {
  let parentId = null;
  for (const part of parts.filter(Boolean)) {
    const row = db.select().from(n).where(and(eq(n.ownerId, userId), eq(n.kind, 'folder'), eq(n.nameKey, nameKey(part)), isNull(n.trashedAt), parentId ? eq(n.parentId, parentId) : isNull(n.parentId))).get();
    if (!row) return null;
    parentId = row.id;
  }
  return parentId;
}

export function pathNode(userId, parts) {
  if (!parts.length) return null;
  const parentId = resolvePath(userId, parts.slice(0, -1));
  if (parentId === null && parts.length > 1) return null;
  return db.select().from(n).where(and(eq(n.ownerId, userId), eq(n.nameKey, nameKey(parts.at(-1))), isNull(n.trashedAt), parentId ? eq(n.parentId, parentId) : isNull(n.parentId))).get() || null;
}

export function toClient(row) {
  if (!row) return null;
  return {
    id: row.id,
    parentId: row.parentId,
    kind: row.kind,
    name: row.name,
    size: row.size,
    mime: row.mime,
    width: row.width,
    height: row.height,
    takenAt: row.takenAt,
    trashedAt: row.trashedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    thumbUrl: row.kind === 'file' && (isImage(row.mime) || row.mime === 'application/pdf') ? `/api/v1/files/${row.id}/thumbnail` : null,
    downloadUrl: row.kind === 'file' ? `/api/v1/files/${row.id}/download` : null,
    isImage: row.kind === 'file' && isImage(row.mime),
    isPdf: row.kind === 'file' && row.mime === 'application/pdf',
    isVideo: row.kind === 'file' && row.mime.startsWith('video/'),
  };
}

export function activity(userId, action, targetType, targetId, detail = null, ip = null) {
  db.insert(schema.activityLogs).values({ id: id(), userId, action, targetType, targetId, detail, ip, createdAt: Date.now() }).run();
}
