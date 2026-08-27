import 'server-only';
import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { analyticsEvents } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { clientIp } from '@/lib/auth/session';
import { currentUser } from '@/lib/auth';

/**
 * First-party analytics.
 *
 * No third-party script, no cross-site identifier, no cookie. A visitor is
 * bucketed by a SALTED, DAILY-ROTATING hash of IP + user agent, which is
 * enough to count distinct visitors within a day and useless for tracking
 * anybody across days or across sites — the salt for yesterday cannot be used
 * to link to today.
 *
 * Property values are coerced to primitives and truncated. Nothing that
 * identifies a person — email, address, order reference, full basket contents —
 * is ever written here (docs/SECURITY.md § PII).
 */

export type AnalyticsEventName =
  | 'page_view'
  | 'product_view'
  | 'search'
  | 'add_to_cart'
  | 'remove_from_cart'
  | 'begin_checkout'
  | 'purchase'
  | 'routine_finder_start'
  | 'routine_finder_complete'
  | 'article_view'
  | 'campaign_view';

/** Fields that must never reach the analytics table, whatever a caller passes. */
const FORBIDDEN_KEYS = new Set([
  'email',
  'phone',
  'name',
  'firstName',
  'lastName',
  'address',
  'line1',
  'line2',
  'postalCode',
  'password',
  'token',
  'reference',
  'orderReference',
  'last4',
]);

function visitorKey(ip: string | null, userAgent: string | null): string {
  // The day component rotates the identifier every 24 hours.
  const day = new Date().toISOString().slice(0, 10);
  return createHash('sha256')
    .update(`${env.SESSION_SECRET}:${day}:${ip ?? ''}:${userAgent ?? ''}`)
    .digest('hex')
    .slice(0, 32);
}

function sanitise(
  properties: Record<string, unknown> | undefined,
): Record<string, string | number | boolean> | null {
  if (!properties) return null;
  const out: Record<string, string | number | boolean> = {};
  let count = 0;

  for (const [key, value] of Object.entries(properties)) {
    if (count >= 12) break;
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (value === null || value === undefined) continue;

    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = value;
    } else if (typeof value === 'boolean') {
      out[key] = value;
    } else if (typeof value === 'string') {
      out[key] = value.slice(0, 120);
    } else {
      continue;
    }
    count += 1;
  }

  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Records an event. Never throws and never blocks the caller's result — an
 * analytics failure must not fail a checkout.
 */
export async function trackEvent(
  name: AnalyticsEventName,
  properties?: Record<string, unknown>,
  options: { path?: string } = {},
): Promise<void> {
  if (!env.ANALYTICS_ENABLED) return;

  try {
    const headerList = await headers();
    const user = await currentUser();

    await db.insert(analyticsEvents).values({
      name,
      path: options.path ?? headerList.get('x-pathname') ?? null,
      visitorKey: visitorKey(
        clientIp(headerList),
        headerList.get('user-agent'),
      ),
      userId: user?.id ?? null,
      properties: sanitise(properties),
    });
  } catch (error) {
    // Deliberately swallowed. Analytics is never load-bearing.
    if (env.NODE_ENV !== 'production') {
      console.warn('[analytics] failed to record event', name, error);
    }
  }
}
