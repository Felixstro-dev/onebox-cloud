const invalid = /[\u0000-\u001f\u007f/\\]/;

export function cleanName(value, fallback = 'Untitled') {
  if (typeof value !== 'string') return fallback;
  let name = value.normalize('NFC').trim();
  if (!name) return fallback;
  name = name.replace(invalid, ' ').replace(/\s+/g, ' ').slice(0, 255).trim();
  if (name === '.' || name === '..') return fallback;
  return name;
}

export function nameKey(name) {
  return name.toLocaleLowerCase('de');
}

export function extOf(name) {
  const match = /\.([a-z0-9]{1,12})$/i.exec(name);
  return match ? match[1].toLowerCase() : '';
}

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  avif: 'image/avif', heic: 'image/heic', heif: 'image/heif', svg: 'image/svg+xml',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
  json: 'application/json', html: 'text/html', css: 'text/css', js: 'text/javascript',
  zip: 'application/zip', tar: 'application/x-tar', gz: 'application/gzip',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export function mimeOf(name) {
  return MIME[extOf(name)] || 'application/octet-stream';
}

export function isImage(mime) {
  return typeof mime === 'string' && mime.startsWith('image/');
}

export function safeInlineMime(mime) {
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'application/pdf', 'text/plain', 'video/mp4', 'video/webm']);
  return allowed.has(mime) ? mime : 'application/octet-stream';
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${value >= 10 || exp === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exp]}`;
}
