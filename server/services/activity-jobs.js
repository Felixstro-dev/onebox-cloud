import { id } from '../lib/ids.js';

// Serverseitige Job-Queue für kurzlebige Datei-Aktionen (z. B. Papierkorb).
// Der Client liest den Status über /api/v1/jobs. Dadurch kann ein Job nicht
// als veralteter lokaler Zustand in der Oberfläche hängen bleiben.
const jobs = new Map();
const DONE_TTL = 2500; // erledigte Jobs kurz für die Abschlussanimation behalten
const ERROR_TTL = 30 * 60 * 1000;
const MAX_JOBS = 200;

function prune() {
  const now = Date.now();
  for (const [key, job] of jobs) {
    const finished = job.finishedAt || job.updatedAt;
    const ttl = job.status === 'error' ? ERROR_TTL : DONE_TTL;
    if (!['queued', 'running'].includes(job.status) && now - finished > ttl) jobs.delete(key);
  }
  if (jobs.size > MAX_JOBS) {
    const oldest = [...jobs.values()].sort((a, b) => a.createdAt - b.createdAt).slice(0, jobs.size - MAX_JOBS);
    for (const job of oldest) jobs.delete(job.id);
  }
}

export function createJob({ userId, kind, title, detail = '', total = 0 }) {
  prune();
  const now = Date.now();
  const job = {
    id: id(18),
    userId,
    kind,
    title,
    detail,
    status: 'running',
    processed: 0,
    total: Math.max(0, Number(total) || 0),
    result: null,
    message: null,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
  };
  jobs.set(job.id, job);
  return job;
}

export function updateJob(job, patch = {}) {
  if (!job || !jobs.has(job.id)) return null;
  Object.assign(job, patch, { updatedAt: Date.now() });
  return job;
}

export function finishJob(job, { title, detail, processed, total, result } = {}) {
  if (!job || !jobs.has(job.id)) return null;
  const now = Date.now();
  Object.assign(job, {
    ...(title !== undefined ? { title } : {}),
    ...(detail !== undefined ? { detail } : {}),
    ...(processed !== undefined ? { processed } : {}),
    ...(total !== undefined ? { total } : {}),
    ...(result !== undefined ? { result } : {}),
    status: 'done',
    finishedAt: now,
    updatedAt: now,
  });
  return job;
}

export function failJob(job, { title, detail, message } = {}) {
  if (!job || !jobs.has(job.id)) return null;
  const now = Date.now();
  Object.assign(job, {
    ...(title !== undefined ? { title } : {}),
    ...(detail !== undefined ? { detail } : {}),
    ...(message !== undefined ? { message } : {}),
    status: 'error',
    finishedAt: now,
    updatedAt: now,
  });
  return job;
}

export function dismissJob(userId, jobId) {
  const job = jobs.get(jobId);
  if (!job || job.userId !== userId) return false;
  jobs.delete(jobId);
  return true;
}

export function publicJob(job) {
  if (!job) return null;
  const progress = job.total > 0
    ? Math.max(0, Math.min(100, Math.round((job.processed / job.total) * 100)))
    : null;
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    title: job.title,
    detail: job.detail,
    message: job.message,
    processed: job.processed,
    total: job.total,
    progress,
    result: job.result,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt,
  };
}

export function listJobs(userId) {
  prune();
  return [...jobs.values()]
    .filter((job) => job.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(publicJob);
}
