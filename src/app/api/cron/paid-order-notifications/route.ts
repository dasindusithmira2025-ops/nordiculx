import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { dispatchPaidOrderNotifications } from '@/lib/notifications/paid-order';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isAuthorized(request: Request) {
  if (!env.CRON_SECRET) return false;
  const authorization = request.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  const expected = Buffer.from(env.CRON_SECRET);
  const actual = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Scheduled recovery for pending or failed paid-order notifications. */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return new Response(null, { status: 401 });
  }

  const result = await dispatchPaidOrderNotifications({ limit: 25 });
  return Response.json(result, { status: 200 });
}
