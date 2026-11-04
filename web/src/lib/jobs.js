import { writable } from 'svelte/store';
import { get as apiGet, del } from './api.js';

// Der Status kommt aus der serverseitigen Job-Queue. Die Oberfläche hält
// keinen eigenen Job-Zustand mehr, der nach einer Aktion hängen bleiben kann.
export const jobs = writable([]);

let timer = null;
let requestSeq = 0;
let appliedSeq = 0;

export function isActiveJob(job) {
  return Boolean(job) && ['queued', 'running', 'error'].includes(job.status);
}

export async function refreshJobs() {
  const seq = ++requestSeq;
  try {
    const data = await apiGet('/api/v1/jobs');
    // Ältere Antworten dürfen neuere nicht überschreiben.
    if (seq < appliedSeq) return;
    appliedSeq = seq;
    jobs.set(Array.isArray(data?.jobs) ? data.jobs : []);
  } catch {
    // Netzwerkfehler: Die zuletzt bekannten Jobs bleiben sichtbar.
  }
}

export function startJobsPolling(interval = 1200) {
  if (timer) return;
  refreshJobs();
  timer = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    refreshJobs();
  }, interval);
  timer.unref?.();
}

export function stopJobsPolling() {
  if (timer) clearInterval(timer);
  timer = null;
}

export async function dismissJob(jobId) {
  jobs.update((list) => list.filter((job) => job.id !== jobId));
  try { await del(`/api/v1/jobs/${jobId}`); } catch { /* bereits entfernt */ }
}
