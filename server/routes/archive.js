import { requireUser } from '../services/auth.js';
import { getNode } from '../services/nodes.js';
import { badRequest, notFound } from '../lib/errors.js';
import {
  cancelJob, getJob, isZipNode, publicJob, startExtractJob, startZipJob, streamSelectionZip,
} from '../services/archive.js';

const selectionSchema = {
  type: 'object',
  properties: {
    ids: { type: 'array', items: { type: 'string' } },
    selectAll: { type: 'boolean' },
    filter: {
      type: 'object',
      properties: {
        parentId: { type: ['string', 'null'] },
        q: { type: ['string', 'null'] },
        kind: { type: ['string', 'null'] },
        sort: { type: 'string' },
        dir: { type: 'string' },
      },
    },
    exclude: { type: 'array', items: { type: 'string' } },
    snapshot: { type: 'integer' },
    parentId: { type: ['string', 'null'] },
    name: { type: 'string', maxLength: 255 },
    target: { type: 'string' },
    conflict: { type: 'string' },
    folderName: { type: 'string', maxLength: 255 },
  },
};

function assertSelection(body) {
  if (!body || (!body.selectAll && (!Array.isArray(body.ids) || !body.ids.length))) {
    throw badRequest('Keine Elemente ausgewählt.');
  }
  if (body.selectAll && !body.filter) throw badRequest('Für "Alle auswählen" fehlt der Filter.');
}

export async function registerArchiveRoutes(app) {
  app.post('/api/v1/files/archive/download', { schema: { body: selectionSchema } }, async (req, reply) => {
    const user = requireUser(req);
    assertSelection(req.body);
    return streamSelectionZip(reply, req, user.id, req.body);
  });

  app.post('/api/v1/files/archive', { schema: { body: selectionSchema } }, async (req) => {
    const user = requireUser(req);
    assertSelection(req.body);
    return { job: startZipJob(user, req.body) };
  });

  app.get('/api/v1/files/archive/jobs/:id', async (req) => {
    const user = requireUser(req);
    return { job: publicJob(getJob(user.id, req.params.id)) };
  });

  app.delete('/api/v1/files/archive/jobs/:id', async (req) => {
    const user = requireUser(req);
    return { job: cancelJob(user.id, req.params.id) };
  });

  app.post('/api/v1/files/:id/extract', { schema: { body: selectionSchema } }, async (req) => {
    const user = requireUser(req);
    const node = getNode(req.params.id, user.id);
    if (!isZipNode(node)) throw badRequest('Nur ZIP-Dateien können entpackt werden.');
    if (!node.hash) throw notFound('ZIP-Datei fehlt.');
    return { job: startExtractJob(user, node, req.body || {}) };
  });
}
