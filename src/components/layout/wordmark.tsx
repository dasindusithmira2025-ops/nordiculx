import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * The Nordic Lux wordmark.
 *
 * Set in the display serif at a single weight with wide tracking — the
 * restraint is the identity. It inherits `currentColor`, so it reads correctly
 * on both the paper and ink surfaces without a second asset.
 */
export function Wordmark({
  className,
  size = 'md',
  asLink = true,
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  asLink?: boolean;
}) {
  const sizes = {
    sm: 'text-base tracking-[0.28em]',
    md: 'text-lg tracking-[0.3em] md:text-xl',
    lg: 'text-2xl tracking-[0.32em] md:text-4xl',
  };

  const mark = (
    <span
      className={cn(
        'font-display text-fg leading-none uppercase',
        sizes[size],
        className,
      )}
    >
      Nordic&nbsp;Lux
    </span>
  );

  if (!asLink) return mark;

  return (
    <Link
      href="/"
      aria-label="Nordic Lux — home"
      className="inline-flex items-center focus-visible:outline-offset-4"
    >
      {mark}
    </Link>
  );
}
