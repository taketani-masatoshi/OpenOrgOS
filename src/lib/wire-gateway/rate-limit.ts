export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec?: number;
}

export class RateLimiter {
  private readonly limitPerMin: number;
  private readonly buckets = new Map<string, { count: number; windowStartMs: number }>();

  constructor(limitPerMin: number) {
    this.limitPerMin = limitPerMin;
  }

  check(key: string, nowMs = Date.now()): RateLimitResult {
    const windowMs = 60_000;
    const bucket = this.buckets.get(key);
    if (!bucket || nowMs - bucket.windowStartMs >= windowMs) {
      this.buckets.set(key, { count: 1, windowStartMs: nowMs });
      return { allowed: true };
    }

    if (bucket.count >= this.limitPerMin) {
      const retryAfterSec = Math.ceil((windowMs - (nowMs - bucket.windowStartMs)) / 1000);
      return { allowed: false, retryAfterSec };
    }

    bucket.count += 1;
    return { allowed: true };
  }
}
