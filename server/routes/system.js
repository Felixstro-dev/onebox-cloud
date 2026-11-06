import { config } from '../config.js';
import { requireAdmin, requireUser } from '../services/auth.js';
import { resources } from '../services/runtime.js';
import { getAllSettings, profileLimits, setSetting, PROFILES } from '../services/settings.js';
import { diskStats } from '../services/storage.js';
import { badRequest } from '../lib/errors.js';
import { db, schema, runMigrations } from '../db/index.js';
import { desc, eq, sql } from 'drizzle-orm';
import { usedBytes } from '../services/nodes.js';
import { getMessages, addMessage } from '../addons/chat/api/chat.js';
import {
  checkForUpdate, clearMaintenance, maintenancePage, maintenanceState, startMaintenance, triggerUpdater,
} from '../services/updates.js';

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
    const fileCount = db.select({ count: sql`count(*)` }).from(schema.nodes)
      .where(eq(schema.nodes.ownerId, user.id)).get()?.count || 0;
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
    return await addMessage({ text: text.trim(), user: user.id, displayName: user.displayName || user.username });
  });

  // Öffentlich, damit die Wartungsseite und Docker den Status prüfen können.
  app.get('/api/v1/system/maintenance', async () => maintenanceState());

  app.get('/maintenance', async (req, reply) => {
    const state = maintenanceState();
    reply.header('Cache-Control', 'no-store').header('Retry-After', String(Math.max(1, Math.ceil(((state.until || Date.now()) - Date.now()) / 1000))));
    return reply.type('text/html').send(maintenancePage());
  });

  app.get('/api/v1/system/update/status', async (req) => {
    requireAdmin(req);
    const status = await checkForUpdate();
    return { ...status, autoUpdate: Boolean(config.updateApiUrl), maintenance: maintenanceState() };
  });

  app.post('/api/v1/system/update', async (req) => {
    requireAdmin(req);
    if (!config.updateApiUrl) {
      throw badRequest('Auto-Update ist nicht konfiguriert. Setze UPDATE_API_URL und starte den Updater-Container (siehe README).');
    }
    if (maintenanceState().active) throw badRequest('Es läuft bereits ein Update.');
    const update = await checkForUpdate({ force: true });
    if (!update.updateAvailable) throw badRequest('Onebox ist bereits auf dem neuesten Stand.');
    const delay = Math.min(300, Math.max(30, config.updateDelaySeconds));
    startMaintenance(delay + 15, { reason: 'update', version: update.latest });
    try {
      // Die neuen Migrationen werden beim Start des neuen Containers erneut
      // geprüft; ein Lauf jetzt stellt sicher, dass die aktuelle DB bereits
      // konsistent ist und ein Snapshot geschrieben wurde.
      await runMigrations();
    } catch (error) {
      clearMaintenance();
      throw error;
    }
    setTimeout(() => {
      triggerUpdater().catch((error) => {
        console.error('[update] Updater konnte nicht angestoßen werden:', error.message);
        clearMaintenance();
      });
    }, delay * 1000).unref?.();
    return {
      ok: true,
      current: update.current,
      latest: update.latest,
      restartIn: delay,
      maintenanceUntil: maintenanceState().until,
    };
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
