import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

// RFC 6238 TOTP (SHA-1, 6 digits, 30 s), the profile every authenticator app supports.
export const STEP_SECONDS = 30;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return bits > 0 ? out + ALPHABET[(value << (5 - bits)) & 31] : out;
}

export const stepAt = (ms: number): number => Math.floor(ms / 1000 / STEP_SECONDS);

/** The 6-digit code for one 30 s step. */
export function codeFor(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', secret).update(counter).digest();
  const at = mac[mac.length - 1] & 15;
  const binary = mac.readUInt32BE(at) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, '0');
}

/**
 * The step the code belongs to, looking one step either side for clock drift, or null.
 * Steps at or below `lastStep` are refused, so a code (even one seen by someone else) works once.
 */
export function matchStep(secret: Buffer, code: string, nowMs: number, lastStep: number): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = stepAt(nowMs);
  let found: number | null = null;
  // Check every candidate (no early exit) so timing does not say which step matched.
  for (const step of [now - 1, now, now + 1]) {
    if (step > lastStep && codeFor(secret, step) === code) found = step;
  }
  return found;
}

const TAG_BYTES = 16;

const keyOf = (secret: string): Buffer => createHash('sha256').update(secret).digest();

/** AES-256-GCM; the result is `iv.tag.ciphertext` in base64url. */
export function encryptSecret(plain: Buffer, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyOf(secret), iv, { authTagLength: TAG_BYTES });
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString('base64url')).join('.');
}

export function decryptSecret(blob: string, secret: string): Buffer {
  const [iv, tag, body] = blob.split('.').map((part) => Buffer.from(part, 'base64url'));
  if (!iv || !tag || !body || tag.length !== TAG_BYTES) throw new Error('Stored secret is malformed');
  const decipher = createDecipheriv('aes-256-gcm', keyOf(secret), iv, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

/** Ten single-use codes like `k3m9x-7qd2p`. Shown once; only their digests are kept. */
export function newRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(8).toString('hex').slice(0, 10);
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

/** Digest of a recovery code as typed: case, dashes and spaces do not matter. */
export const hashRecovery = (code: string): string =>
  createHash('sha256').update(code.toLowerCase().replace(/[\s-]/g, '')).digest('hex');
