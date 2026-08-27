import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { StarFilledIcon, StarIcon } from './icons';

/* -------------------------------------------------------------------------- */
/* Badge                                                                       */
/* -------------------------------------------------------------------------- */

export type BadgeTone = 'neutral' | 'sale' | 'new' | 'low' | 'out' | 'success';

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'border-line-strong text-fg-muted',
  sale: 'border-signal-sale text-signal-sale',
  new: 'border-fg text-fg',
  low: 'border-signal-warning text-signal-warning',
  out: 'border-line-strong text-fg-subtle',
  success: 'border-signal-success text-signal-success',
};

/**
 * Outlined micro-label. Never filled — a solid colour block would compete with
 * product photography, which is always the loudest element on the page.
 */
export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'eyebrow bg-surface/80 inline-flex items-center border px-2 py-1 backdrop-blur-[2px]',
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Skeleton                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Loading placeholder. A slow sweep rather than a pulsing flash — the page
 * should feel like it is settling, not blinking.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-shimmer bg-surface-sunken',
        'bg-[linear-gradient(100deg,transparent_20%,var(--surface-raised)_45%,transparent_70%)]',
        'bg-[length:220%_100%]',
        className,
      )}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Rule / Divider                                                              */
/* -------------------------------------------------------------------------- */

export function Rule({ className }: { className?: string }) {
  return <hr className={cn('border-line border-0 border-t', className)} />;
}

/* -------------------------------------------------------------------------- */
/* Section heading                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The house section header: a tracked uppercase eyebrow, a display-serif
 * title, and an optional action pinned to the far right on wide screens.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  align = 'start',
  as: Tag = 'h2',
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  align?: 'start' | 'center';
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-6 md:flex-row md:items-end md:justify-between',
        align === 'center' && 'md:flex-col md:items-center md:text-center',
        className,
      )}
    >
      <div className={cn('max-w-2xl', align === 'center' && 'mx-auto')}>
        {eyebrow ? (
          <p className="eyebrow text-fg-subtle mb-4">{eyebrow}</p>
        ) : null}
        <Tag className="font-display text-display-md">{title}</Tag>
        {description ? (
          <p className="text-fg-muted mt-4 max-w-prose text-base">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty state                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Empty and zero-result states. Always offers a way forward — an empty state
 * with no recovery action is a dead end, which docs/DESIGN.md forbids.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border-line flex flex-col items-center justify-center border px-6 py-20 text-center',
        className,
      )}
    >
      {icon ? <div className="text-fg-subtle mb-6">{icon}</div> : null}
      <h3 className="font-display text-display-sm">{title}</h3>
      {description ? (
        <p className="text-fg-muted mt-3 max-w-md text-sm">{description}</p>
      ) : null}
      {action ? <div className="mt-8">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Rating                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Star rating. Renders as a single accessible string for assistive tech and as
 * five glyphs visually, with a clipped overlay for the fractional star so a
 * 4.3 does not silently round to 4.
 */
export function Rating({
  value,
  count,
  size = 14,
  showValue = false,
  className,
}: {
  value: number;
  count?: number;
  size?: number;
  showValue?: boolean;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(5, value));
  const label =
    count === undefined
      ? `Rated ${clamped.toFixed(1)} out of 5`
      : `Rated ${clamped.toFixed(1)} out of 5 from ${count} ${
          count === 1 ? 'review' : 'reviews'
        }`;

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        role="img"
        aria-label={label}
        className="relative inline-flex shrink-0"
        style={{ width: size * 5 + 8 }}
      >
        <span aria-hidden className="text-fg-subtle flex gap-0.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <StarIcon key={i} width={size} height={size} />
          ))}
        </span>
        <span
          aria-hidden
          className="text-fg absolute inset-y-0 left-0 flex gap-0.5 overflow-hidden"
          style={{ width: `${(clamped / 5) * 100}%` }}
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <StarFilledIcon
              key={i}
              width={size}
              height={size}
              className="shrink-0"
            />
          ))}
        </span>
      </span>
      {showValue ? (
        <span aria-hidden className="text-fg-muted text-xs">
          {clamped.toFixed(1)}
          {count !== undefined ? ` (${count})` : ''}
        </span>
      ) : null}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Prose                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Long-form editorial body copy. Constrained to a comfortable measure with
 * larger type and looser leading than the commerce UI.
 */
export function Prose({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'text-read text-fg-muted max-w-prose',
        '[&_p]:mb-6',
        '[&_h2]:font-display [&_h2]:text-display-sm [&_h2]:text-fg [&_h2]:mt-14 [&_h2]:mb-4',
        '[&_h3]:font-display [&_h3]:text-fg [&_h3]:mt-10 [&_h3]:mb-3 [&_h3]:text-xl',
        '[&_a]:link-retract [&_a]:text-fg',
        '[&_li]:mb-2 [&_ul]:mb-6 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_ol]:mb-6 [&_ol]:list-decimal [&_ol]:pl-5',
        '[&_strong]:text-fg [&_strong]:font-medium',
        '[&_blockquote]:border-line-strong [&_blockquote]:my-10 [&_blockquote]:border-l',
        '[&_blockquote]:font-display [&_blockquote]:text-fg [&_blockquote]:pl-6 [&_blockquote]:text-xl',
        className,
      )}
    >
      {children}
    </div>
  );
}
