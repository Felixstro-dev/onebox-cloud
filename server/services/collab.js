import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { getDocumentRow, isDocMime } from './documents.js';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

const MAX_UPDATE_BYTES = 256 * 1024;      // pro Update
const MAX_MESSAGES_PER_WINDOW = 240;      // pro Verbindung
const WINDOW_MS = 10_000;
const PERSIST_DELAY = 1_500;              // Schreibruhe vor dem Wegschreiben
const AWARENESS_TIMEOUT = 30_000;

/**
 * Ein Dokument-Raum: hält den Yjs-Zustand für eine .md-Datei,
 * prüft pro Nachricht die Berechtigung und verdichtet regelmäßig
 * zu einem Stand in SQLite.
 */
class Room {
  constructor(nodeId) {
    this.nodeId = nodeId;
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.awareness.setLocalState(null);
    this.clients = new Set();
    this.persistTimer = null;
    this.dirty = false;
    this.load();

    // Regelmäßig prüfen, ob ein Teilnehmer noch Zugriff hat — entzogener
    // Zugriff schließt die Verbindung auch bei untätigen Clients.
    this.permissionTimer = setInterval(() => {
      for (const client of [...this.clients]) {
        if (!this.permission(client).view) {
          try { client.close(4403, 'Access revoked'); } catch {}
        }
      }
    }, 2000);
    this.permissionTimer.unref?.();

    // Änderungen vom lokalen Doc (d. h. von einem Client) an alle weitergeben.
    this.doc.on('update', (update, origin) => {
      this.dirty = true;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      const payload = encoding.toUint8Array(encoder);
      for (const client of this.clients) {
        if (client !== origin && client.readyState === 1) client.send(payload);
      }
      this.schedulePersist();
    });

    this.awareness.on('update', ({ added, updated, removed }, origin) => {
      const changed = added.concat(updated, removed);
      const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(encoder, update);
      const payload = encoding.toUint8Array(encoder);
      for (const client of this.clients) {
        if (client !== origin && client.readyState === 1) client.send(payload);
      }
    });
  }

  load() {
    const row = getDocumentRow(this.nodeId);
    if (row?.ystate) {
      try {
        Y.applyUpdate(this.doc, Buffer.from(row.ystate, 'base64'), 'load');
      } catch {
        // Beschädigter Zustand: leer starten statt den Server zu blockieren.
      }
    }
  }

  schedulePersist() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persist();
    }, PERSIST_DELAY);
    this.persistTimer.unref?.();
  }

  persist() {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      const state = Buffer.from(Y.encodeStateAsUpdate(this.doc)).toString('base64');
      db.update(schema.documents)
        .set({ ystate: state, updatedAt: Date.now() })
        .where(eq(schema.documents.nodeId, this.nodeId))
        .run();
    } catch {
      // Nächster Durchlauf versucht es erneut.
    }
  }

  join(client) {
    this.clients.add(client);
    client._messages = 0;
    client._windowStart = Date.now();

    // SyncStep1 + Awareness-Initialzustand senden.
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(
      this.awareness,
      [...this.awareness.getStates().keys()],
    ));
    client.send(encoding.toUint8Array(encoder));
  }

  leave(client) {
    this.clients.delete(client);
    if (client._awarenessId !== undefined) {
      awarenessProtocol.removeAwarenessStates(this.awareness, [client._awarenessId], null);
    }
    if (!this.clients.size) {
      if (this.permissionTimer) { clearInterval(this.permissionTimer); this.permissionTimer = null; }
      this.persist();
    }
  }

  /** Prüft pro Nachricht: darf dieser Nutzer dieses Dokument noch sehen/schreiben? */
  permission(client) {
    const user = client._user;
    if (!user) return { view: false, write: false };
    let node;
    try {
      node = db.select().from(schema.nodes).where(eq(schema.nodes.id, this.nodeId)).get();
    } catch {
      return { view: false, write: false };
    }
    if (!node || node.trashedAt) return { view: false, write: false };
    if (node.ownerId === user.id) return { view: true, write: true };
    const shares = db.select().from(schema.shares).where(eq(schema.shares.nodeId, this.nodeId)).all();
    // Mindestens eine aktive (nicht widerrufene, nicht abgelaufene) Freigabe reicht.
    const active = shares.find((share) =>
      !share.revokedAt && (!share.expiresAt || share.expiresAt >= Date.now()));
    if (!active) return { view: false, write: false };
    return { view: true, write: false };
  }

  rateLimited(client) {
    const now = Date.now();
    if (now - client._windowStart > WINDOW_MS) {
      client._windowStart = now;
      client._messages = 0;
    }
    client._messages += 1;
    return client._messages > MAX_MESSAGES_PER_WINDOW;
  }

  handleMessage(client, data) {
    if (this.rateLimited(client)) return;

    const perm = this.permission(client);
    if (!perm.view) {
      // Entzug des Zugangs: sofort trennen.
      try { client.close(4403, 'Access revoked'); } catch {}
      return;
    }

    try {
      const decoder = decoding.createDecoder(data);
      const messageType = decoding.readVarUint(decoder);

      if (messageType === MESSAGE_SYNC) {
        const syncType = decoding.readVarUint(decoder);
        if (syncType === syncProtocol.messageYjsSyncStep1) {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, MESSAGE_SYNC);
          syncProtocol.writeSyncStep2(encoder, this.doc, decoding.readVarUint8Array(decoder));
          // Gegenanfrage, damit der Client seinen Stand nachreicht.
          encoding.writeVarUint(encoder, MESSAGE_SYNC);
          syncProtocol.writeSyncStep1(encoder, this.doc);
          client.send(encoding.toUint8Array(encoder));
        } else if (syncType === syncProtocol.messageYjsSyncStep2 || syncType === syncProtocol.messageYjsUpdate) {
          if (!perm.write) return; // Lesende dürfen nichts einbringen — auch nicht per manipulierter Nachricht.
          const update = decoding.readVarUint8Array(decoder);
          if (update.byteLength > MAX_UPDATE_BYTES) return;
          Y.applyUpdate(this.doc, update, client);
        }
      } else if (messageType === MESSAGE_AWARENESS) {
        const update = decoding.readVarUint8Array(decoder);
        if (update.byteLength > MAX_UPDATE_BYTES) return;
        awarenessProtocol.applyAwarenessUpdate(this.awareness, update, client);
      }
    } catch {
      // Malformed frame: ignorieren, Verbindung offen lassen.
    }
  }
}

