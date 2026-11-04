import path from 'node:path';
import { badRequest } from './errors.js';

/**
 * Zentrale Pfad- und Namenssicherheit.
 *
 * Nutzereingaben werden nie direkt als Dateisystempfad verwendet. Namen
 * werden bereinigt, Pfade immer über `safeJoin` aufgelöst und gegen den
 * erlaubten Wurzelordner geprüft. So kann kein `../`, kein Null-Byte und
 * kein absoluter Pfad aus dem Speicherbereich ausbrechen.
 */

const MAX_NAME_LENGTH = 255;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
// Steuerzeichen, Null-Bytes sowie beide Verzeichnistrenner.
const INVALID_CHARS = /[\u0000-\u001f\u007f/\\]/;

export function isSafeName(value) {
  if (typeof value !== 'string') return false;
  const name = value.normalize('NFC').trim();
  if (!name || name.length > MAX_NAME_LENGTH) return false;
  if (name === '.' || name === '..') return false;
  if (INVALID_CHARS.test(name)) return false;
  if (RESERVED.test(name)) return false;
  return true;
}

/**
 * Für vom Nutzer übergebene Namen, die exakt gespeichert werden sollen.
 * Wirft statt still zu bereinigen.
 */
export function assertSafeName(value, label = 'Name') {
  if (typeof value !== 'string' || !value.trim()) throw badRequest(`${label} darf nicht leer sein.`);
  if (value.length > MAX_NAME_LENGTH) throw badRequest(`${label} ist zu lang (maximal ${MAX_NAME_LENGTH} Zeichen).`);
  if (INVALID_CHARS.test(value)) throw badRequest(`${label} enthält ungültige Zeichen.`);
  if (value.trim() === '.' || value.trim() === '..') throw badRequest(`${label} ist nicht erlaubt.`);
  if (RESERVED.test(value.trim())) throw badRequest(`${label} ist ein reservierter Name.`);
  return value.normalize('NFC').trim();
}

/**
 * Bereinigt interne Namen (z. B. aus ZIP-Einträgen), ohne zu werfen.
 * Reservierte Windows-Gerätenamen werden entschärft, damit Namen auch auf
 * externen Volumes sicher bleiben.
 */
export function sanitizeName(value, fallback = 'Untitled') {
  if (typeof value !== 'string') return fallback;
  let name = value.normalize('NFC').trim();
  if (!name) return fallback;
  name = name.replace(INVALID_CHARS, ' ').replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH).trim();
  if (!name || name === '.' || name === '..') return fallback;
  if (RESERVED.test(name)) name = `_${name}`;
  return name;
}

/**
 * Prüft, ob ein einzelnes Pfadsegment sicher ist. `..`, `.`, leere Segmente,
 * absolute Pfade und Null-Bytes werden abgelehnt.
 */
export function assertSafeSegment(segment, label = 'Pfad') {
  if (typeof segment !== 'string' || !segment) throw badRequest(`${label} enthält ein leeres Segment.`);
  if (segment === '.' || segment === '..') throw badRequest(`${label} enthält "..".`);
  if (INVALID_CHARS.test(segment)) throw badRequest(`${label} enthält ungültige Zeichen.`);
  if (segment.length > MAX_NAME_LENGTH) throw badRequest(`${label} enthält ein zu langes Segment.`);
  return segment;
}

/**
 * Wandelt einen relativen Pfad (z. B. aus einem ZIP oder einer Freigabe) in
 * sichere Segmente um.
 */
export function safeSegments(value, label = 'Pfad') {
  const raw = String(value ?? '');
  if (raw.includes('\u0000')) throw badRequest(`${label} enthält ein Null-Byte.`);
  const normalized = raw.replaceAll('\\', '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    throw badRequest(`${label} darf nicht absolut sein.`);
  }
  return normalized
    .split('/')
    .filter((part) => part && part !== '.')
    .map((part) => assertSafeSegment(part, label));
}

/**
 * Löst einen Pfad unterhalb von `root` auf und stellt sicher, dass das
 * Ergebnis den Wurzelordner nicht verlässt. `startsWith` wird mit
 * Pfadtrenner geprüft, damit `/data/files2` nicht als Kind von `/data/files`
 * durchgeht.
 */
export function safeJoin(root, ...parts) {
  const base = path.resolve(root);
  const target = path.resolve(base, ...parts.map((part) => String(part)));
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw badRequest('Der Pfad liegt außerhalb des erlaubten Speicherbereichs.');
  }
  return target;
}

export function isInside(root, target) {
  const base = path.resolve(root);
  const resolved = path.resolve(target);
  return resolved === base || resolved.startsWith(base + path.sep);
}

export { MAX_NAME_LENGTH, RESERVED };
