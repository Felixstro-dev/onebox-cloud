let messages = [];

export async function getMessages() {
  // Return last 50 messages, sorted by creation time descending
  const sorted = [...messages].sort((a, b) => b.createdAt - a.createdAt);
  return { messages: sorted.slice(0, 50) };
}

export async function addMessage({ text, user = 'me' }) {
  const now = Date.now();
  const message = { id: Date.now(), text, user, createdAt: now };
  messages.unshift(message);
  return { success: true, id: message.id, message };
}