import type { ReactNode } from 'react';
import { ROLE_LABELS, can, requireStaff } from '@/lib/auth';
import type { Permission } from '@/lib/auth';
import { AdminNav } from '@/components/admin/admin-nav';

/**
 * Authenticated admin shell.
 *
 * `requireStaff()` here guarantees a staff session exists for everything in this
 * route group, so a new admin page cannot be added unprotected by forgetting a
 * guard. Individual PERMISSIONS are still checked per page and per action — this
 * layout only establishes that the visitor is staff at all.
 *
 * The nav is filtered by role so nobody is shown a section they cannot open.
 * That is presentation, not protection.
 */
const NAV: { href: string; label: string; permission?: Permission }[] = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/orders', label: 'Orders', permission: 'orders.view' },
  { href: '/admin/products', label: 'Products', permission: 'products.view' },
  { href: '/admin/returns', label: 'Returns', permission: 'returns.manage' },
  {
    href: '/admin/customers',
    label: 'Customers',
    permission: 'customers.view',
  },
  {
    href: '/admin/promotions',
    label: 'Promotions',
    permission: 'promotions.manage',
  },
  { href: '/admin/content', label: 'Content', permission: 'content.manage' },
  {
    href: '/admin/campaigns',
    label: 'Campaigns',
    permission: 'campaigns.manage',
  },
  {
    href: '/admin/routine-finder',
    label: 'Routine',
    permission: 'routine.manage',
  },
  { href: '/admin/reviews', label: 'Reviews', permission: 'reviews.moderate' },
  { href: '/admin/support', label: 'Support', permission: 'support.view' },
  { href: '/admin/staff', label: 'Staff', permission: 'staff.manage' },
];

export default async function AdminShellLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireStaff();

  const items = NAV.filter(
    (item) => !item.permission || can(user.staffRole, item.permission),
  ).map(({ href, label }) => ({ href, label }));

  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[15rem_1fr]">
      <aside className="border-line bg-surface-sunken border-b lg:sticky lg:top-0 lg:h-dvh lg:border-r lg:border-b-0">
        <AdminNav
          items={items}
          role={user.staffRole ? ROLE_LABELS[user.staffRole] : 'Staff'}
          email={user.email}
        />
      </aside>

      <main id="main" className="min-w-0 px-6 py-10 lg:px-10">
        {children}
      </main>
    </div>
  );
}
