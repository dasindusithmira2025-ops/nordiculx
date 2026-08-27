import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

/**
 * Container health check — the endpoint `docker-compose.yml` and any upstream
 * load balancer probe.
 *
 * "Healthy" means this instance can actually serve a request that touches the
 * database, so a process that is up but has lost its pool is reported unhealthy
 * and taken out of rotation. The check is deliberately the cheapest possible
 * round trip; a probe that scans a table would fall over exactly when the
 * database is already struggling.
 *
 * No cache: a cached health check reports the past.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();

  try {
    await db.execute(sql`SELECT 1`);
  } catch {
    // The reason is deliberately not returned — an unauthenticated endpoint
    // should not disclose connection strings or driver internals.
    return Response.json(
      { status: 'unhealthy', database: 'unreachable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }

  return Response.json(
    {
      status: 'ok',
      database: 'ok',
      latencyMs: Date.now() - startedAt,
      uptimeSeconds: Math.round(process.uptime()),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
