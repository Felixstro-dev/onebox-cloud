import { writable } from 'svelte/store';

export const user = writable(null);
export const settings = writable({});
export const toasts = writable([]);
export const confirmState = writable(null);
export const refreshKey = writable(0);
export const uploadsOpen = writable(false);

let toastId = 0;
const MAX_TOASTS = 7;

export function notify(message, kind = 'info', timeout = 4200) {
  const id = ++toastId;
  toasts.update((items) => {
    const next = [...items, { id, message, kind }];
    if (next.length > MAX_TOASTS) next.shift();
    return next;
  });
  if (timeout) setTimeout(() => dismiss(id), timeout);
  return id;
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
