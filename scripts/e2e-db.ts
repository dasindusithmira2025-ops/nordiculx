import './load-env';
import { execFileSync } from 'node:child_process';
import { Redis } from 'ioredis';
import postgres from 'postgres';

/**
 * Builds the end-to-end database.
 *
 * The suite buys real products and places real orders. Pointed at the
 * operating database it would permanently drain catalogue stock and file test
 * orders into the business's own order history, so E2E gets a database of its
 * own: same migrations, same real catalogue import, same seeded content — a
 * faithful copy nothing outside the suite reads.
 *
 * Runs as part of the Playwright web-server command, because the dev server
 * needs the database to exist before it boots.
 *
 *   npx tsx scripts/e2e-db.ts        rebuild
 *   E2E_REUSE_DB=1 npx tsx …         keep the existing one
 */
export const E2E_DATABASE = 'nordiclux_e2e';

/** Swaps the database name on the configured connection string. */
export function e2eDatabaseUrl(base = process.env.DATABASE_URL ?? '') {
  const url = new URL(base);
  url.pathname = `/${E2E_DATABASE}`;
  return url.toString();
}

function run(args: string[], databaseUrl: string) {
  execFileSync('npm', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'development' },
  });
}

export async function buildE2eDatabase() {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL is not set.');
  const databaseUrl = e2eDatabaseUrl(base);

  if (process.env.E2E_REUSE_DB === '1') return databaseUrl;

  // `postgres` is the maintenance database: DROP DATABASE cannot run from
  // inside the database being dropped.
  const admin = new URL(base);
  admin.pathname = '/postgres';
  const client = postgres(admin.toString(), { max: 1 });
  try {
    await client.unsafe(
      `DROP DATABASE IF EXISTS "${E2E_DATABASE}" WITH (FORCE)`,
    );
    await client.unsafe(`CREATE DATABASE "${E2E_DATABASE}"`);
  } finally {
    await client.end();
  }

  // Reuses the shipped scripts rather than a second setup path that can drift.
  run(['run', 'db:migrate'], databaseUrl);
  run(['run', 'db:seed', '--', '--no-demo-catalogue'], databaseUrl);
  run(['run', 'migrate:catalogue'], databaseUrl);
  run(['run', 'routine:rules'], databaseUrl);
  // Order history built from the real catalogue: the returns and review flows
  // both need a delivered order that points at a product that exists.
  run(['run', 'seed:sample-orders'], databaseUrl);

  // The real catalogue ships one or two units of most SKUs. A suite that buys
  // on every run would exhaust that within minutes, so this copy is topped up.
  // Genuinely out-of-stock SKUs stay at zero so that state stays reachable.
  const seeded = postgres(databaseUrl, { max: 1 });
  try {
    await seeded`UPDATE inventory_items SET on_hand = 500 WHERE on_hand > 0`;
  } finally {
    await seeded.end();
  }

  await clearRateLimits();
  return databaseUrl;
}

/**
 * Every request in the suite arrives from the same loopback address, so a full
 * run spends a real share of the checkout and login buckets. Clearing them
 * between runs keeps the limits themselves at their production values.
 */
async function clearRateLimits() {
  if (!process.env.REDIS_URL) return;
  const redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
  try {
    await redis.connect();
    const keys = await redis.keys('rl:*');
    if (keys.length) await redis.del(...keys);
  } catch {
    // No cache running: the app falls back to its in-process limiter, which
    // starts empty with the dev server anyway.
  } finally {
    redis.disconnect();
  }
}

// `import.meta.main` is true only when this file is the entry point, so the
// config can import `e2eDatabaseUrl` without building anything.
if (import.meta.main) await buildE2eDatabase();
