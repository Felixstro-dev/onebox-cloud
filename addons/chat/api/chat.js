export async function getMessages() {
  return { messages: [], error: 'Chat not configured' };
}

export async function addMessage({ text, user }) {
  return { success: false, error: 'Chat not configured' };
}