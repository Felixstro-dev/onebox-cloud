import crypto from 'node:crypto';

/**
 * Minimaler TOTP-Implementierung nach RFC 6238 (SHA-1, 6 Stellen,
 * 30-Sekunden-Schritt). Keine zusätzliche Abhängigkeit nötig.
 */

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input) {
  const clean = String(input || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

export function hotp(secret, counter) {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

export function counterFor(now = Date.now(), stepMs = 30_000) {
  return Math.floor(now / stepMs);
}

/**
 * Prüft einen Code mit ±1 Zeitschritt Toleranz. Gibt den verwendeten
 * Zähler zurück, damit ein Code nicht wiederverwendet werden kann.
 */
export function verifyTotp(secret, code, { now = Date.now(), window = 1 } = {}) {
  const token = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(token)) return null;
  const counter = counterFor(now);
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = hotp(secret, counter + offset);
    const left = Buffer.from(candidate);
    const right = Buffer.from(token);
    if (left.length === right.length && crypto.timingSafeEqual(left, right)) return counter + offset;
  }
  return null;
}

export function otpauthUrl(secret, account, issuer = 'Onebox') {
  const label = `${issuer}:${account}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function recoveryCode() {
  const bytes = crypto.randomBytes(10);
  let raw = '';
  for (const byte of bytes) raw += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length];
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

export function hashRecoveryCode(code) {
  return crypto.createHash('sha256').update(`onebox-recovery:${String(code).trim().toUpperCase()}`).digest('hex');
}

export function matchRecoveryCode(code, hashes) {
  const wanted = Buffer.from(hashRecoveryCode(code));
  let matched = null;
  for (const stored of hashes) {
    const candidate = Buffer.from(String(stored));
    if (candidate.length === wanted.length && crypto.timingSafeEqual(candidate, wanted)) matched = stored;
  }
  return matched;
}
