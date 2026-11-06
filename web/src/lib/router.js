import { writable } from 'svelte/store';

export function parse(pathname = window.location.pathname) {
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (!parts.length) return { name: 'dashboard', path: '/' };
  if (parts[0] === 's') return { name: 'public-share', token: parts[1], path: pathname };
  if (parts[0] === 'u') return { name: 'upload-request', token: parts[1], path: pathname };
  if (parts[0] === 'files') return parts[1] === 'trash' ? { name: 'trash', path: pathname } : { name: 'files', folderId: parts[1] || null, path: pathname };
  if (parts[0] === 'doc') return { name: 'doc', docId: parts[1] || null, path: pathname };
  if (['shared', 'photos', 'chat', 'backups', 'storage', 'users', 'settings', 'login', 'setup'].includes(parts[0])) return { name: parts[0], path: pathname };
  return { name: 'not-found', path: pathname };
}

export const route = writable(parse());

export function navigate(path, { replace = false } = {}) {
  if (replace) window.history.replaceState({}, '', path);
  else window.history.pushState({}, '', path);
  route.set(parse(path));
  window.scrollTo({ top: 0 });
}

export function startRouter() {
  window.addEventListener('popstate', () => route.set(parse()));
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-route]');
    if (!link) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    navigate(link.getAttribute('href'));
  });
}
