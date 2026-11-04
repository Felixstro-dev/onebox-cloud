import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { id } from '../lib/ids.js';
import { realtime } from './realtime.js';

/**
 * Speichert eine Benachrichtigung und stellt sie über den bestehenden
 * WebSocket (realtime) sofort zustellen.
 *
 * Erwähnte Personen ohne Zugriff auf das Dokument bekommen bewusst
 * keinen Inhalts-Text — nur den Hinweis, dass sie erwähnt wurden.
 */
export function notifyMentions({ node, comment = null, actor, mentions = [], kind = 'mention', text = null }) {
  const targets = [...new Set((mentions || []).filter((userId) => userId && userId !== actor.id))];
  if (!targets.length) return [];

  const created = [];
  for (const userId of targets) {
    // Berechtigung prüfen: nur wer das Dokument sehen darf, bekommt Details.
    const allowed = canSee(node, userId);
    const payload = {
      type: 'notification',
      kind,
      id: id(),
      nodeId: node.id,
      nodeName: node.name,
      actorId: actor.id,
      actorName: actor.displayName || actor.username,
      // Ohne Zugriff: kein Name, kein Inhalt, kein Ort.
      allowed,
      text: allowed
        ? (text || (comment ? comment.body : ''))
        : 'Eine Person ohne Zugriff wurde erwähnt.',
      at: Date.now(),
    };

    db.insert(schema.notifications).values({
      id: payload.id,
      userId,
      kind,
      nodeId: node.id,
      actorId: actor.id,
      body: JSON.stringify(payload),
      readAt: null,
      createdAt: payload.at,
    }).run();

    realtime.send(userId, payload);
    created.push(payload.id);
  }
  return created;
}

function canSee(node, userId) {
  if (node.ownerId === userId) return true;
  const share = db.select().from(schema.shares).where(eq(schema.shares.nodeId, node.id)).get();
  return !!share && !share.revokedAt;
}

export function listNotifications(userId, { limit = 50, unreadOnly = false } = {}) {
  const rows = db.select().from(schema.notifications)
    .where(unreadOnly ? eq(schema.notifications.userId, userId) : eq(schema.notifications.userId, userId))
    .orderBy(schema.notifications.createdAt)
    .limit(limit)
    .all()
    .reverse();
  return rows.map((row) => ({ ...JSON.parse(row.body), readAt: row.readAt }));
}

export function markRead(userId, notificationId = null) {
  if (notificationId) {
    db.update(schema.notifications).set({ readAt: Date.now() })
      .where(eq(schema.notifications.id, notificationId)).run();
    return;
  }
  db.update(schema.notifications).set({ readAt: Date.now() })
    .where(eq(schema.notifications.userId, userId)).run();
}
