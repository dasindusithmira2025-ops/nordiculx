import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { JsonLd, breadcrumbSchema } from '@/lib/seo/structured-data';

/**
 * The masthead every non-home page opens with.
 *
 * One component so the drop from the header, the eyebrow size and the measure
 * of the standfirst are identical across the catalogue, editorial and account
 * areas — those three were the places a bespoke heading always crept in.
 */

export type Crumb = { label: string; href: string };

export function Breadcrumbs({
  trail,
  className,
}: {
  trail: Crumb[];
  className?: string;
}) {
  if (trail.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={className}>
      {/* Emitted here rather than per page, so the structured trail is always
          the one actually rendered and cannot drift out of sync with it. */}
      <JsonLd data={breadcrumbSchema(trail)} />
      <ol className="text-fg-subtle flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <li>
          <Link href="/" className="link-underline hover:text-fg-muted">
            Home
          </Link>
        </li>
        {trail.map((crumb, i) => {
          const last = i === trail.length - 1;
          return (
            <li key={crumb.href} className="flex items-center gap-2">
              <span aria-hidden className="opacity-50">
                /
              </span>
              {last ? (
                <span aria-current="page" className="text-fg-muted">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="link-underline hover:text-fg-muted"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  trail,
  aside,
  align = 'start',
  className,
}: {
  eyebrow?: string | null;
  title: ReactNode;
  description?: ReactNode;
  trail?: Crumb[];
  /** Optional right-hand slot: a count, a filter, a call to action. */
  aside?: ReactNode;
  align?: 'start' | 'center';
  className?: string;
}) {
  return (
    <header
      className={cn(
        'page-x mx-auto max-w-(--container-page) pt-8 pb-10 md:pt-12 md:pb-14',
        className,
      )}
    >
      {trail?.length ? <Breadcrumbs trail={trail} className="mb-8" /> : null}

      <div
        className={cn(
          'flex flex-col gap-6 md:flex-row md:items-end md:justify-between',
          align === 'center' && 'md:flex-col md:items-center md:text-center',
        )}
      >
        <div className={cn('max-w-3xl', align === 'center' && 'mx-auto')}>
          {eyebrow ? (
            <p className="eyebrow text-fg-subtle mb-4">{eyebrow}</p>
          ) : null}
          <h1 className="font-display text-display-lg text-fg">{title}</h1>
          {description ? (
            <div className="text-fg-muted mt-5 max-w-prose text-base">
              {description}
            </div>
          ) : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
    </header>
  );
}
