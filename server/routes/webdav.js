import fsp from 'node:fs/promises';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { badRequest, notFound, unauthorized } from '../lib/errors.js';
import { getNode, resolvePath, uniqueName, moveNode, createFolder, trashNodes, toClient } from '../services/nodes.js';
import { hashToken } from '../lib/ids.js';
import { hashPassword, verifyPassword, rateLimit } from '../services/auth.js';
import { commitObject, objectPath, tempPath } from '../services/storage.js';
import { safeInlineMime } from '../lib/names.js';
import { sendFile } from './files.js';

function basicUser(req) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Basic ')) return null;
  const decoded = Buffer.from(header.slice(6), 'base64').toString();
  const index = decoded.indexOf(':');
  if (index < 0) return null;
  return { username: decoded.slice(0, index), password: decoded.slice(index + 1) };
}

async function davUser(req) {
  const credentials = basicUser(req);
  if (!credentials) throw unauthorized('WebDAV needs a username and password.');
  const key = `dav:${req.ip}:${credentials.username}`;
  if (!rateLimit(key, { max: 20, windowMs: 60000 })) throw unauthorized('Too many attempts.');
  const rows = db.select().from(schema.users).all();
  const user = rows.find((row) => row.username.toLowerCase() === credentials.username.toLowerCase());
  if (!user || user.disabled || !(await verifyPassword(user.passwordHash, credentials.password))) throw unauthorized('WebDAV credentials are wrong.');
  return user;
}

function partsOf(req) {
  return req.url.split('?')[0].split('/').filter(Boolean).slice(1).map((part) => decodeURIComponent(part));
}

function href(parts, isFolder = false) {
  return `/dav/${parts.map((part) => encodeURIComponent(part)).join('/')}${isFolder ? '/' : ''}`;
}

