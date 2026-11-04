import { requireAdmin } from '../services/auth.js';
import { badRequest } from '../lib/errors.js';
import { listAvailableDrives, mountDrive, unmountDrive } from '../services/drives.js';

export async function registerDriveRoutes(app) {
  // List available drives
  app.get('/api/v1/storage/drives', async (req) => {
    requireAdmin(req);
    const drives = await listAvailableDrives();
    return { drives };
  });

  // Mount a drive
  app.post('/api/v1/storage/drives/mount', {
    schema: {
      body: {
        type: 'object',
        required: ['source', 'target'],
        properties: {
          source: { type: 'string', minLength: 1 },
          target: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (req) => {
    requireAdmin(req);
    const source = String(req.body.source || '').trim();
    const target = String(req.body.target || '').trim();
    if (!source || !target) throw badRequest('Source and target are required.');
    const result = await mountDrive(source, target);
    return result;
  });

  // Unmount a drive
  app.post('/api/v1/storage/drives/unmount', {
    schema: {
      body: {
        type: 'object',
        required: ['target'],
        properties: {
          target: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (req) => {
    requireAdmin(req);
    const target = String(req.body.target || '').trim();
    if (!target) throw badRequest('Target is required.');
    const result = await unmountDrive(target);
    return result;
  });

  // Get drive info
  app.get('/api/v1/storage/drives/:device', async (req) => {
    requireAdmin(req);
    const drives = await listAvailableDrives();
    const drive = drives.find(d => d.path === `/dev/${req.params.device}` || d.path === req.params.device);
    if (!drive) throw new Error('Drive not found');
    return { drive };
  });
}