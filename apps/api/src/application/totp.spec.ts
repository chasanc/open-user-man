import {
  base32,
  codeFor,
  decryptSecret,
  encryptSecret,
  hashRecovery,
  matchStep,
  newRecoveryCodes,
  stepAt,
} from './totp.js';

// RFC 6238 appendix B, SHA-1 secret "12345678901234567890"; the 6 digits are the last 6 of the 8-digit vectors.
const rfcSecret = Buffer.from('12345678901234567890');

describe('totp', () => {
  it('matches the RFC 6238 test vectors', () => {
    expect(codeFor(rfcSecret, stepAt(59_000))).toBe('287082');
    expect(codeFor(rfcSecret, stepAt(1_111_111_109_000))).toBe('081804');
    expect(codeFor(rfcSecret, stepAt(2_000_000_000_000))).toBe('279037');
  });

  it('encodes base32 like RFC 4648', () => {
    expect(base32(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
  });

  it('accepts the current and neighbouring steps, rejects others and wrong shapes', () => {
    const now = 1_700_000_000_000;
    const step = stepAt(now);
    expect(matchStep(rfcSecret, codeFor(rfcSecret, step), now, 0)).toBe(step);
    expect(matchStep(rfcSecret, codeFor(rfcSecret, step - 1), now, 0)).toBe(step - 1);
    expect(matchStep(rfcSecret, codeFor(rfcSecret, step + 1), now, 0)).toBe(step + 1);
    expect(matchStep(rfcSecret, codeFor(rfcSecret, step - 2), now, 0)).toBeNull();
    expect(matchStep(rfcSecret, '12345', now, 0)).toBeNull();
    expect(matchStep(rfcSecret, 'abcdef', now, 0)).toBeNull();
  });

  it('refuses a code whose step was already used (replay)', () => {
    const now = 1_700_000_000_000;
    const step = stepAt(now);
    const code = codeFor(rfcSecret, step);
    expect(matchStep(rfcSecret, code, now, step)).toBeNull();
    expect(matchStep(rfcSecret, codeFor(rfcSecret, step - 1), now, step)).toBeNull();
  });

  it('round-trips an encrypted secret and fails with the wrong key or a damaged blob', () => {
    const key = 'k'.repeat(32);
    const blob = encryptSecret(rfcSecret, key);
    expect(decryptSecret(blob, key).equals(rfcSecret)).toBe(true);
    expect(() => decryptSecret(blob, 'x'.repeat(32))).toThrow();
    expect(() => decryptSecret(`${blob}A`, key)).toThrow();
    expect(() => decryptSecret('nonsense', key)).toThrow();
  });

  it('makes ten distinct recovery codes whose digest ignores case, dashes and spaces', () => {
    const codes = newRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[0-9a-f]{5}-[0-9a-f]{5}$/);
    expect(hashRecovery(codes[0].toUpperCase())).toBe(hashRecovery(codes[0]));
    expect(hashRecovery(codes[0].replace('-', ' '))).toBe(hashRecovery(codes[0]));
    expect(hashRecovery(codes[0])).not.toBe(hashRecovery(codes[1]));
  });
});
