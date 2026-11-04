import fs from 'node:fs';
import { config, paths } from './config.js';
import { runMigrations, closeDb, db, schema } from './db/index.js';
import { and, eq } from 'drizzle-orm';
import { cleanupAbandonedUploads } from './services/storage.js';

async function main() {
  await runMigrations();
  const { buildApp } = await import('./app.js');
  const app = await buildApp();
  await app.listen({ port: config.port, host: config.host });
  console.log(`[onebox] listening on http://${config.host}:${config.port}`);

  fs.mkdirSync(paths.runtime, { recursive: true });
  cleanupAbandonedUploads().catch(() => {});

  const cleanup = setInterval(() => cleanupAbandonedUploads().catch(() => {}), 6 * 60 * 60 * 1000);
  cleanup.unref?.();

  // Papierkorb automatisch leeren: Dateien, die älter als 7 Tage sind.
  const TRASH_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
  const trashCleanup = async () => {
    try {
      const { purgeExpiredTrash } = await import('./services/nodes.js');
      await purgeExpiredTrash(TRASH_MAX_AGE);
    } catch (error) {
      console.error('[trash] cleanup failed:', error.message);
    }
  };
  // Beim Start (nach 30 s) und danach alle 24 h.
  setTimeout(() => trashCleanup().catch(() => {}), 30_000).unref?.();
  const trashTimer = setInterval(() => trashCleanup().catch(() => {}), 24 * 60 * 60 * 1000);
  trashTimer.unref?.();

  const scheduler = setInterval(async () => {
    try {
      const jobs = db.select().from(schema.backupJobs).where(and(eq(schema.backupJobs.enabled, true))).all();
      const intervals = { hourly: 3600000, daily: 86400000, weekly: 7 * 86400000 };
      for (const job of jobs) {
        if (!job.schedule || !intervals[job.schedule]) continue;
        if (Date.now() - (job.lastRunAt || 0) < intervals[job.schedule]) continue;
        const recent = db.select().from(schema.backupRuns).where(and(eq(schema.backupRuns.jobId, job.id))).all()
          .some((run) => run.status === 'running' || run.status === 'queued');
        if (recent) continue;
        const { executeRun } = await import('./services/backups.js');
        executeRun(job, { trigger: 'schedule' }).catch((error) => console.error('[backup] scheduled run failed:', error.message));
      }
    } catch (error) {
      console.error('[backup] scheduler:', error.message);
    }
  }, 60000);
  scheduler.unref?.();

  const shutdown = async () => {
    clearInterval(cleanup);
    clearInterval(scheduler);
    clearInterval(trashTimer);
    await app.close();
    closeDb();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  console.error('[onebox] failed to start:', error);
  process.exit(1);
});
