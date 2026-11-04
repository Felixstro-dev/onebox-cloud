import { fileTypeFromFile } from 'file-type';
import { mimeOf } from '../lib/names.js';

/**
 * Ermittelt den MIME-Typ anhand der Magic Bytes. Der vom Client gesendete
 * Typ oder die Dateiendung dient nur als Fallback, wenn das Format keine
 * Signatur besitzt (z. B. reiner Text).
 */
export async function resolveUploadMime(tempFile, declared, name) {
  const detected = await fileTypeFromFile(tempFile).catch(() => null);
  if (detected?.mime) return detected.mime;
  return declared || mimeOf(name);
}
