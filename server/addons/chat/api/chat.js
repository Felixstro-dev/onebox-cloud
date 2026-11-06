import { realtime } from '../../../services/realtime.js';

let messages = [];

export async function getMessages() {
  // Return last 50 messages, sorted by creation time descending
  const sorted = [...messages].sort((a, b) => b.createdAt - a.createdAt);
  return { messages: sorted.slice(0, 50) };
}

export async function addMessage({ text, user = 'me', displayName = 'Unbekannt' }) {
  const now = Date.now();
  const message = { id: `${now}-${Math.random().toString(36).slice(2, 8)}`, text, user, displayName, createdAt: now };
  messages.unshift(message);
  realtime.broadcast({ type: 'chat.message', message });
  return { success: true, id: message.id, message };
}