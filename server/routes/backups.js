import fs from 'node:fs';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireUser, requireAdmin } from '../services/auth.js';
import { badRequest, notFound } from '../lib/errors.js';
import { id, token, hashToken } from '../lib/ids.js';
import { executeRun, restoreRun, agentRoot, ensureFolder, ensureLocalTarget } from '../services/backups.js';
import { jobs } from '../services/runtime.js';
import { getSetting, setSetting } from '../services/settings.js';
import { activity } from '../services/nodes.js';

export async function registerBackupRoutes(app) {
  app.get('/api/v1/backups/jobs', async (req) => {
    const user = requireUser(req);
    const rows = db.select().from(schema.backupJobs).where(eq(schema.backupJobs.ownerId, user.id)).orderBy(desc(schema.backupJobs.createdAt)).all();
    return {
      items: rows.map((job) => {
        const runs = db.select().from(schema.backupRuns).where(eq(schema.backupRuns.jobId, job.id)).orderBy(desc(schema.backupRuns.createdAt)).limit(5).all();
        return { ...job, targetConfig: redactConfig(job.targetConfig), runs };
      }),
    };
  });

  app.post('/api/v1/backups/jobs', {
    schema: {
      body: {
        type: 'object', required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 120 },
          sourceNodeId: { type: ['string', 'null'] },
          targetType: { type: 'string', enum: ['local', 'onebox'] },
          targetConfig: { type: 'object' },
          schedule: { type: ['string', 'null'] },
          retention: { type: 'integer', minimum: 1, maximum: 365 },
          preRun: { type: ['string', 'null'] },
          postRun: { type: ['string', 'null'] },
          enabled: { type: 'boolean' },
        },
      },
    },
  }, async (req) => {
    const user = requireUser(req);
    const cfg = req.body.targetConfig || {};
    if (req.body.targetType === 'onebox' && (!cfg.url || !cfg.token)) throw badRequest('Remote target needs a URL and a receive token.');
    if (req.body.targetType !== 'onebox') {
      if (!cfg.path) throw badRequest('Choose a target directory.');
      try { cfg.path = await ensureLocalTarget(cfg.path); } catch (error) {
        if (error.status) throw error;
        throw badRequest(`Zielverzeichnis ist nicht beschreibbar: ${error.message}`);
      }
    }
    const job = {
      id: id(), ownerId: user.id, name: req.body.name.trim(), sourceNodeId: req.body.sourceNodeId || null,
      targetType: req.body.targetType || 'local', targetConfig: JSON.stringify(cfg), schedule: req.body.schedule || null,
      retention: req.body.retention || 7, enabled: req.body.enabled !== false, preRun: req.body.preRun || null, postRun: req.body.postRun || null, createdAt: Date.now(),
    };
    db.insert(schema.backupJobs).values(job).run();
    activity(user.id, 'backup.job.create', 'backup_job', job.id, job.name, req.ip);
    return { job: { ...job, targetConfig: redactConfig(job.targetConfig), runs: [] } };
  });

  app.patch('/api/v1/backups/jobs/:id', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 120 },
          schedule: { type: ['string', 'null'] },
          retention: { type: 'integer', minimum: 1, maximum: 365 },
          preRun: { type: ['string', 'null'] },
          postRun: { type: ['string', 'null'] },
          enabled: { type: 'boolean' },
          targetConfig: { type: 'object' },
        },
      },
    },
  }, async (req) => {
    const user = requireUser(req);
    const job = ownJob(user.id, req.params.id);
    const patch = {};
    if (req.body.name !== undefined) patch.name = req.body.name.trim();
    if (req.body.schedule !== undefined) patch.schedule = req.body.schedule;
    if (req.body.retention !== undefined) patch.retention = req.body.retention;
    if (req.body.enabled !== undefined) patch.enabled = req.body.enabled;
    if (req.body.preRun !== undefined) patch.preRun = req.body.preRun;
    if (req.body.postRun !== undefined) patch.postRun = req.body.postRun;
    if (req.body.targetConfig) {
      const cfg = { ...req.body.targetConfig };
      if (job.targetType !== 'onebox') {
        if (!cfg.path) throw badRequest('Choose a target directory.');
        try { cfg.path = await ensureLocalTarget(cfg.path); } catch (error) {
          if (error.status) throw error;
          throw badRequest(`Zielverzeichnis ist nicht beschreibbar: ${error.message}`);
        }
      }
      patch.targetConfig = JSON.stringify(cfg);
    }
    db.update(schema.backupJobs).set(patch).where(eq(schema.backupJobs.id, job.id)).run();
    return { ok: true };
  });

  app.delete('/api/v1/backups/jobs/:id', async (req) => {
    const user = requireUser(req);
    const job = ownJob(user.id, req.params.id);
    db.delete(schema.backupJobs).where(eq(schema.backupJobs.id, job.id)).run();
    return { ok: true };
  });

  app.post('/api/v1/backups/jobs/:id/run', async (req) => {
    const user = requireUser(req);
    const job = ownJob(user.id, req.params.id);
    const run = await executeRun(job);
    return { run };
  });

  app.get('/api/v1/backups/jobs/:id/runs', async (req) => {
    const user = requireUser(req);
    ownJob(user.id, req.params.id);
    const rows = db.select().from(schema.backupRuns).where(eq(schema.backupRuns.jobId, req.params.id)).orderBy(desc(schema.backupRuns.createdAt)).limit(50).all();
    return { items: rows };
  });

  app.get('/api/v1/backups/runs/:runId', async (req) => {
    const user = requireUser(req);
    const run = db.select().from(schema.backupRuns).where(eq(schema.backupRuns.id, req.params.runId)).get();
    if (!run) throw notFound('Run not found.');
    ownJob(user.id, run.jobId);
    return { run };
  });

  app.post('/api/v1/backups/runs/:runId/restore/preview', async (req) => {
    const user = requireUser(req);
    const run = db.select().from(schema.backupRuns).where(eq(schema.backupRuns.id, req.params.runId)).get();
    if (!run) throw notFound('Run not found.');
    ownJob(user.id, run.jobId);
    if (!run.manifest || !fs.existsSync(run.manifest)) throw notFound('Manifest is missing.');
    const manifest = JSON.parse(fs.readFileSync(run.manifest, 'utf8'));
    return {
      files: manifest.nodes.filter((row) => row.kind === 'file').length,
      folders: manifest.nodes.filter((row) => row.kind === 'folder').length,
      size: manifest.nodes.filter((row) => row.kind === 'file').reduce((sum, row) => sum + row.size, 0),
      sample: manifest.nodes.filter((row) => row.kind === 'file').slice(0, 12).map((row) => ({ name: row.name, size: row.size })),
    };
  });

  app.post('/api/v1/backups/runs/:runId/restore', {
    schema: { body: { type: 'object', properties: { parentId: { type: ['string', 'null'] } } } },
  }, async (req) => {
    const user = requireUser(req);
    const run = db.select().from(schema.backupRuns).where(eq(schema.backupRuns.id, req.params.runId)).get();
    if (!run) throw notFound('Run not found.');
    const job = ownJob(user.id, run.jobId);
    if (run.status !== 'success') throw badRequest('Only successful runs can be restored.');
    const promise = jobs.backups.add(() => restoreRun(job, run, user.id, req.body.parentId || null));
    const result = await promise;
    return result;
  });

  app.get('/api/v1/backup-agents', async (req) => {
    const user = requireUser(req);
    const rows = db.select().from(schema.backupAgents).where(eq(schema.backupAgents.ownerId, user.id)).orderBy(desc(schema.backupAgents.createdAt)).all();
    return {
      items: rows.map((agent) => ({
        id: agent.id, name: agent.name, tokenPrefix: agent.tokenPrefix, lastSeenAt: agent.lastSeenAt,
        schedule: agent.schedule, enabled: Boolean(agent.enabled), agentVersion: agent.agentVersion || '0.0.0',
        connected: Boolean(agent.lastSeenAt), createdAt: agent.createdAt, rootFolderId: agent.rootFolderId,
        preRun: agent.preRun || '', postRun: agent.postRun || '', excludes: agent.excludes || '',
        paths: db.select().from(schema.agentPaths).where(eq(schema.agentPaths.agentId, agent.id)).all().map((row) => row.path),
      })),
    };
  });

  app.post('/api/v1/backup-agents', {
    schema: { body: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 80 }, paths: { type: 'array', items: { type: 'string' } }, schedule: { type: ['string', 'null'] }, enabled: { type: 'boolean' }, excludes: { type: ['string', 'null'] } } } },
  }, async (req) => {
    const user = requireUser(req);
    const name = req.body.name.trim().replace(/[^\w .-]/g, '').slice(0, 60) || 'Server';
    const root = agentRoot(user.id);
    const serverFolder = ensureFolder(user.id, root.id, name);
    const raw = token(32);
    const agent = {
      id: id(), name, tokenHash: hashToken(raw), tokenPrefix: raw.slice(0, 8), rootFolderId: serverFolder.id,
      ownerId: user.id, createdAt: Date.now(), lastSeenAt: null,
      schedule: req.body.schedule || null,
      enabled: req.body.enabled !== false, excludes: req.body.excludes || null,
    };
    db.insert(schema.backupAgents).values(agent).run();
    for (const p of req.body.paths || []) db.insert(schema.agentPaths).values({ id: id(), agentId: agent.id, path: p }).run();
    activity(user.id, 'agent.create', 'backup_agent', agent.id, name, req.ip);
    return { agent: { ...agent, token: raw, paths: req.body.paths || [] } };
  });

  app.patch('/api/v1/backup-agents/:id/paths', {
    schema: { body: { type: 'object', properties: { paths: { type: 'array', items: { type: 'string' } }, schedule: { type: ['string', 'null'] }, enabled: { type: 'boolean' }, preRun: { type: ['string', 'null'] }, postRun: { type: ['string', 'null'] }, excludes: { type: ['string', 'null'] } } } },
  }, async (req, reply) => {
    const user = requireUser(req);
    const agent = db.select().from(schema.backupAgents).where(and(eq(schema.backupAgents.id, req.params.id), eq(schema.backupAgents.ownerId, user.id))).get();
    if (!agent) throw notFound('Agent not found.');
    if (req.body.paths !== undefined) {
      db.delete(schema.agentPaths).where(eq(schema.agentPaths.agentId, agent.id)).run();
      for (const p of req.body.paths) db.insert(schema.agentPaths).values({ id: id(), agentId: agent.id, path: p }).run();
    }
    const updates = {};
    if (req.body.schedule !== undefined) updates.schedule = req.body.schedule;
    if (req.body.enabled !== undefined) updates.enabled = req.body.enabled ? 1 : 0;
    if (req.body.preRun !== undefined) updates.preRun = req.body.preRun || null;
    if (req.body.postRun !== undefined) updates.postRun = req.body.postRun || null;
    if (req.body.excludes !== undefined) updates.excludes = req.body.excludes || null;
    if (Object.keys(updates).length) db.update(schema.backupAgents).set(updates).where(eq(schema.backupAgents.id, agent.id)).run();
    activity(user.id, 'agent.update', 'backup_agent', agent.id, `${req.body.paths?.length || 0} paths${req.body.schedule ? ', schedule ' + req.body.schedule : ''}${req.body.enabled !== undefined ? ', enabled ' + req.body.enabled : ''}`, req.ip);
    return { ok: true };
  });

  app.delete('/api/v1/backup-agents/:id', async (req) => {
    const user = requireUser(req);
    const agent = db.select().from(schema.backupAgents).where(and(eq(schema.backupAgents.id, req.params.id), eq(schema.backupAgents.ownerId, user.id))).get();
    if (!agent) throw notFound('Agent not found.');
    db.delete(schema.backupAgents).where(eq(schema.backupAgents.id, agent.id)).run();
    return { ok: true };
  });

  app.post('/api/v1/backups/receive-token', async (req) => {
    const admin = requireAdmin(req);
    const raw = token(32);
    setSetting('ingestTokenHash', hashToken(raw));
    setSetting('ingestOwnerId', admin.id);
    return { token: raw, url: req.headers.origin || '' };
  });

  app.get('/api/v1/backups/receive-token', async (req) => {
    requireAdmin(req);
    return { configured: Boolean(getSetting('ingestTokenHash')) };
  });
}

function ownJob(ownerId, jobId) {
  const job = db.select().from(schema.backupJobs).where(and(eq(schema.backupJobs.id, jobId), eq(schema.backupJobs.ownerId, ownerId))).get();
  if (!job) throw notFound('Backup job not found.');
  return job;
}

function redactConfig(value) {
  try {
    const cfg = JSON.parse(value);
    if (cfg.token) cfg.token = '••••••••';
    return cfg;
  } catch {
    return {};
  }
}
