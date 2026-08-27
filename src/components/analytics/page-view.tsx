'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { recordPageView } from '@/app/actions/analytics';

/**
 * Page views.
 *
 * Mounted once in the storefront layout. A server component cannot observe a
 * client-side navigation — the layout does not re-render — so this is the only
 * place a complete view count can come from.
 *
 * The last path is remembered so React's development double-invoke, and a
 * re-render that does not change the route, do not each count as a visit.
 */
export function PageView() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    // Fire and forget: a failed analytics write must never surface to a
    // visitor, and `trackEvent` already swallows its own errors.
    void recordPageView(pathname);
  }, [pathname]);

  return null;
}
