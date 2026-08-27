'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { staffSignOut } from '@/app/actions/staff-auth';
import { cn } from '@/lib/cn';

/**
 * Admin navigation.
 *
 * The item list is computed on the SERVER from the signed-in role and passed in;
 * this component only decides which one is current. Hiding a link is a courtesy
 * so staff are not shown doors they cannot open — it is not access control, and
 * every page behind these links calls `requireStaff` for itself.
 */
export function AdminNav({
  items,
  role,
  email,
}: {
  items: { href: string; label: string }[];
  role: string;
  email: string;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="border-line border-b px-6 py-5">
        <Link href="/admin" className="font-display text-fg text-lg">
          Nordic Lux
        </Link>
        <p className="eyebrow text-fg-subtle mt-1">Admin</p>
      </div>

      <nav aria-label="Admin" className="flex-1 px-3 py-4">
        <ul className="space-y-1">
          {items.map((item) => {
            const active =
              item.href === '/admin'
                ? pathname === '/admin'
                : pathname.startsWith(item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'block px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-accent-soft text-fg'
                      : 'text-fg-muted hover:text-fg',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-line border-t px-6 py-5">
        <p className="text-fg text-xs">{email}</p>
        <p className="eyebrow text-fg-subtle mt-1">{role}</p>
        <form action={staffSignOut} className="mt-4">
          <button
            type="submit"
            className="eyebrow text-fg-subtle hover:text-fg link-underline"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
