import "server-only";
import { Redis } from "@upstash/redis";
import { getEnv } from "@/lib/env";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
}

export interface RateLimiter {
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}

/** Fixed-window counter backed by Upstash Redis (serverless-safe, works across instances). */
class RedisRateLimiter implements RateLimiter {
  constructor(private readonly redis: Redis) {}

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const windowKey = `ratelimit:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
    const count = await this.redis.incr(windowKey);
    if (count === 1) {
      await this.redis.expire(windowKey, windowSeconds);
    }
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetSeconds: windowSeconds,
    };
  }
}

/**
 * In-memory fallback used only when REDIS_URL/REDIS_TOKEN are not configured
 * (local development). Not safe across multiple instances — never used in production,
 * where REDIS_URL is required by scripts/verify-env.ts's production checks.
 */
class InMemoryRateLimiter implements RateLimiter {
  private counters = new Map<string, { count: number; resetAt: number }>();

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const now = Date.now();
    const existing = this.counters.get(key);
    if (!existing || existing.resetAt < now) {
      this.counters.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return { allowed: true, remaining: limit - 1, resetSeconds: windowSeconds };
    }
    existing.count += 1;
    return {
      allowed: existing.count <= limit,
      remaining: Math.max(0, limit - existing.count),
      resetSeconds: Math.ceil((existing.resetAt - now) / 1000),
    };
  }
}

let cached: RateLimiter | undefined;

export function getRateLimiter(): RateLimiter {
  if (cached) return cached;
  const env = getEnv();
  if (env.REDIS_URL && env.REDIS_TOKEN) {
    cached = new RedisRateLimiter(new Redis({ url: env.REDIS_URL, token: env.REDIS_TOKEN }));
  } else {
    if (env.APP_ENV === "production") {
      console.warn(
        "REDIS_URL/REDIS_TOKEN no configurados en producción: usando rate limiter en memoria (no válido entre instancias).",
      );
    }
    cached = new InMemoryRateLimiter();
  }
  return cached;
}
