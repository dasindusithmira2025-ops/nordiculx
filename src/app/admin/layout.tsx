import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Nordic Lux Admin',
  // The admin must never appear in a search index, whatever else is configured.
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Admin root.
 *
 * Shares nothing with the storefront chrome — no announcement bar, no cart, no
 * live chat. Keeping the two surfaces apart means a storefront component cannot
 * accidentally render inside an authenticated staff page, and vice versa.
 *
 * The sign-in page lives under this layout but outside `(shell)`, so it stays
 * reachable while signed out.
 */
export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return <div className="bg-surface text-fg min-h-dvh">{children}</div>;
}
