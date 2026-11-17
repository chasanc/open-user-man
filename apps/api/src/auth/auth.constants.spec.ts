import { authCookieOptions, jwtExpiresInSeconds } from './auth.constants.js';

describe('jwtExpiresInSeconds', () => {
  it('parses day hour minute second suffixes', () => {
    expect(jwtExpiresInSeconds('1d')).toBe(86_400);
    expect(jwtExpiresInSeconds('2h')).toBe(7_200);
    expect(jwtExpiresInSeconds('30m')).toBe(1_800);
    expect(jwtExpiresInSeconds('15s')).toBe(15);
  });

  it('rejects a missing or unparseable duration', () => {
    expect(() => jwtExpiresInSeconds(undefined)).toThrow(/JWT_EXPIRES_IN/);
    expect(() => jwtExpiresInSeconds('nope')).toThrow(/JWT_EXPIRES_IN/);
  });
});

describe('authCookieOptions', () => {
  it('keeps the session cookie httpOnly and not Secure unless asked', () => {
    expect(authCookieOptions(false)).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
    });
    expect(authCookieOptions(true).secure).toBe(true);
  });
});
