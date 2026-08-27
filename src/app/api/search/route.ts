import { NextResponse, type NextRequest } from 'next/server';
import { search } from '@/lib/catalogue/search';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Predictive search endpoint.
 *
 * Rate limited because it is unauthenticated and does real database work on
 * every keystroke-debounced request.
 */
export async function GET(request: NextRequest) {
  const limit = await rateLimit('search', { limit: 120, windowSeconds: 60 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many searches. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limit.resetIn) } },
    );
  }

  const query = request.nextUrl.searchParams.get('q') ?? '';
  // Bounded so a very long query cannot be used to burn database time.
  const results = await search(query.slice(0, 100));

  return NextResponse.json(results, {
    headers: { 'Cache-Control': 'private, max-age=15' },
  });
}
