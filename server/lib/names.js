import { sanitizeName } from './paths.js';

export function cleanName(value, fallback = 'Untitled') {
  return sanitizeName(value, fallback);
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
  return typeof mime === 'string' && mime.startsWith('image/') && mime !== 'image/svg+xml';
}

// Inline-Auslieferung nur für Typen, die im Browser keinen Code im
// Hauptorigin ausführen können. SVG und HTML sind bewusst nicht enthalten.
const INLINE_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif',
  'application/pdf',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/mp4', 'audio/webm',
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
]);

export function canInline(mime) {
  return INLINE_MIME.has(mime);
}

export function safeInlineMime(mime) {
  return canInline(mime) ? mime : 'application/octet-stream';
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${value >= 10 || exp === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exp]}`;
}
