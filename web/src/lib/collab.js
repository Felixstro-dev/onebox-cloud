import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

const RECONNECT_DELAY = 1200;
const MAX_RECONNECT_DELAY = 15000;

/**
 * WebSocket-Provider für die gemeinsame Bearbeitung.
 *
 * Verbindungszustand: 'connecting' | 'connected' | 'offline' | 'denied'.
 * Meldet Anwesenheit (Name, Farbe, Cursor) über Yjs-Awareness.
 */
export class CollabProvider {
  constructor(docId, { doc = null, user, onStatus, onPeers } = {}) {
    this.docId = docId;
    this.user = user || { id: 'anonymous', name: 'Gast' };
    // Das Dokument wird vom Aufrufer gestellt, damit Editor und Provider
    // dasselbe CRDT teilen (sonst würde jede Seite getrennt schreiben).
    this.doc = doc || new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.onStatus = onStatus || (() => {});
    this.onPeers = onPeers || (() => {});
    this.ws = null;
    this.status = 'connecting';
    this.attempt = 0;
    this.closed = false;
    this.queue = [];
    this.reconnectTimer = null;

    // Lokale Änderungen an den Server senden.
    this.doc.on('update', (update, origin) => {
      if (origin === 'remote') return;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      this.send(encoding.toUint8Array(encoder));
    });

    this.awareness.on('update', ({ added, updated, removed }, origin) => {
      if (origin === 'remote') return;
      const changed = added.concat(updated, removed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed));
      this.send(encoding.toUint8Array(encoder));
    });

    this.awareness.on('change', () => this.emitPeers());

    // Eigene Anwesenheit setzen.
    this.awareness.setLocalState({
      user: {
        id: this.user.id,
        name: this.user.displayName || this.user.username || 'Gast',
        color: colorFor(this.user.id),
      },
      cursor: null,
    });
  }

  /** Verbindung aufbauen — erst nachdem Editor und Inhalt stehen. */
  start() {
    this.connect();
    return this;
  }

  setStatus(next) {
    if (this.status === next) return;
    this.status = next;
    this.onStatus(next, this);
  }

  emitPeers() {
    const peers = [];
    for (const [clientId, state] of this.awareness.getStates()) {
      if (clientId === this.doc.clientID) continue;
      if (!state?.user) continue;
      peers.push({ clientId, ...state.user, cursor: state.cursor || null });
    }
    this.onPeers(peers);
  }

  connect() {
    if (this.closed) return;
    this.setStatus(this.attempt === 0 ? 'connecting' : 'connecting');

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.host}/api/v1/collab?doc=${encodeURIComponent(this.docId)}`;

    let ws;
    try {
      ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.setStatus('connected');
      // SyncStep1 senden, damit wir den Serverstand erhalten.
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeSyncStep1(encoder, this.doc);
      ws.send(encoding.toUint8Array(encoder));
      // Eigene Anwesenheit sofort melden.
      const awareEncoder = encoding.createEncoder();
      encoding.writeVarUint(awareEncoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(awareEncoder, awarenessProtocol.encodeAwarenessUpdate(
        this.awareness, [this.doc.clientID],
      ));
      ws.send(encoding.toUint8Array(awareEncoder));
      // Wartende lokale Updates nachsenden.
      for (const pending of this.queue.splice(0)) ws.send(pending);
    };

    ws.onmessage = (event) => {
      try {
        this.handle(new Uint8Array(event.data));
      } catch {
        // Malformed frame ignorieren.
      }
    };

    ws.onclose = (event) => {
      if (this.closed) return;
      // 4403 = Zugriff entzogen (Server trennt bewusst).
      if (event.code === 4403 || event.code === 403) {
        this.setStatus('denied');
        return;
      }
      this.setStatus('offline');
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose folgt ohnehin.
    };
  }

  scheduleReconnect() {
    if (this.closed || this.reconnectTimer) return;
    this.attempt += 1;
    const delay = Math.min(RECONNECT_DELAY * 2 ** (this.attempt - 1), MAX_RECONNECT_DELAY);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
    this.reconnectTimer.unref?.();
  }

  send(payload) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(payload);
    } else {
      // Offline weiterschreiben: lokal halten, beim Wiederverbinden nachreichen.
      this.queue.push(payload);
      if (this.queue.length > 500) this.queue.splice(0, this.queue.length - 500);
    }
  }

  handle(data) {
    const decoder = decoding.createDecoder(data);
    const messageType = decoding.readVarUint(decoder);

    if (messageType === MESSAGE_SYNC) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      const syncType = decoding.readVarUint(decoder);

      if (syncType === syncProtocol.messageYjsSyncStep1) {
        syncProtocol.writeSyncStep2(encoder, this.doc, decoding.readVarUint8Array(decoder));
        this.ws?.send(encoding.toUint8Array(encoder));
      } else if (syncType === syncProtocol.messageYjsSyncStep2 || syncType === syncProtocol.messageYjsUpdate) {
        syncProtocol.readUpdate(decoder, this.doc, 'remote');
      }
    } else if (messageType === MESSAGE_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), 'remote');
    }
  }

  /** Cursor-Position für andere sichtbar machen (de-bounced vom Editor). */
  setCursor(range) {
    if (!range) return;
    this.awareness.setLocalStateField('cursor', range);
  }

  destroy() {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], 'destroy');
    try { this.ws?.close(); } catch {}
    // Das Dokument gehört dem Aufrufer — hier nur Awareness aufräumen.
    this.awareness.destroy();
  }
}

const PALETTE = ['#c9a26b', '#7fa8c9', '#8fbf9f', '#c98f9f', '#b79fd4', '#d4b06b', '#7fc4c4'];

export function colorFor(seed) {
  const text = String(seed || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
