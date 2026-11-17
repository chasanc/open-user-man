import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SlidingWindowLimiter } from '../http/rate-limit.middleware.js';

/** Caps login attempts per IP and per user name. Always on, unlike the global limiter. */
@Injectable()
export class LoginRateLimiter {
  private readonly limiter: SlidingWindowLimiter | null;

  constructor(config: ConfigService) {
    const max = config.getOrThrow<number>('loginRateLimitMax');
    const windowMs = config.getOrThrow<number>('rateLimitWindowSeconds') * 1000;
    this.limiter = max > 0 ? new SlidingWindowLimiter(max, windowMs) : null;
  }

  /** Counts the attempt before any argon2 work, so a parallel burst is cut early. */
  allow(ip: string, userName: string): boolean {
    if (!this.limiter) return true;
    const ipOk = this.limiter.allow(`ip:${ip}`);
    const name = userName.trim().toLowerCase();
    const userOk = name === '' || this.limiter.allow(`user:${name}`);
    return ipOk && userOk;
  }
}
