import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env, isProduction } from '@/lib/env';
import * as schema from './schema';

/**
 * Database client.
 *
 * A single pooled connection is reused across hot reloads in development —
 * without the global cache, every edit would open a new pool and exhaust
 * Postgres' connection limit within a few minutes of work.
 */

const globalForDb = globalThis as unknown as {
  __nordicluxSql?: ReturnType<typeof postgres>;
};

function createClient() {
  return postgres(env.DATABASE_URL, {
    max: env.DATABASE_POOL_MAX,
    // Postgres closes idle connections; reconnecting is cheaper than holding.
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    // `transform: undefined` keeps drizzle in charge of column naming.
    onnotice: isProduction ? () => {} : undefined,
  });
}

export const sql = globalForDb.__nordicluxSql ?? createClient();
if (!isProduction) globalForDb.__nordicluxSql = sql;

export const db = drizzle(sql, {
  schema,
  casing: 'snake_case',
  logger: process.env.DB_LOG === 'true',
});

export type Database = typeof db;

/**
 * Transaction helper. Every commerce write that touches more than one table —
 * order creation, stock movement, review moderation — goes through this so the
 * "all or nothing" boundary is explicit at the call site.
 */
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export { schema };
