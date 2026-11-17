import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { JwtAuthGuard } from './jwt-auth.guard.js';

const jwt = {
  verify: (token: string) => {
    if (token !== 'good') throw new Error('bad');
    return { sub: '1' };
  },
};

function run(request: Record<string, unknown>) {
  const context = { switchToHttp: () => ({ getRequest: () => request }) };
  const guard = new JwtAuthGuard(jwt as never);
  return guard.canActivate(context as unknown as ExecutionContext);
}

describe('JwtAuthGuard', () => {
  it('accepts the session cookie', () => {
    expect(run({ headers: {}, cookies: { oum_token: 'good' } })).toBe(true);
  });

  it('accepts an Authorization Bearer token', () => {
    expect(run({ headers: { authorization: 'Bearer good' }, cookies: {} })).toBe(true);
  });

  it('rejects a missing or bad token', () => {
    expect(() => run({ headers: {}, cookies: {} })).toThrow(UnauthorizedException);
    expect(() => run({ headers: { authorization: 'Bearer nope' } })).toThrow(
      UnauthorizedException,
    );
    expect(() => run({ headers: { authorization: 'Basic good' } })).toThrow(
      UnauthorizedException,
    );
  });
});
