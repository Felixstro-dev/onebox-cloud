let socket = null;
let reconnectTimer = null;
let stopped = false;
const listeners = new Set();
const seen = new Set();

function connect() {
  if (stopped || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  try {
    socket = new WebSocket(`${protocol}://${window.location.host}/api/v1/ws`);
  } catch {
    scheduleReconnect();
    return;
  }

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      const message = payload.message;
      if (payload.type !== 'chat.message' || !message?.id || seen.has(message.id)) return;

      seen.add(message.id);
      if (seen.size > 200) seen.delete(seen.values().next().value);
      listeners.forEach((listener) => listener(message));

      if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
        const title = message.displayName || 'Neue Chat-Nachricht';
        const body = String(message.text || '').slice(0, 140);
        navigator.serviceWorker?.ready.then((registration) => registration.showNotification(title, {
          body,
          tag: `chat-${message.id}`,
          data: { url: '/chat' },
        })).catch(() => {
          try { new Notification(title, { body, tag: `chat-${message.id}` }); } catch {}
        });
      }
    } catch {}
  };

  socket.onclose = scheduleReconnect;
  socket.onerror = () => socket.close();
}

function scheduleReconnect() {
  socket = null;
  if (stopped || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 2500);
}

export function startChatRealtime() {
  stopped = false;
  connect();
}

export function stopChatRealtime() {
  stopped = true;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  socket?.close();
  socket = null;
}

export function subscribeChat(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function rememberChatMessage(message) {
  if (message?.id) seen.add(message.id);
}

export async function requestChatNotifications() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.requestPermission();
}
