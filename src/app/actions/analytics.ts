'use server';

import { trackEvent } from '@/lib/analytics';
import { rateLimit } from '@/lib/rate-limit';

/**
 * The one analytics entry point the browser may call.
 *
 * Server components cannot see a client-side navigation, so page views have to
 * come from the browser. Everything else is recorded server-side at the point
 * it actually happens, where the values cannot be forged.
 *
 * Deliberately narrow: this accepts a path and nothing else. An open
 * `trackEvent(name, properties)` endpoint would let anyone write arbitrary
 * rows — including under an event name the funnel is measured on.
 */
export async function recordPageView(rawPath: string): Promise<void> {
  // Path only: a query string can carry a search term, an email from a
  // mistyped link, or a token, none of which belong in analytics.
  const path = rawPath.split(/[?#]/)[0] ?? '/';
  if (!path.startsWith('/') || path.length > 200) return;

  // Generous for a person browsing; stops a script filling the events table.
  const limit = await rateLimit('page-view', { limit: 120, windowSeconds: 60 });
  if (!limit.allowed) return;

  await trackEvent('page_view', undefined, { path });
}
