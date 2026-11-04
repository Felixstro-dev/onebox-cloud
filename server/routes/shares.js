import { requireUser } from '../services/auth.js';
import { createShare, listShares, revokeShare } from '../services/shares.js';
import { getNode, activity } from '../services/nodes.js';
import { badRequest } from '../lib/errors.js';

export async function registerShareRoutes(app) {
  app.get('/api/v1/shares', async (req) => {
    const user = requireUser(req);
    return { items: listShares(user.id) };
  });

  app.post('/api/v1/shares', {
    schema: {
      body: {
        type: 'object', required: ['nodeId'],
        properties: {
          nodeId: { type: 'string' },
          kind: { type: 'string', enum: ['link', 'upload'] },
          password: { type: ['string', 'null'], maxLength: 256 },
          expiresAt: { type: ['integer', 'null'] },
          maxDownloads: { type: ['integer', 'null'], minimum: 1 },
          maxFileSize: { type: ['integer', 'null'], minimum: 1 },
          maxTotalSize: { type: ['integer', 'null'], minimum: 1 },
          allowedTypes: { type: ['array', 'null'], items: { type: 'string', maxLength: 100 } },
        },
      },
    },
  }, async (req) => {
    const user = requireUser(req);
    if (req.body.expiresAt && req.body.expiresAt < Date.now()) throw badRequest('Expiry must be in the future.');
    if (req.body.password && req.body.password.length < 4) throw badRequest('Use a password with at least four characters.');
    const result = await createShare(user.id, req.body);
    activity(user.id, 'share.create', 'share', result.share.id, result.share.nodeName, req.ip);
    return result;
  });

  app.delete('/api/v1/shares/:id', async (req) => {
    const user = requireUser(req);
    revokeShare(user.id, req.params.id);
    activity(user.id, 'share.revoke', 'share', req.params.id, null, req.ip);
    return { ok: true };
  });

  app.get('/api/v1/shares/:id', async (req) => {
    const user = requireUser(req);
    const items = listShares(user.id);
    const share = items.find((item) => item.id === req.params.id);
    if (!share) throw badRequest('Share not found.');
    return { share };
  });

  app.post('/api/v1/files/:id/share-info', async (req) => {
    const user = requireUser(req);
    const node = getNode(req.params.id, user.id);
    return { node: { id: node.id, name: node.name, kind: node.kind } };
  });
}
