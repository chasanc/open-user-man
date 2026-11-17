import type { NextFunction, Request, Response } from 'express';

/** Fixed per-key budget over a sliding window. Rejected hits are not recorded. */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();
  private sweptAt = 0;

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    this.sweep(now);
    const bucket = (this.hits.get(key) ?? []).filter((ts) => now - ts < this.windowMs);
    const ok = bucket.length < this.max;
    if (ok) bucket.push(now);
    this.hits.set(key, bucket);
    return ok;
  }

  // Drop idle keys once per window so the map cannot grow with every IP ever seen.
  private sweep(now: number): void {
    if (now - this.sweptAt < this.windowMs) return;
    this.sweptAt = now;
    for (const [key, bucket] of this.hits) {
      const last = bucket[bucket.length - 1];
      if (last === undefined || now - last >= this.windowMs) this.hits.delete(key);
    }
  }
}

export function createRateLimitMiddleware(options: {
  enabled: boolean;
  max: number;
  windowSeconds: number;
}) {
  const limiter = new SlidingWindowLimiter(options.max, options.windowSeconds * 1000);
  return (req: Request, res: Response, next: NextFunction) => {
    if (!options.enabled) {
      next();
      return;
    }
    if (req.path === '/health' || req.path === '/api/health') {
      next();
      return;
    }
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (!limiter.allow(ip)) {
      res.status(429).send('Rate limit exceeded');
      return;
    }
    next();
  };
}
