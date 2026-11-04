import { WebSocketServer } from 'ws';
import { sessionUser } from './auth.js';

class Realtime {
  constructor() {
    this.clients = new Set();
    this.wss = null;
  }

  attach(app) {
    this.wss = new WebSocketServer({ noServer: true });
    // Pfade, die andere Handler (z. B. die Dokument-Kollaboration) übernehmen.
    this.delegates = new Set(['/api/v1/collab']);
    app.server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url, 'http://localhost');
      if (this.delegates.has(url.pathname)) return; // von einem anderen Listener behandelt
      if (url.pathname !== '/api/v1/ws') {
        socket.destroy();
        return;
      }
      const cookies = Object.fromEntries((request.headers.cookie || '').split(';').map((part) => {
        const [key, ...rest] = part.trim().split('=');
        return [key, rest.join('=')];
      }));
      const user = sessionUser({ cookies, ip: request.socket.remoteAddress });
      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        ws.userId = user.id;
        this.wss.emit('connection', ws, request);
      });
    });
    this.wss.on('connection', (ws) => {
      ws.isAlive = true;
      this.clients.add(ws);
      ws.on('pong', () => { ws.isAlive = true; });
      ws.on('close', () => this.clients.delete(ws));
      ws.send(JSON.stringify({ type: 'hello' }));
    });
    const timer = setInterval(() => {
      for (const ws of this.clients) {
        if (!ws.isAlive) {
          ws.terminate();
          this.clients.delete(ws);
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }, 30000);
    timer.unref?.();
  }

  send(userId, payload) {
    const data = JSON.stringify(payload);
    for (const ws of this.clients) {
      if (ws.readyState === 1 && (!userId || ws.userId === userId)) ws.send(data);
    }
  }

  broadcast(payload) {
    this.send(null, payload);
  }

  close() {
    for (const ws of this.clients) ws.close();
    this.wss?.close();
  }
}

export const realtime = new Realtime();
