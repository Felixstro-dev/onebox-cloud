import { writable, get } from 'svelte/store';
import { cancelUpload, completeUpload, createUpload, patchUpload } from './api.js';
import { refresh, notify } from './stores.js';

const STORAGE_KEY = 'onebox-upload-sessions';
const CHUNK = 8 * 1024 * 1024;

export const queue = writable([]);
export const concurrency = writable(3);
let running = 0;
let counter = 0;

let persistTimer = null;
function persist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const saved = get(queue)
      .filter((item) => item.sessionId && !['done', 'canceled'].includes(item.status))
      .map((item) => ({ sessionId: item.sessionId, name: item.name, size: item.size, mime: item.mime, parentId: item.parentId, uploaded: item.uploaded }));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch {}
  }, 1000);
}

export function restoreQueue() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!saved.length) return;
    queue.set(saved.map((item) => ({
      ...item, id: `restored-${++counter}`, status: 'needs-file', speed: 0, eta: null, error: null,
    })));
    notify(`${saved.length} unterbrochene Uploads warten auf ihre Dateien.`, 'info', 6000);
  } catch {}
}

export function setUploadConcurrency(value) {
  concurrency.set(Math.max(1, Number(value) || 1));
  pump();
}

export function addFiles(files, parentId = null) {
  const additions = [...files].map((file) => ({
    id: `u-${Date.now()}-${++counter}`,
    name: file.name,
    size: file.size,
    mime: file.type || 'application/octet-stream',
    parentId,
    status: 'queued',
    uploaded: 0,
    speed: 0,
    eta: null,
    error: null,
    file,
    sessionId: null,
    xhr: null,
    paused: false,
  }));
  queue.update((items) => [...items, ...additions]);
  additions.forEach((item) => { item.status = 'uploading'; });
  pump();
  return additions;
}

export function attachFile(itemId, file) {
  queue.update((items) => items.map((item) => item.id === itemId ? { ...item, file, status: 'queued', error: null, uploaded: 0 } : item));
  pump();
}

export function findPendingFor(file) {
  return get(queue).find((item) => item.status === 'needs-file' && item.name === file.name && item.size === file.size);
}

export function pause(itemId) {
  queue.update((items) => items.map((item) => {
    if (item.id !== itemId) return item;
    item.paused = true;
    item.status = 'paused';
    item.xhr?.abort();
    return { ...item };
  }));
}

export function resume(itemId) {
  queue.update((items) => items.map((item) => item.id === itemId ? { ...item, paused: false, status: item.file || item.sessionId ? 'uploading' : item.status, error: null } : item));
  pump();
}

export function remove(itemId) {
  const item = get(queue).find((entry) => entry.id === itemId);
  if (item) {
    item.xhr?.abort();
    if (item.sessionId && item.status !== 'done') cancelUpload(item.sessionId).catch(() => {});
  }
  queue.update((items) => items.filter((entry) => entry.id !== itemId));
  persist();
  pump();
}

export function clearFinished() {
  queue.update((items) => items.filter((item) => !['done', 'canceled', 'error'].includes(item.status)));
}

export function retry(itemId) {
  queue.update((items) => items.map((item) => item.id === itemId ? { ...item, status: 'queued', error: null, uploaded: 0, sessionId: null, paused: false } : item));
  persist();
  pump();
}

async function pump() {
  const limit = get(concurrency);
  const items = get(queue);
  for (const item of items) {
    if (running >= limit) break;
    if (!['uploading', 'queued'].includes(item.status) || item.busy) continue;
    update(item.id, { status: 'uploading' });
    running += 1;
    run(get(queue).find((entry) => entry.id === item.id)).finally(() => { running -= 1; pump(); });
  }
}

function update(itemId, patch) {
  queue.update((items) => items.map((item) => item.id === itemId ? { ...item, ...patch } : item));
}

async function run(item) {
  update(item.id, { busy: true });
  try {
    // Always create a new upload session for fresh uploads to avoid offset mismatch
    // with stale sessions from interrupted previous attempts
    const result = await createUpload({ name: item.name, size: item.size, mime: item.mime, parentId: item.parentId });
    const sessionId = result.upload.id;
    let offset = result.upload.offset || 0;
    update(item.id, { sessionId, uploaded: offset });
    persist();
    const file = get(queue).find((entry) => entry.id === item.id)?.file;
    if (!file) {
      update(item.id, { status: 'needs-file', busy: false });
      return;
    }
    let lastAt = Date.now();
    let lastBytes = offset;
    let smoothed = 0;
    while (offset < item.size) {
      const current = get(queue).find((entry) => entry.id === item.id);
      if (!current || current.paused || current.status !== 'uploading') {
        update(item.id, { busy: false });
        return;
      }
      const end = Math.min(offset + CHUNK, item.size);
      const chunk = file.slice(offset, end);
      const baseOffset = offset;
      await patchUpload(sessionId, offset, chunk, {
        onXhr: (xhr) => { const entry = get(queue).find((e) => e.id === item.id); if (entry) entry.xhr = xhr; },
        onProgress: (loaded) => {
          const now = Date.now();
          const elapsed = (now - lastAt) / 1000;
          if (elapsed > 0.25) {
            const instant = (baseOffset + loaded - lastBytes) / elapsed;
            smoothed = smoothed ? smoothed * 0.65 + instant * 0.35 : instant;
            lastAt = now;
            lastBytes = baseOffset + loaded;
          }
          const totalDone = baseOffset + loaded;
          update(item.id, {
            uploaded: totalDone,
            speed: smoothed,
            eta: smoothed > 1024 ? Math.max(0, (item.size - totalDone) / smoothed) : null,
          });
        },
      }).catch((error) => {
        if (error.aborted) throw error;
        throw error;
      });
      offset = end;
      update(item.id, { uploaded: offset, speed: smoothed });
      persist();
    }
    await completeUpload(sessionId);
    update(item.id, { status: 'done', uploaded: item.size, speed: 0, eta: 0, busy: false, sessionId: null });
    persist();
    refresh();
    notify(`${item.name} ist hochgeladen.`, 'success');
  } catch (error) {
    if (error.aborted) {
      update(item.id, { busy: false });
      return;
    }
    update(item.id, { status: 'error', error: error.message, busy: false, speed: 0 });
    persist();
    notify(`${item.name}: ${error.message}`, 'error', 6000);
  }
}

export function totalProgress(items) {
  const active = items.filter((item) => item.status !== 'done' && item.status !== 'canceled');
  const total = active.reduce((sum, item) => sum + item.size, 0);
  const done = active.reduce((sum, item) => sum + Math.min(item.uploaded || 0, item.size), 0);
  return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
}
