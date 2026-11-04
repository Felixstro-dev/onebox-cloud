import crypto from 'node:crypto';

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

export function id(size = 20) {
  const bytes = crypto.randomBytes(size);
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte & 31];
  return out;
}

export function token(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hashToken(value) {
  return sha256(`onebox:${value}`);
}

export function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function publicToken(prefix) {
  return prefix.slice(0, 6);
}
