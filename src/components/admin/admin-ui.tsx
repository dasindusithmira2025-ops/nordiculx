import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Shared admin chrome.
 *
 * The admin is an operations tool, not a marketing surface: dense rows, one
 * screen per job, no decoration that costs a scroll. These are the handful of
 * primitives every staff page repeats, kept here so a new page inherits the
 * density instead of re-inventing it.
 */

/** Underlined inputs, matching the products screen's inline editing. */
export const adminField =
  'border-line-strong focus:border-fg text-fg w-full border-0 border-b bg-transparent py-1.5 text-sm outline-none disabled:opacity-40';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  stats,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  stats?: { label: string; value: ReactNode }[];
}) {
  return (
    <header className="border-line border-b pb-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="eyebrow text-fg-subtle">{eyebrow}</p>
          <h1 className="font-display text-display-sm text-fg mt-2">{title}</h1>
          {description ? (
            <p className="text-fg-muted mt-2 max-w-2xl text-sm">
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex items-end gap-6">
          {stats?.length ? (
            <dl className="flex gap-6 text-right text-xs">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <dt className="eyebrow text-fg-subtle">{stat.label}</dt>
                  <dd className="text-fg mt-1 text-lg tabular-nums">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          {actions}
        </div>
      </div>
    </header>
  );
}

/** Filter tabs. Links, not buttons: a filtered view stays shareable. */
export function TabNav({
  label,
  items,
  current,
}: {
  label: string;
  items: { href: string; label: ReactNode; value: string }[];
  current: string;
}) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {items.map((item) => (
          <li key={item.value}>
            <Link
              href={item.href}
              aria-current={current === item.value ? 'page' : undefined}
              className={cn(
                'eyebrow',
                current === item.value
                  ? 'text-fg link-underline'
                  : 'text-fg-subtle hover:text-fg',
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="-mx-6 overflow-x-auto px-6 lg:mx-0 lg:px-0">
      <table
        className={cn('w-full min-w-3xl border-collapse text-sm', className)}
        {...props}
      />
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      scope="col"
      className={cn(
        'eyebrow text-fg-subtle border-line border-b px-3 py-2 text-left font-normal whitespace-nowrap',
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: ComponentProps<'td'>) {
  return (
    <td
      className={cn('border-line border-b px-3 py-2 align-middle', className)}
      {...props}
    />
  );
}

/** One short line where a screen has nothing to show. No illustration. */
export function NoRows({ children }: { children: ReactNode }) {
  return <p className="text-fg-muted mt-8 text-sm">{children}</p>;
}

/**
 * A labelled control in a dense form grid.
 *
 * The hint sits outside the `<label>` deliberately: inside it, it becomes part
 * of the control's accessible name, so a field labelled "URL" with a hint
 * announces — and is matched — as "URL /campaigns/…". It stays adjacent in the
 * reading order, which is where a screen reader reaches it next anyway.
 */
export function Cell({
  label,
  hint,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <label className="block">
        <span className="eyebrow text-fg-subtle">{label}</span>
        <span className="mt-1.5 block">{children}</span>
      </label>
      {hint ? <p className="text-fg-subtle mt-1 text-xs">{hint}</p> : null}
    </div>
  );
}
