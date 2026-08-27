import 'server-only';
import { headers } from 'next/headers';
import { env } from '@/lib/env';
import { clientIp } from '@/lib/auth/session';
import { getRedis } from '@/lib/redis';

/**
 * Fixed-window rate limiting.
 *
 * Backed by Valkey/Redis when REDIS_URL is configured, so limits hold across
 * restarts and across multiple app instances. Without it, an in-process map is
 * used — correct for a single dev process, and explicitly NOT sufficient in
 * production (docs/SECURITY.md § Rate limiting).
 *
 * A fixed window can allow up to 2x the limit across a window boundary. That
 * is an accepted trade for the simplicity; the limits below are set low enough
 * that the burst is still harmless.
 *
 * ponytail: fixed window, swap to a sliding log if boundary bursts ever matter.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Seconds until the current window resets. */
  resetIn: number;
};

type Options = {
  /** Maximum requests permitted in the window. */
  limit: number;
  windowSeconds: number;
  /**
   * Extra identity beyond the IP — an email on a login form, a user id on an
   * authenticated action. Prevents one attacker from exhausting the bucket for
   * everybody behind the same NAT.
   */
  key?: string;
};

/** In-process fallback. Entries are pruned lazily on access. */
const memory = new Map<string, { count: number; expiresAt: number }>();

function memoryLimit(bucket: string, options: Options): RateLimitResult {
  const now = Date.now();
  const existing = memory.get(bucket);

  if (!existing || existing.expiresAt <= now) {
    memory.set(bucket, {
      count: 1,
      expiresAt: now + options.windowSeconds * 1000,
    });
    // Opportunistic sweep so the map cannot grow without bound.
    if (memory.size > 5000) {
      for (const [k, v] of memory) if (v.expiresAt <= now) memory.delete(k);
    }
    return {
      allowed: true,
      remaining: options.limit - 1,
      resetIn: options.windowSeconds,
    };
  }

  existing.count += 1;
  return {
    allowed: existing.count <= options.limit,
    remaining: Math.max(0, options.limit - existing.count),
    resetIn: Math.ceil((existing.expiresAt - now) / 1000),
  };
}

export async function rateLimit(
  action: string,
  options: Options,
): Promise<RateLimitResult> {
  const headerList = await headers();
  const ip = clientIp(headerList) ?? 'unknown';
  const bucket = `rl:${action}:${options.key ?? ''}:${ip}`;

  const redis = getRedis();
  if (!redis) return memoryLimit(bucket, options);

  try {
    // INCR then EXPIRE only on first hit: the window starts with the first
    // request and does not slide forward as the attacker keeps knocking.
    const count = await redis.incr(bucket);
    if (count === 1) {
      await redis.expire(bucket, options.windowSeconds);
    }
    const ttl = await redis.ttl(bucket);
    return {
      allowed: count <= options.limit,
      remaining: Math.max(0, options.limit - count),
      resetIn: ttl > 0 ? ttl : options.windowSeconds,
    };
  } catch {
    // A cache outage must not take authentication offline. Degrade to the
    // in-process limiter rather than failing the request.
    return memoryLimit(bucket, options);
  }
}

/** Clears a bucket — called after a successful login so honest users reset. */
export async function clearRateLimit(action: string, key?: string) {
  const headerList = await headers();
  const ip = clientIp(headerList) ?? 'unknown';
  const bucket = `rl:${action}:${key ?? ''}:${ip}`;
  memory.delete(bucket);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(bucket);
    } catch {
      // Nothing to do; the window will expire on its own.
    }
  }
}

/** Whether limits are durable. Surfaced on the admin health page. */
export const rateLimitIsDurable = Boolean(env.REDIS_URL);
