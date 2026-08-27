import 'server-only';
import Redis from 'ioredis';
import { env, isProduction } from '@/lib/env';

/**
 * Valkey/Redis client.
 *
 * Entirely optional: without REDIS_URL the app runs with an in-process cache
 * and in-process rate limiting. Every caller must therefore handle `null`.
 *
 * The connection never retries forever — a cache outage should degrade the
 * features that use it, not hang requests waiting for a socket.
 */

const globalForRedis = globalThis as unknown as {
  __nordicluxRedis?: Redis | null;
};

function create(): Redis | null {
  if (!env.REDIS_URL) return null;

  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    connectTimeout: 2000,
    lazyConnect: false,
    retryStrategy: (attempt) => Math.min(attempt * 200, 3000),
  });

  client.on('error', (error) => {
    // Logged once per error type by ioredis' own backoff; do not crash.
    console.error('[redis] connection error:', error.message);
  });

  return client;
}

export function getRedis(): Redis | null {
  if (globalForRedis.__nordicluxRedis === undefined) {
    globalForRedis.__nordicluxRedis = create();
  }
  return globalForRedis.__nordicluxRedis;
}

/** Reads a cached JSON value, returning null on miss or any cache failure. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Writes a cached JSON value. Failures are swallowed — the cache is advisory. */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
) {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // Ignored deliberately.
  }
}

/** Invalidates keys by prefix. Uses SCAN, never KEYS, which blocks the server. */
export async function cacheInvalidate(prefix: string) {
  const redis = getRedis();
  if (!redis) return;
  try {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(
        cursor,
        'MATCH',
        `${prefix}*`,
        'COUNT',
        200,
      );
      cursor = next;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== '0');
  } catch {
    // Ignored deliberately.
  }
}

export const cacheIsEnabled = Boolean(env.REDIS_URL);
export const cacheRequiredInProduction = isProduction;
