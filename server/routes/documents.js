import { desc, eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireUser } from '../services/auth.js';
import { getNode, toClient, activity, breadcrumbs } from '../services/nodes.js';
import {
  assertDocument, createDocument, createComment, deleteComment, ensureDocument,
  getDocumentRow, getVersion, isDocMime, listComments, listVersions, readDocumentContent,
  restoreVersion, setStatus, updateComment, writeDocumentContent, canViewDocument,
} from '../services/documents.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { docDiff } from '../services/docdiff.js';
import { notifyMentions } from '../services/notifications.js';

const DOC_TYPES = ['application/json'];

function bodySchema(properties, required = []) {
  return { body: { type: 'object', required, properties } };
}

export async function registerDocumentRoutes(app) {
  // Liste aller Dokumente des Nutzers (für die Dokumenten-Übersicht).
  app.get('/api/v1/docs', async (req) => {
    const user = requireUser(req);
    const rows = db.select({ node: schema.nodes, doc: schema.documents })
      .from(schema.nodes)
      .leftJoin(schema.documents, eq(schema.documents.nodeId, schema.nodes.id))
      .where(eq(schema.nodes.ownerId, user.id))
      .orderBy(desc(schema.nodes.updatedAt))
      .limit(300)
      .all()
      .filter((row) => row.node.kind === 'file' && !row.node.trashedAt && isDocMime(row.node.mime, row.node.name));
    return {
      items: rows.map((row) => ({
        ...toClient(row.node),
        status: row.doc?.status || 'draft',
        reviewBy: row.doc?.reviewBy || null,
        revision: row.doc?.revision || 0,
      })),
    };
  });

  // Neues Dokument anlegen (echte .md-Datei im Baum).
  app.post('/api/v1/docs', bodySchema({
    name: { type: 'string', minLength: 1, maxLength: 255 },
    parentId: { type: ['string', 'null'] },
  }, ['name']), async (req) => {
    const user = requireUser(req);
    const node = await createDocument({ user, parentId: req.body.parentId || null, name: req.body.name });
    activity(user.id, 'doc.create', 'node', node.id, node.name, req.ip);
    return { node };
  });

  // Dokument öffnen: Metadaten + Markdown-Inhalt.
  app.get('/api/v1/docs/:id', async (req) => {
    const user = requireUser(req);
    const node = getNode(req.params.id, user.id);
    assertDocument(node, user.id);
    const doc = ensureDocument(node.id, user.id);
    return {
      node: toClient(node),
      content: readDocumentContent(node),
      status: doc.status,
      reviewBy: doc.reviewBy,
      revision: doc.revision,
      breadcrumbs: node.parentId ? breadcrumbs(user.id, node.parentId) : [],
      // Nur der Eigentümer darf schreiben; Freigabe-Empfänger lesen mit.
      readOnly: node.ownerId !== user.id,
      ystate: doc.ystate || null,
    };
  });

  // Inhalt speichern (verzögert vom Editor ausgelöst, nach 2 s Ruhe).
  app.patch('/api/v1/docs/:id/content', bodySchema({
    content: { type: 'string', maxLength: 8 * 1024 * 1024 },
    snapshot: { type: 'boolean' },
    label: { type: ['string', 'null'] },
  }, ['content']), async (req) => {
    const user = requireUser(req);
    const node = getNode(req.params.id, user.id);
    assertDocument(node, user.id);
    const result = await writeDocumentContent({
      node,
      userId: user.id,
      content: req.body.content,
      forceSnapshot: !!req.body.snapshot,
      label: req.body.label || null,
    });
    if (result.changed) activity(user.id, 'doc.save', 'node', node.id, node.name, req.ip);
    return result;
  });

  // Versionen auflisten.
  app.get('/api/v1/docs/:id/versions', async (req) => {
    const user = requireUser(req);
    const node = getNode(req.params.id, user.id);
    assertDocument(node, user.id);
    return { items: listVersions(node.id) };
  });

  // Benannte Version anlegen.
  app.post('/api/v1/docs/:id/versions', bodySchema({
    label: { type: 'string', minLength: 1, maxLength: 120 },
  }, ['label']), async (req) => {
    const user = requireUser(req);
    const node = getNode(req.params.id, user.id);
    assertDocument(node, user.id);
    const content = readDocumentContent(node);
    const result = await writeDocumentContent({
      node, userId: user.id, content, forceSnapshot: true, label: req.body.label,
    });
    activity(user.id, 'doc.version', 'node', node.id, req.body.label, req.ip);
    return result;
  });

  // Einzelne Version lesen.
  app.get('/api/v1/docs/:id/versions/:versionId', async (req) => {
    const user = requireUser(req);
    const node = getNode(req.params.id, user.id);
    assertDocument(node, user.id);
    const version = getVersion(node.id, req.params.versionId);
    return { version: { id: version.id, label: version.label, kind: version.kind, authorId: version.authorId, createdAt: version.createdAt, content: version.content } };
  });

  // Version wiederherstellen (erzeugt eine neue Version).
  app.post('/api/v1/docs/:id/versions/:versionId/restore', async (req) => {
    const user = requireUser(req);
    const node = getNode(req.params.id, user.id);
    assertDocument(node, user.id);
    const result = await restoreVersion({ node, userId: user.id, versionId: req.params.versionId });
    activity(user.id, 'doc.restore', 'node', node.id, node.name, req.ip);
    return result;
  });

  // Zwei Versionen (oder Version ↔ aktueller Stand) vergleichen.
  app.get('/api/v1/docs/:id/diff', async (req) => {
    const user = requireUser(req);
    const node = getNode(req.params.id, user.id);
    assertDocument(node, user.id);
    const from = req.query.from ? getVersion(node.id, String(req.query.from)).content : null;
    const to = req.query.to ? getVersion(node.id, String(req.query.to)).content : readDocumentContent(node);
    return docDiff(from ?? '', to ?? '');
  });

  // Kommentare.
  app.get('/api/v1/docs/:id/comments', async (req) => {
    const user = requireUser(req);
    const node = getNode(req.params.id, user.id);
    assertDocument(node, user.id);
    return { items: listComments(node.id, { includeResolved: req.query.resolved !== '0' }) };
  });

  app.post('/api/v1/docs/:id/comments', bodySchema({
    body: { type: 'string', minLength: 1, maxLength: 4000 },
    anchor: { type: ['object', 'null'] },
    parentId: { type: ['string', 'null'] },
    mentions: { type: 'array', items: { type: 'string' } },
  }, ['body']), async (req) => {
    const user = requireUser(req);
    const node = getNode(req.params.id, user.id);
    assertDocument(node, user.id);
    const comment = createComment({
      nodeId: node.id,
      userId: user.id,
      body: req.body.body,
      anchor: req.body.anchor || null,
      parentId: req.body.parentId || null,
      mentions: req.body.mentions || [],
    });
    notifyMentions({ node, comment, actor: user, mentions: comment.mentions });
    activity(user.id, 'doc.comment', 'node', node.id, node.name, req.ip);
    return { comment };
  });

  app.patch('/api/v1/docs/:id/comments/:commentId', bodySchema({
    body: { type: 'string', minLength: 1, maxLength: 4000 },
    resolved: { type: 'boolean' },
  }), async (req) => {
    const user = requireUser(req);
    const node = getNode(req.params.id, user.id);
    assertDocument(node, user.id);
    return { comment: updateComment({ nodeId: node.id, userId: user.id, commentId: req.params.commentId, patch: req.body }) };
  });

  app.delete('/api/v1/docs/:id/comments/:commentId', async (req) => {
    const user = requireUser(req);
    const node = getNode(req.params.id, user.id);
    assertDocument(node, user.id);
    deleteComment({ nodeId: node.id, userId: user.id, commentId: req.params.commentId });
    return { ok: true };
  });

  // Review-Status.
  app.patch('/api/v1/docs/:id/status', bodySchema({
    status: { type: 'string' },
    reviewBy: { type: ['string', 'null'] },
  }, ['status']), async (req) => {
    const user = requireUser(req);
    const node = getNode(req.params.id, user.id);
    assertDocument(node, user.id);
    const next = setStatus({ node, userId: user.id, status: req.body.status, reviewBy: req.body.reviewBy || null });
    activity(user.id, 'doc.status', 'node', node.id, next.status, req.ip);
    notifyStatus({ node, actor: user, status: next.status });
    return next;
  });
}

function notifyStatus({ node, actor, status }) {
  // Benachrichtigt alle, die das Dokument teilen (über dieselbe Freigabe).
  try {
    const shares = db.select().from(schema.shares).where(eq(schema.shares.nodeId, node.id)).all();
    for (const share of shares) {
      if (!share.ownerId || share.ownerId === actor.id) continue;
      notifyMentions({
        node, actor,
        mentions: [share.ownerId],
        kind: 'status',
        text: `${actor.displayName} hat den Status auf „${status}“ gesetzt.`,
      });
    }
  } catch {
    // Benachrichtigungen dürfen das Speichern nie blockieren.
  }
}
