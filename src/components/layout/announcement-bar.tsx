'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Rotating announcement strip.
 *
 * Cycles slowly and pauses entirely when the visitor prefers reduced motion or
 * the tab is hidden — a strip that swaps text under a reader mid-sentence is
 * an accessibility problem, not a merchandising win.
 *
 * `aria-live` is deliberately absent: this is ambient marketing, and
 * announcing it over a customer's screen reader would be an interruption.
 */
export function AnnouncementBar({
  messages,
}: {
  messages: { id: string; message: string; href: string | null }[];
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (messages.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setIndex((i) => (i + 1) % messages.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [messages.length]);

  if (messages.length === 0) return null;
  const current = messages[index] ?? messages[0]!;

  return (
    <div data-surface="ink" className="bg-surface text-fg">
      <div className="page-x mx-auto flex h-9 max-w-(--container-page) items-center justify-center">
        {current.href ? (
          <Link
            href={current.href}
            key={current.id}
            className="eyebrow animate-fade-in text-fg-muted hover:text-fg transition-colors"
          >
            {current.message}
          </Link>
        ) : (
          <p key={current.id} className="eyebrow animate-fade-in text-fg-muted">
            {current.message}
          </p>
        )}
      </div>
    </div>
  );
}
