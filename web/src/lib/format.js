export function bytes(value, precision = 1) {
  const n = Number(value) || 0;
  if (n < 1) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exp = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const amount = n / 1024 ** exp;
  return `${amount >= 10 || exp === 0 ? amount.toFixed(0) : amount.toFixed(precision)} ${units[exp]}`;
}

export function shortDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function dateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

export function relative(value) {
  if (!value) return '—';
  const diff = Date.now() - Number(value);
  const minute = 60000;
  if (diff < minute) return 'gerade eben';
  if (diff < 3600000) return `vor ${Math.floor(diff / minute)} Min.`;
  if (diff < 86400000) return `vor ${Math.floor(diff / 3600000)} Std.`;
  if (diff < 7 * 86400000) return `vor ${Math.floor(diff / 86400000)} Tg.`;
  return shortDate(value);
}

export function dayKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dayLabel(value) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (dayKey(date) === dayKey(today)) return 'Heute';
  if (dayKey(date) === dayKey(yesterday)) return 'Gestern';
  return date.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export function time(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export function fileKind(node) {
  if (!node) return 'file';
  if (node.kind === 'folder') return 'folder';
  if (node.isImage) return 'image';
  if (node.isVideo) return 'video';
  if ((node.mime || '').startsWith('audio/')) return 'audio';
  if ((node.mime || '').includes('pdf')) return 'pdf';
  if ((node.mime || '').startsWith('text/') || /\.(md|txt|csv|json)$/i.test(node.name || '')) return 'text';
  if (/\.(zip|tar|gz|7z|rar)$/i.test(node.name || '')) return 'archive';
  return 'file';
}

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

export function plural(count, one, many) {
  return count === 1 ? one : many;
}
