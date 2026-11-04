import { writable, get } from 'svelte/store';
import { cancelUpload, completeUpload, createUpload, headUpload, patchUpload } from './api.js';
import { refresh, notify } from './stores.js';

const CHUNK = 8 * 1024 * 1024;
const MAX_RETRIES = 3;
const DB_NAME = 'onebox-uploads';
const DB_VERSION = 1;

export const queue = writable([]);
export const concurrency = writable(3);
let running = 0;
let counter = 0;
let defaultConflict = null;

// IndexedDB hält Metadaten und die File-Blobs. So kann ein Upload nach einem
// Reload ohne erneute Dateiauswahl an der letzten Offset-Position weiterlaufen.
function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'sessionId' });
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbPut(store, value) {
  const db = await openDb().catch(() => null);
  if (!db) return;
  await new Promise((resolve) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = resolve;
    tx.onerror = resolve;
  });
  db.close();
}

async function idbDelete(store, key) {
  const db = await openDb().catch(() => null);
  if (!db) return;
  await new Promise((resolve) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = resolve;
    tx.onerror = resolve;
  });
  db.close();
}

async function idbAll(store) {
  const db = await openDb().catch(() => null);
  if (!db) return [];
  const rows = await new Promise((resolve) => {
    const tx = db.transaction(store, 'readonly');
    const request = tx.objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
  db.close();
  return rows;
}

let persistTimer = null;
function persist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    for (const item of get(queue)) {
      if (!item.sessionId) continue;
      if (['done', 'canceled'].includes(item.status)) {
        idbDelete('sessions', item.sessionId);
        idbDelete('files', item.id);
        continue;
      }
      idbPut('sessions', {
        sessionId: item.sessionId,
        itemId: item.id,
        name: item.name,
        size: item.size,
        mime: item.mime,
        parentId: item.parentId,
        uploaded: item.uploaded,
        status: item.status === 'paused' ? 'paused' : 'queued',
      });
    }
  }, 800);
}

export async function restoreQueue() {
  const [saved, blobs] = await Promise.all([idbAll('sessions'), idbAll('files')]);
  if (!saved.length) return;
  const byId = new Map(blobs.map((row) => [row.id, row.file]));
  queue.set(saved.map((item) => ({
    id: item.itemId,
    sessionId: item.sessionId,
    name: item.name,
    size: item.size,
    mime: item.mime,
    parentId: item.parentId,
    uploaded: item.uploaded || 0,
    status: 'queued',
    speed: 0,
    eta: null,
    error: null,
    file: byId.get(item.itemId) || null,
    xhr: null,
    paused: item.status === 'paused',
  })));
  notify(`${saved.length} unterbrochene Uploads werden fortgesetzt.`, 'info', 6000);
  pump();
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
  additions.forEach((item) => {
    idbPut('files', { id: item.id, file: item.file });
  });
  pump();
  return additions;
}

export function attachFile(itemId, file) {
  idbPut('files', { id: itemId, file });
  queue.update((items) => items.map((item) => item.id === itemId ? { ...item, file, status: 'queued', error: null, uploaded: item.uploaded || 0 } : item));
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
  persist();
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
    idbDelete('files', item.id);
    if (item.sessionId) idbDelete('sessions', item.sessionId);
  }
  queue.update((items) => items.filter((entry) => entry.id !== itemId));
  persist();
  pump();
}

export function clearFinished() {
  for (const item of get(queue)) {
    if (['done', 'canceled', 'error'].includes(item.status)) {
      idbDelete('files', item.id);
      if (item.sessionId) idbDelete('sessions', item.sessionId);
    }
  }
  queue.update((items) => items.filter((item) => !['done', 'canceled', 'error'].includes(item.status)));
}

export function retry(itemId) {
  queue.update((items) => items.map((item) => item.id === itemId ? { ...item, status: 'queued', error: null, paused: false } : item));
  persist();
  pump();
}

export function resolveConflict(itemId, choice, applyAll = false) {
  if (applyAll) defaultConflict = choice;
  queue.update((items) => items.map((item) => item.id === itemId
    ? { ...item, conflictChoice: choice, status: 'uploading' }
    : item));
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function patchWithRetry(sessionId, offset, chunk, options) {
  let lastError = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      return await patchUpload(sessionId, offset, chunk, options);
    } catch (error) {
      if (error.aborted) throw error;
      lastError = error;
      await sleep(500 * 2 ** attempt);
      // Nach einem Abbruch kann der Server bereits mehr Bytes haben. Der
      // HEAD-Request liefert den echten Offset für den nächsten Versuch.
      const head = await headUpload(sessionId).catch(() => null);
      if (head?.ok && head.offset !== offset) return { offset: head.offset };
    }
  }
  throw lastError;
}

async function run(item) {
  update(item.id, { busy: true });
  try {
    let sessionId = item.sessionId;
    let offset = 0;
    if (sessionId) {
      const head = await headUpload(sessionId);
      if (head.ok) offset = head.offset;
      else sessionId = null;
    }
    if (!sessionId) {
      const result = await createUpload({
        name: item.name,
        size: item.size,
        mime: item.mime,
        parentId: item.parentId,
        conflict: item.conflictChoice || defaultConflict || null,
      });
      sessionId = result.upload.id;
      offset = result.upload.offset || 0;
      if (result.conflict && !item.conflictChoice && !defaultConflict) {
        update(item.id, {
          sessionId,
          uploaded: 0,
          status: 'conflict',
          busy: false,
          conflictExisting: result.existing,
        });
        persist();
        return;
      }
      persist();
    }
    update(item.id, { sessionId, uploaded: offset });
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
      const patchResult = await patchWithRetry(sessionId, offset, chunk, {
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
      });
      offset = Number(patchResult?.offset) || end;
      update(item.id, { uploaded: offset, speed: smoothed });
      persist();
    }
    const result = await completeUpload(sessionId, { conflict: item.conflictChoice || defaultConflict || 'keepBoth' });
    if (result?.skipped) {
      update(item.id, { status: 'done', uploaded: item.size, speed: 0, eta: 0, busy: false, sessionId: null, skipped: true });
      notify(`${item.name} existiert bereits und wurde übersprungen.`, 'info');
    } else {
      update(item.id, { status: 'done', uploaded: item.size, speed: 0, eta: 0, busy: false, sessionId: null });
      notify(`${item.name} ist hochgeladen.`, 'success');
    }
    persist();
    refresh();
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
