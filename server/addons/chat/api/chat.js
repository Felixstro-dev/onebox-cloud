
import { and, asc, eq } from 'drizzle-orm';
import { db, schema } from '../../../db/index.js';
import { id } from '../../../lib/ids.js';
import { realtime } from '../../../services/realtime.js';

function memberOfGroup(groupId, userId) {
  return Boolean(db.select().from(schema.groupMembers)
    .where(and(eq(schema.groupMembers.groupId, groupId), eq(schema.groupMembers.userId, userId))).get());
}

function privateScope(userA, userB) {
  return [userA, userB].sort().join(':');
}

function userView(user) {
  return { id: user.id, username: user.username, displayName: user.displayName };
}

export function listConversations(userId) {
  const users = db.select().from(schema.users).where(eq(schema.users.disabled, false)).orderBy(asc(schema.users.displayName)).all()
    .filter((user) => user.id !== userId).map(userView);
  const groups = db.select({ group: schema.groups }).from(schema.groups)
    .innerJoin(schema.groupMembers, eq(schema.groupMembers.groupId, schema.groups.id))
    .where(eq(schema.groupMembers.userId, userId)).all()
    .map(({ group }) => ({ id: group.id, name: group.name }));
  return { users, groups };
}

export function createGroup({ name, userId, memberIds = [] }) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('Gruppenname ist leer.');
  const groupId = id();
  const members = [...new Set([userId, ...memberIds])];
  db.transaction((tx) => {
    tx.insert(schema.groups).values({ id: groupId, name: cleanName, createdAt: Date.now() }).run();
    tx.insert(schema.groupMembers).values(members.map((memberId) => ({ groupId, userId: memberId }))).run();
  });
  return { id: groupId, name: cleanName };
}

function assertScope(userId, scope, scopeId) {
  if (scope === 'global') return 'global';
  if (scope === 'private') {
    const participants = String(scopeId || '').split(':');
    if (participants.length !== 2 || !participants.includes(userId)) throw new Error('Privater Chat ist nicht verfügbar.');
    return privateScope(participants[0], participants[1]);
  }
  if (scope === 'group' && memberOfGroup(scopeId, userId)) return String(scopeId);
  throw new Error('Chat-Gruppe ist nicht verfügbar.');
}

export async function getMessages({ userId, scope = 'global', scopeId = 'global' }) {
  const normalizedId = assertScope(userId, scope, scopeId);
  const rows = db.select({ message: schema.chatMessages, user: schema.users })
    .from(schema.chatMessages)
    .innerJoin(schema.users, eq(schema.users.id, schema.chatMessages.userId))
    .where(and(eq(schema.chatMessages.scope, scope), eq(schema.chatMessages.scopeId, normalizedId)))
    .orderBy(asc(schema.chatMessages.createdAt)).all();
  return { messages: rows.slice(-100).map(({ message, user }) => ({
    id: message.id, text: message.text, user: message.userId, displayName: user.displayName, createdAt: message.createdAt,
  })) };
}

export async function addMessage({ text, userId, displayName, scope = 'global', scopeId = 'global' }) {
  const normalizedId = assertScope(userId, scope, scopeId);
  const message = { id: id(), scope, scopeId: normalizedId, userId, text: String(text).trim(), createdAt: Date.now() };
  db.insert(schema.chatMessages).values(message).run();
  const view = { id: message.id, text: message.text, user: userId, displayName, createdAt: message.createdAt, scope, scopeId: normalizedId };
  realtime.broadcast({ type: 'chat.message', message: view });
  return { success: true, message: view };
}