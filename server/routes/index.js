import { registerAuthRoutes } from './auth.js';
import { registerSystemRoutes } from './system.js';
import { registerFileRoutes } from './files.js';
import { registerUploadRoutes } from './uploads.js';
import { registerShareRoutes } from './shares.js';
import { registerPhotoRoutes } from './photos.js';
import { registerUserRoutes } from './users.js';
import { registerStorageRoutes } from './storage.js';
import { registerDriveRoutes } from './drives.js';
import { registerBackupRoutes } from './backups.js';
import { registerAgentRoutes, registerIngestRoutes } from './agents.js';
import { registerPublicRoutes } from './public.js';
import { registerWebdavRoutes } from './webdav.js';
import { registerDocumentRoutes } from './documents.js';
import { registerArchiveRoutes } from './archive.js';
import { registerJobRoutes } from './jobs.js';
import { realtime } from '../services/realtime.js';
import { registerCollabRoute } from '../services/collab.js';
import { sessionUser } from '../services/auth.js';

export async function registerRoutes(app) {
  realtime.attach(app);
  registerCollabRoute(app, (request) => sessionUser(request));
  app.get('/api/v1/ws', { websocket: true }, (socket) => {
    socket.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        if (message.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
      } catch {
        // Ignore malformed client messages.
      }
    });
  });
  await app.register(async (scope) => {
    await registerAuthRoutes(scope);
    await registerSystemRoutes(scope);
    await registerFileRoutes(scope);
    await registerArchiveRoutes(scope);
    await registerJobRoutes(scope);
    await registerUploadRoutes(scope);
    await registerShareRoutes(scope);
    await registerPhotoRoutes(scope);
    await registerUserRoutes(scope);
    await registerStorageRoutes(scope);
    await registerDriveRoutes(scope);
    await registerBackupRoutes(scope);
    await registerAgentRoutes(scope);
    await registerIngestRoutes(scope);
    await registerPublicRoutes(scope);
    await registerWebdavRoutes(scope);
    await registerDocumentRoutes(scope);
  });
}
