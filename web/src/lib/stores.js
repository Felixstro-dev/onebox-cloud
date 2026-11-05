import { writable } from 'svelte/store';

export const user = writable(null);
export const settings = writable({});
export const toasts = writable([]);
export const confirmState = writable(null);
export const refreshKey = writable(0);
export const uploadsOpen = writable(false);

let toastId = 0;
let lastToast = null;
const MAX_TOASTS = 7;

/**
 * Zeigt einen Hinweis. `action` ist optional und rendert einen zusätzlichen
 * Button, z. B. „Rückgängig“ nach dem Löschen.
 */
export function notify(message, kind = 'info', timeout = 4200, action = null) {
  const id = ++toastId;
  const now = Date.now();
  const key = `${kind}:${message}`;
  toasts.update((items) => {
    if (lastToast?.key === key && now - lastToast.at < 100) return items;
    lastToast = { key, at: now };
    const next = [...items, { id, message, kind, action }];
    if (next.length > MAX_TOASTS) next.shift();
    return next;
  });
  if (timeout) setTimeout(() => dismiss(id), timeout);
  return id;
}

/** Führt die Aktion eines Toasts aus und schließt ihn. */
export function runToastAction(toast) {
  dismiss(toast.id);
  try { toast.action?.onClick?.(); } catch { /* Die Aktion meldet eigene Fehler. */ }
}

export function dismiss(id) {
  toasts.update((items) => items.filter((item) => item.id !== id));
}

export function refresh() {
  refreshKey.update((value) => value + 1);
}

export function confirmAction(options) {
  return new Promise((resolve) => {
    confirmState.set({
      ...options,
      resolve: (value) => {
        confirmState.set(null);
        resolve(value);
      },
    });
  });
}
