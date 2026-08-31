import crypto from 'node:crypto';

/**
 * Secret management primitives.
 * - Provider API keys and bot tokens are encrypted at rest (AES-256-GCM).
 * - Passwords use scrypt with per-password salt (no native deps required).
 * - UI helpers mask secrets; raw secrets are never logged.
 */

const ALGO = 'aes-256-gcm';

function keyFromHex(hex) {
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must decode to 32 bytes');
  return key;
}

/** Encrypt a secret; returns "v1:<iv>:<tag>:<ciphertext>" (all base64). */
export function encryptSecret(plaintext, encryptionKeyHex) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, keyFromHex(encryptionKeyHex), iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

/** Decrypt a value produced by encryptSecret. Throws on tamper (GCM tag). */
export function decryptSecret(payload, encryptionKeyHex) {
  const [version, ivB64, tagB64, ctB64] = String(payload).split(':');
  if (version !== 'v1') throw new Error('Unsupported secret version');
  const decipher = crypto.createDecipheriv(ALGO, keyFromHex(encryptionKeyHex), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
}

/** Mask a secret for display, e.g. "sk-…9f2a". Never returns usable material. */
export function maskSecret(secret) {
  const s = String(secret ?? '');
  if (!s) return '';
  if (s.length <= 8) return '••••';
  return `${s.slice(0, 3)}…${s.slice(-4)}`;
}

/** scrypt password hash -> "scrypt:<saltB64>:<hashB64>" */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt:${salt.toString('base64')}:${hash.toString('base64')}`;
}

/** Constant-time password verification. */
export function verifyPassword(password, stored) {
  try {
    const [scheme, saltB64, hashB64] = String(stored).split(':');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(String(password), salt, expected.length, { N: 16384, r: 8, p: 1 });
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function hmacSign(value, secret) {
  return crypto.createHmac('sha256', secret).update(String(value)).digest('base64url');
}

export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

// ---------------------------------------------------------------------------
// TOTP (RFC 6238) — dependency-free 2FA (spec §122)
// ---------------------------------------------------------------------------

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

/** Compute the TOTP for a given 30s time-step. */
export function totpCode(secret, timeStep = Math.floor(Date.now() / 30_000), digits = 6) {
  const key = base32Decode(secret);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.max(0, Math.floor(timeStep))));
  const h = crypto.createHmac('sha1', key).update(counter).digest();
  const off = h[h.length - 1] & 0xf;
  const code = (((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]) % 10 ** digits;
  return String(code).padStart(digits, '0');
}

/** Verify a TOTP with ±1 step clock drift tolerance. */
export function verifyTotp(secret, code, window = 1) {
  const step = Math.floor(Date.now() / 30_000);
  const target = String(code).replace(/\s/g, '');
  for (let i = -window; i <= window; i++) {
    if (safeEqual(totpCode(secret, step + i), target)) return true;
  }
  return false;
}
