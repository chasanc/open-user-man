import { describe, expect, it } from 'vitest';
import type { Request, Response } from 'express';
import { createRateLimitMiddleware, SlidingWindowLimiter } from './rate-limit.middleware.js';

function request(path: string, ip: string): Request {
  return { path, ip, socket: { remoteAddress: ip } } as Request;
}

function response() {
  const res = {
    statusCode: 200,
    body: '',
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(body: string) {
      this.body = body;
      return this;
    },
  };
  return res as typeof res & Response;
}

describe('SlidingWindowLimiter', () => {
  it('does not count rejected hits and frees the key after the window', () => {
    const limiter = new SlidingWindowLimiter(2, 1000);
    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('a', 100)).toBe(true);
    expect(limiter.allow('a', 200)).toBe(false);
    expect(limiter.allow('a', 1050)).toBe(true);
  });

  it('drops idle keys on sweep', () => {
    const limiter = new SlidingWindowLimiter(1, 1000);
    limiter.allow('a', 0);
    limiter.allow('b', 2000);
    expect((limiter as unknown as { hits: Map<string, number[]> }).hits.has('a')).toBe(false);
  });
});

describe('rate-limit middleware', () => {
  it('skips health and allows traffic when disabled', () => {
    const disabled = createRateLimitMiddleware({
      enabled: false,
      max: 1,
      windowSeconds: 60,
    });
    let nextCount = 0;
    disabled(request('/api/users', '10.0.0.1'), response(), () => {
      nextCount += 1;
    });
    expect(nextCount).toBe(1);

    const enabled = createRateLimitMiddleware({
      enabled: true,
      max: 1,
      windowSeconds: 60,
    });
    nextCount = 0;
    enabled(request('/api/health', '10.0.0.2'), response(), () => {
      nextCount += 1;
    });
    expect(nextCount).toBe(1);
  });

  it('returns 429 after the window max', () => {
    const middleware = createRateLimitMiddleware({
      enabled: true,
      max: 2,
      windowSeconds: 60,
    });
    const ip = `203.0.113.${Date.now() % 250}`;
    const res1 = response();
    const res2 = response();
    const res3 = response();
    let nextCount = 0;
    const next = () => {
      nextCount += 1;
    };
    middleware(request('/api/users', ip), res1, next);
    middleware(request('/api/users', ip), res2, next);
    middleware(request('/api/users', ip), res3, next);
    expect(nextCount).toBe(2);
    expect(res3.statusCode).toBe(429);
  });
});