function xmlEscape(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function entryXml(node, nodeParts) {
  const folder = node.kind === 'folder';
  return `<D:response><D:href>${xmlEscape(href(nodeParts, folder))}</D:href><D:propstat><D:prop>`
    + `<D:displayname>${xmlEscape(node.name)}</D:displayname>`
    + (folder ? '<D:resourcetype><D:collection/></D:resourcetype><D:getcontenttype>inode/directory</D:getcontenttype>' : `<D:resourcetype/><D:getcontentlength>${node.size}</D:getcontentlength><D:getcontenttype>${xmlEscape(node.mime)}</D:getcontenttype>`)
    + `<D:getlastmodified>${new Date(node.updatedAt).toUTCString()}</D:getlastmodified>`
    + `<D:creationdate>${new Date(node.createdAt).toISOString()}</D:creationdate>`
    + '</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>';
}

function nodeAt(user, parts) {
  if (!parts.length) return null;
  const parentId = resolvePath(user.id, parts.slice(0, -1));
  if (parentId === null && parts.length > 1) return null;
  const nameKey = parts.at(-1).toLocaleLowerCase('de');
  return db.select().from(schema.nodes).where(and(
    eq(schema.nodes.ownerId, user.id),
    eq(schema.nodes.nameKey, nameKey),
    isNull(schema.nodes.trashedAt),
    parentId ? eq(schema.nodes.parentId, parentId) : isNull(schema.nodes.parentId),
  )).get() || null;
}

function folderAt(user, parts) {
  return parts.length ? resolvePath(user.id, parts) : null;
}

export async function registerWebdavRoutes(app) {
  for (const [method, hasBody] of [['PROPFIND', true], ['PROPPATCH', true], ['MKCOL', false], ['MOVE', false], ['COPY', false], ['LOCK', true], ['UNLOCK', false]]) {
    if (!app.supportedMethods[method.toLowerCase()]) app.addHttpMethod(method, { hasBody });
  }
  const route = (method, handler) => {
    app.route({ method, url: '/dav/*', handler });
    app.route({ method, url: '/dav', handler });
  };

  app.options('/dav/*', async (req, reply) => {
    reply.header('DAV', '1, 2');
    reply.header('Allow', 'OPTIONS, GET, HEAD, PUT, PROPFIND, MKCOL, DELETE, MOVE, COPY, PROPPATCH, LOCK, UNLOCK');
    reply.header('MS-Author-Via', 'DAV');
    return reply.status(200).send();
  });

  app.options('/dav', async (req, reply) => {
    reply.header('DAV', '1, 2');
    reply.header('Allow', 'OPTIONS, GET, HEAD, PUT, PROPFIND, MKCOL, DELETE, MOVE, COPY, PROPPATCH, LOCK, UNLOCK');
    reply.header('MS-Author-Via', 'DAV');
    return reply.status(200).send();
  });

  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/dav')) return;
    reply.header('DAV', '1, 2');
    reply.header('MS-Author-Via', 'DAV');
    reply.header('WWW-Authenticate', 'Basic realm="Onebox WebDAV", charset="UTF-8"');
  });

  route('PROPFIND', async (req, reply) => {
    const user = await davUser(req);
    const parts = partsOf(req);
    let node = null;
    if (parts.length) {
      node = nodeAt(user, parts);
      if (!node) throw notFound('Path not found.');
    }
    const depth = String(req.headers.depth || '1');
    const entries = [];
    if (!node) {
      const roots = db.select().from(schema.nodes).where(and(eq(schema.nodes.ownerId, user.id), isNull(schema.nodes.parentId), isNull(schema.nodes.trashedAt))).all();
      entries.push(...roots.flatMap((row) => depth === '0' ? [] : [entryXml(row, [row.name])]));
    } else {
      entries.push(entryXml(node, parts));
      if (node.kind === 'folder' && depth !== '0') {
        const children = db.select().from(schema.nodes).where(and(eq(schema.nodes.ownerId, user.id), eq(schema.nodes.parentId, node.id), isNull(schema.nodes.trashedAt))).all();
        entries.push(...children.map((row) => entryXml(row, [...parts, row.name])));
      }
    }
    const xml = `<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:">${entries.join('')}</D:multistatus>`;
    reply.status(207).type('application/xml; charset=utf-8');
    return reply.send(xml);
  });

  app.get('/dav/*', { exposeHeadRoute: false }, async (req, reply) => {
    const user = await davUser(req);
    const parts = partsOf(req);
    const node = nodeAt(user, parts);
    if (!node) throw notFound('Path not found.');
    if (node.kind === 'folder') return reply.status(405).send('This is a folder.');
    return sendFile(reply, node, { rangeHeader: req.headers.range });
  });

  app.head('/dav/*', async (req, reply) => {
    const user = await davUser(req);
    const node = nodeAt(user, partsOf(req));
    if (!node) throw notFound('Path not found.');
    if (node.kind === 'folder') return reply.status(405).send();
    reply.header('Content-Length', node.size);
    reply.header('Content-Type', node.mime);
    return reply.send();
  });

  app.put('/dav/*', async (req, reply) => {
    const user = await davUser(req);
    const parts = partsOf(req);
    if (!parts.length) throw badRequest('WebDAV cannot replace the root.');
    const parentId = resolvePath(user.id, parts.slice(0, -1));
    if (parentId === null && parts.length > 1) throw notFound('Parent folder not found.');
    const existing = nodeAt(user, parts);
    if (!req.body || typeof req.body.pipe !== 'function') throw badRequest('Expected a request body.');
    const temp = tempPath(`dav-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const { createWriteStream } = await import('node:fs');
    const { pipeline } = await import('node:stream/promises');
    await pipeline(req.body, createWriteStream(temp));
    const stat = await fsp.stat(temp);
    const hash = await commitObject(temp);
    if (existing) {
      if (existing.kind === 'folder') throw badRequest('Path is a folder.');
      db.update(schema.nodes).set({ hash, objectKey: hash, size: stat.size, mime: String(req.headers['content-type'] || existing.mime), updatedAt: Date.now() }).where(eq(schema.nodes.id, existing.id)).run();
      return reply.status(204).send();
    }
    const name = parts.at(-1);
    const finalName = uniqueName(user.id, parentId, name);
    db.insert(schema.nodes).values({
      id: (await import('../lib/ids.js')).id(), ownerId: user.id, parentId, kind: 'file', name: finalName,
      nameKey: finalName.toLocaleLowerCase('de'), size: stat.size, mime: String(req.headers['content-type'] || 'application/octet-stream'),
      hash, objectKey: hash, createdAt: Date.now(), updatedAt: Date.now(),
    }).run();
    return reply.status(201).send();
  });

  route('MKCOL', async (req, reply) => {
    const user = await davUser(req);
    const parts = partsOf(req);
    if (!parts.length) throw badRequest('Root exists.');
    const parent = parts.length > 1 ? resolvePath(user.id, parts.slice(0, -1)) : null;
    if (parts.length > 1 && parent === null) throw notFound('Parent folder not found.');
    if (nodeAt(user, parts)) throw badRequest('Path already exists.');
    createFolder(user.id, parent, parts.at(-1));
    return reply.status(201).send();
  });

  app.delete('/dav/*', async (req, reply) => {
    const user = await davUser(req);
    const node = nodeAt(user, partsOf(req));
    if (!node) throw notFound('Path not found.');
    await trashNodes(user.id, [node.id]);
    return reply.status(204).send();
  });

  route('MOVE', async (req, reply) => {
    const user = await davUser(req);
    const source = nodeAt(user, partsOf(req));
    if (!source) throw notFound('Path not found.');
    const destination = String(req.headers.destination || '');
    if (!destination) throw badRequest('Destination header is missing.');
    const pathname = new URL(destination, 'http://local').pathname;
    if (!pathname.startsWith('/dav/')) throw badRequest('Destination must stay inside /dav.');
    const parts = pathname.split('/').filter(Boolean).slice(1).map((part) => decodeURIComponent(part));
    if (!parts.length) throw badRequest('Destination path is empty.');
    const parentId = resolvePath(user.id, parts.slice(0, -1));
    if (parentId === null && parts.length > 1) throw notFound('Destination folder not found.');
    const existing = nodeAt(user, parts);
    if (existing) {
      if (req.headers.overwrite !== 'T') return reply.status(412).send();
      await trashNodes(user.id, [existing.id]);
    }
    moveNode(user.id, source.id, parentId);
    return reply.status(existing ? 204 : 201).send();
  });

  route('COPY', async (req, reply) => {
    const user = await davUser(req);
    const source = nodeAt(user, partsOf(req));
    if (!source) throw notFound('Path not found.');
    const destination = new URL(String(req.headers.destination || ''), 'http://local').pathname;
    const parts = destination.split('/').filter(Boolean).slice(1).map((part) => decodeURIComponent(part));
    const parentId = resolvePath(user.id, parts.slice(0, -1));
    const { copyNode } = await import('../services/nodes.js');
    await copyNode(user.id, source.id, parentId, parts.at(-1));
    return reply.status(201).send();
  });

  route('PROPPATCH', async (req, reply) => {
    await davUser(req);
    reply.status(207).type('application/xml');
    return reply.send('<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:"><D:response><D:href>' + xmlEscape(req.url) + '</D:href><D:propstat><D:prop/><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>');
  });

  route('LOCK', async (req, reply) => {
    await davUser(req);
    reply.status(200).type('application/xml');
    return reply.send('<?xml version="1.0" encoding="utf-8"?><D:prop xmlns:D="DAV:"><D:lockdiscovery><D:activelock><D:locktype><D:write/></D:locktype><D:lockscope><D:exclusive/></D:lockscope><D:locktoken><D:href>opaquelocktoken:onebox</D:href></D:locktoken><D:timeout>Second-3600</D:timeout></D:activelock></D:lockdiscovery></D:prop>');
  });

  route('UNLOCK', async (req, reply) => {
    await davUser(req);
    return reply.status(204).send();
  });
}
