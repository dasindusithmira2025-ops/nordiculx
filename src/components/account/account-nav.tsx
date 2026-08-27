'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from '@/app/actions/auth';
import { cn } from '@/lib/cn';

/**
 * Account sidebar navigation.
 *
 * A client component only because the current route decides which item is
 * marked — `aria-current` has to be right for a screen-reader user, and that
 * needs the pathname.
 *
 * Signing out is a form POST rather than a link. A GET that destroys a session
 * can be triggered by any prefetch, image or third-party page, which is how
 * "logged out at random" bugs happen.
 */
const ITEMS = [
  { href: '/account', label: 'Overview' },
  { href: '/account/orders', label: 'Orders' },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/account/wishlist', label: 'Wishlist' },
  { href: '/account/settings', label: 'Settings' },
];

export function AccountNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Account" className="lg:sticky lg:top-28">
      <ul className="border-line border-t">
        {ITEMS.map((item) => {
          // Exact match for the overview, prefix for the rest, so
          // /account/orders/NL-1234 still marks Orders as current.
          const active =
            item.href === '/account'
              ? pathname === '/account'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href} className="border-line border-b">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'eyebrow block py-4 transition-colors',
                  active ? 'text-fg' : 'text-fg-subtle hover:text-fg',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <form action={signOut} className="mt-8">
        <button
          type="submit"
          className="eyebrow text-fg-subtle hover:text-fg link-underline"
        >
          Sign out
        </button>
      </form>
    </nav>
  );
}
