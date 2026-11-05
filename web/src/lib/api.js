import { notify } from './stores.js';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function headers(extra = {}) {
  return { 'x-onebox-csrf': '1', ...extra };
}

export async function api(method, path, body = undefined, { access = null, raw = false } = {}) {
  const options = { method, credentials: 'same-origin', headers: headers() };
  if (body !== undefined && !(body instanceof FormData)) {
    options.headers['content-type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  if (access) options.headers['x-share-access'] = access;
  const response = await fetch(path, options);
  if (response.status === 204) return null;
  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/v1/auth') && !path.startsWith('/api/v1/public')) {
      window.dispatchEvent(new CustomEvent('onebox:unauthorized'));
    }
    if (response.status === 503 && data?.error?.code === 'maintenance' && !window.location.pathname.startsWith('/maintenance')) {
      window.location.assign('/maintenance');
    }
    const message = data?.error?.message || response.statusText || 'Die Anfrage ist fehlgeschlagen.';
    notify(message, 'error');
    throw new ApiError(response.status, data?.error?.code || 'error', message, data?.error?.details);
  }
  return data;
}

export const get = (path, opts) => api('GET', path, undefined, opts);
export const post = (path, body, opts) => api('POST', path, body, opts);
export const patch = (path, body, opts) => api('PATCH', path, body, opts);
export const put = (path, body, opts) => api('PUT', path, body, opts);
export const del = (path, opts) => api('DELETE', path, undefined, opts);

export function createUpload({ name, size, mime, parentId, sessionId }) {
  return post('/api/v1/uploads', { name, size, mime, parentId, sessionId });
}

export function headUpload(id) {
  return fetch(`/api/v1/uploads/${id}`, { method: 'HEAD', credentials: 'same-origin' }).then((response) => ({
    offset: Number(response.headers.get('upload-offset') || 0),
    size: Number(response.headers.get('upload-length') || 0),
    ok: response.ok,
  }));
}

export function patchUpload(id, offset, chunk, { onProgress, onXhr } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PATCH', `/api/v1/uploads/${id}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('x-onebox-csrf', '1');
    xhr.setRequestHeader('content-type', 'application/offset+octet-stream');
    xhr.setRequestHeader('Tus-Resumable', '1.0.0');
    xhr.setRequestHeader('upload-offset', String(offset));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded);
    };
    onXhr?.(xhr);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve({ offset: offset + chunk.size });
        }
      } else {
        let message = 'Upload failed.';
        try { message = JSON.parse(xhr.responseText).error.message; } catch {}
        reject(new ApiError(xhr.status, 'upload_failed', message));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, 'network', 'The connection dropped.'));
    xhr.onabort = () => reject(Object.assign(new Error('aborted'), { aborted: true }));
    xhr.send(chunk);
  });
}

export function completeUpload(id, { conflict = 'keepBoth' } = {}) {
  return post(`/api/v1/uploads/${id}/complete`, { conflict });
}

export function cancelUpload(id) {
  return del(`/api/v1/uploads/${id}`);
}

export function publicShare(token, { access = null } = {}) {
  return get(`/api/v1/public/shares/${encodeURIComponent(token)}`, { access });
}
