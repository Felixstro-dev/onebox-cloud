import { writable } from 'svelte/store';

// Kurzlebige Hintergrund-Jobs (z. B. Papierkorb), die im Upload-Panel erscheinen.
export const jobs = writable([]);

let jobSeq = 0;
const timers = new Map();

function clearTimer(id) {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

export function startJob({ kind = 'task', title, detail = '', count = 0, cancel = null }) {
  const id = ++jobSeq;
  clearTimer(id);
  jobs.update((list) => [
    { id, kind, title, detail, count, cancel, status: 'running', startedAt: Date.now() },
    ...list,
  ]);
  return id;
}

export function updateJob(id, patch) {
  jobs.update((list) => list.map((job) => (job.id === id ? { ...job, ...patch } : job)));
}

export function finishJob(id, { title, detail, timeout = 3200 } = {}) {
  updateJob(id, {
    status: 'done',
    ...(title !== undefined ? { title } : {}),
    ...(detail !== undefined ? { detail } : {}),
  });
  clearTimer(id);
  if (timeout) timers.set(id, setTimeout(() => removeJob(id), timeout));
}

export function failJob(id, { title, detail, timeout = 7000 } = {}) {
  updateJob(id, {
    status: 'error',
    ...(title !== undefined ? { title } : {}),
    ...(detail !== undefined ? { detail } : {}),
  });
  clearTimer(id);
  if (timeout) timers.set(id, setTimeout(() => removeJob(id), timeout));
}

export function removeJob(id) {
  clearTimer(id);
  jobs.update((list) => list.filter((job) => job.id !== id));
}

export function clearFinishedJobs() {
  jobs.update((list) => list.filter((job) => job.status === 'running'));
}
