import type { ReactNode } from 'react';

/**
 * The body of the 404 and error pages. One component so a missing page and a
 * failed one read as the same house, whichever boundary rendered them.
 */
export function StatusMessage({
  eyebrow,
  title,
  children,
  actions,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="page-x mx-auto flex max-w-2xl flex-col items-center py-28 text-center">
      <p className="text-2xs tracking-eyebrow text-fg-subtle uppercase">
        {eyebrow}
      </p>
      <h1 className="font-display text-display-lg text-fg mt-6">{title}</h1>
      <div className="text-fg-muted mt-5 max-w-prose text-base">{children}</div>
      <div className="mt-12 flex flex-wrap justify-center gap-4">{actions}</div>
    </div>
  );
}
