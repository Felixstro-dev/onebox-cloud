import { config } from '../config.js';
import { requireAdmin, requireUser } from '../services/auth.js';
import { resources } from '../services/runtime.js';
import { getAllSettings, profileLimits, setSetting, PROFILES } from '../services/settings.js';
import { diskStats } from '../services/storage.js';
import { badRequest } from '../lib/errors.js';
import { db, schema } from '../db/index.js';
import { desc, eq } from 'drizzle-orm';
import { usedBytes } from '../services/nodes.js';
import { getMessages, addMessage } from '../../addons/chat/api/chat.js';

export async function registerSystemRoutes(app) {
  app.get('/api/v1/system/health', async () => {
    return { status: 'ok', version: config.version, uptime: Math.round(process.uptime()) };
  });

  app.get('/api/v1/system/metrics', async (req) => {
    requireAdmin(req);
    const metrics = resources.metrics();
    return { ...metrics, disk: await diskStats(), profiles: PROFILES, limits: profileLimits() };
  });

  app.get('/api/v1/settings', async (req) => {
    requireUser(req);
    const settings = getAllSettings();
    return {
      settings: {
        performanceProfile: settings.performanceProfile,
        autoThrottle: settings.autoThrottle,
        theme: settings.theme,
        defaultQuota: settings.defaultQuota,
        registrationOpen: settings.registrationOpen,
        chatEnabled: settings.chatEnabled,
      },
      limits: profileLimits(),
      profiles: PROFILES,
    };
  });

  app.get('/api/v1/activity', async (req) => {
    const user = requireUser(req);
    const rows = db.select().from(schema.activityLogs).where(eq(schema.activityLogs.userId, user.id)).orderBy(desc(schema.activityLogs.createdAt)).limit(20).all();
    return { items: rows };
  });

  app.get('/api/v1/overview', async (req) => {
    const user = requireUser(req);
    const fileCount = db.select({ count: schema.nodes.id }).from(schema.nodes).where(eq(schema.nodes.ownerId, user.id)).all().length;
    return { usedBytes: usedBytes(user.id), fileCount };
  });
  app.get('/api/v1/chat/messages', async (req) => {
    const user = requireUser(req);
    return await getMessages();
  });

  app.post('/api/v1/chat/messages', async (req) => {
    const user = requireUser(req);
    const { text } = req.body;
    if (!text || text.trim() === '') throw badRequest('Nachricht ist leer.');
    return await addMessage({ text, user: user.id });
  });



  app.patch('/api/v1/settings', {
    schema: {
      body: {
        type: 'object',
        properties: {
          performanceProfile: { type: 'string', enum: ['low', 'balanced', 'high'] },
          autoThrottle: { type: 'boolean' },
          theme: { type: 'string', enum: ['dark', 'light'] },
          defaultQuota: { type: 'integer', minimum: 0 },
          registrationOpen: { type: 'boolean' },
        },
      },
    },
  }, async (req) => {
    requireAdmin(req);
    const allowed = ['performanceProfile', 'autoThrottle', 'theme', 'defaultQuota', 'registrationOpen'];
    for (const [key, value] of Object.entries(req.body)) {
      if (!allowed.includes(key)) continue;
      if (key === 'performanceProfile' && !PROFILES[value]) throw badRequest('Unknown profile.');
      setSetting(key, value);
    }
    resources.applyProfile();
    return { settings: getAllSettings(), limits: profileLimits() };
  });
}