class Collab {
  constructor() {
    this.rooms = new Map();
    this.timer = setInterval(() => this.reap(), 30_000);
    this.timer.unref?.();
  }

  room(nodeId) {
    let room = this.rooms.get(nodeId);
    if (!room) {
      room = new Room(nodeId);
      this.rooms.set(nodeId, room);
    }
    return room;
  }

  reap() {
    for (const [nodeId, room] of this.rooms) {
      room.persist();
      if (!room.clients.size) {
        room.doc.destroy();
        this.rooms.delete(nodeId);
      }
    }
  }

  close() {
    for (const room of this.rooms.values()) room.persist();
    clearInterval(this.timer);
  }
}

export const collab = new Collab();

/**
 * Registriert den Kollaborations-Endpunkt als echten Fastify-WebSocket-Route.
 *
 * Über `@fastify/websocket` laufen alle Upgrade-Anfragen ohnehin durch den
 * Fastify-Router — ein eigener `server.on('upgrade')`-Listener würde dieselbe
 * Socket zweimal behandeln („Reply was already sent"). Hier erledigt Fastify
 * den Handshake, wir prüfen davor Anmeldung und Berechtigung.
 *
 * `authenticate(request)` liefert das eingeloggte Nutzerobjekt oder null.
 */
export function registerCollabRoute(app, authenticate) {
  const guard = (request, reply, done) => {
    const url = new URL(request.url, 'http://localhost');
    const nodeId = url.searchParams.get('doc');
    if (!nodeId || !/^[a-z0-9-]{1,64}$/i.test(nodeId)) {
      reply.code(400).send({ error: { code: 'bad_request', message: 'Missing document id.' } });
      return;
    }
    const user = authenticate(request);
    if (!user) {
      reply.code(401).send({ error: { code: 'unauthorized', message: 'Sign in required.' } });
      return;
    }
    const room = collab.room(nodeId);
    if (!room.permission({ _user: user, readyState: 1 }).view) {
      reply.code(403).send({ error: { code: 'forbidden', message: 'No access to this document.' } });
      return;
    }
    request.collab = { room, user, nodeId };
    done();
  };

  app.get('/api/v1/collab', { websocket: true, onRequest: [guard] }, (socket, request) => {
    const { room, user } = request.collab;
    socket._user = user;
    socket._roomId = request.collab.nodeId;
    socket._windowStart = Date.now();
    socket._messages = 0;
    room.join(socket);
    socket.on('message', (raw) => room.handleMessage(socket, new Uint8Array(raw)));
    socket.on('close', () => room.leave(socket));
    socket.on('error', () => room.leave(socket));
  });
}
