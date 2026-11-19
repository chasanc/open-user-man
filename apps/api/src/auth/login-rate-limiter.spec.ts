import { describe, expect, it } from 'vitest';
import { LoginRateLimiter } from './login-rate-limiter.js';

const config = (max: number) =>
  ({ getOrThrow: (key: string) => (key === 'loginRateLimitMax' ? max : 60) }) as never;

describe('LoginRateLimiter', () => {
  it('blocks an IP after max attempts regardless of user name', () => {
    const limiter = new LoginRateLimiter(config(2));
    expect(limiter.allow('1.1.1.1', 'a')).toBe(true);
    expect(limiter.allow('1.1.1.1', 'b')).toBe(true);
    expect(limiter.allow('1.1.1.1', 'c')).toBe(false);
  });

  it('blocks a user name across IPs, case-insensitively', () => {
    const limiter = new LoginRateLimiter(config(2));
    expect(limiter.allow('1.1.1.1', 'Admin')).toBe(true);
    expect(limiter.allow('2.2.2.2', 'admin')).toBe(true);
    expect(limiter.allow('3.3.3.3', 'ADMIN')).toBe(false);
  });

  it('is off when max is 0', () => {
    const limiter = new LoginRateLimiter(config(0));
    for (let i = 0; i < 50; i += 1) expect(limiter.allow('1.1.1.1', 'a')).toBe(true);
    limiter.tokenFailed('1.1.1.1');
    expect(limiter.tokenBlocked('1.1.1.1')).toBe(false);
  });

  it('blocks an IP at the token endpoint only after max failures, not before', () => {
    const limiter = new LoginRateLimiter(config(2));
    expect(limiter.tokenBlocked('1.1.1.1')).toBe(false);
    limiter.tokenFailed('1.1.1.1');
    expect(limiter.tokenBlocked('1.1.1.1')).toBe(false);
    limiter.tokenFailed('1.1.1.1');
    expect(limiter.tokenBlocked('1.1.1.1')).toBe(true);
    expect(limiter.tokenBlocked('2.2.2.2')).toBe(false);
    expect(limiter.allow('1.1.1.1', 'a')).toBe(true); // sign-in budget is separate
  });
});
