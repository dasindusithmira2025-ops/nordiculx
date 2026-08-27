import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import {
  ORDER_STATUS_LABELS,
  getAccountSummary,
  getOrdersForUser,
  isOpenOrder,
} from '@/lib/account';
import { formatMoney } from '@/lib/money';
import { Badge } from '@/components/ui/display';
import { ButtonLink } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Your account — Nordic Lux',
  robots: { index: false, follow: false },
};

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/**
 * Account overview.
 *
 * Leads with the order still in motion, because that is the only thing most
 * people sign in to check. Counts come from one query rather than four.
 */
export default async function AccountPage() {
  const user = await requireUser('/account');

  const [summary, orders] = await Promise.all([
    getAccountSummary(user.id),
    getOrdersForUser(user.id),
  ]);

  const open = orders.filter((o) => isOpenOrder(o.status)).slice(0, 2);
  const recent = orders.slice(0, 3);
  const name = user.firstName ?? 'there';

  return (
    <div>
      <header className="border-line border-b pb-8">
        <p className="eyebrow text-fg-subtle">Account</p>
        <h1 className="font-display text-display-md text-fg mt-4">
          Hello, {name}
        </h1>
        <p className="text-fg-muted mt-3 text-sm">{user.email}</p>
      </header>

      {open.length > 0 ? (
        <section className="mt-12">
          <h2 className="eyebrow text-fg-subtle mb-6">On its way</h2>
          <ul className="space-y-4">
            {open.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/account/orders/${order.reference}`}
                  className="border-line-strong hover:bg-accent-soft flex flex-wrap items-center justify-between gap-4 border px-6 py-5 transition-colors"
                >
                  <span>
                    <span className="text-fg block font-medium tabular-nums">
                      {order.reference}
                    </span>
                    <span className="text-fg-subtle mt-1 block text-xs">
                      {dateFormat.format(order.placedAt)} · {order.itemCount}{' '}
                      {order.itemCount === 1 ? 'item' : 'items'}
                    </span>
                  </span>
                  <Badge tone="neutral">
                    {ORDER_STATUS_LABELS[order.status]}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-14">
        <h2 className="eyebrow text-fg-subtle mb-6">At a glance</h2>
        <dl className="border-line grid grid-cols-2 gap-px border sm:grid-cols-4">
          {[
            {
              label: 'Orders',
              value: summary.orderCount,
              href: '/account/orders',
            },
            {
              label: 'In progress',
              value: summary.openOrderCount,
              href: '/account/orders',
            },
            {
              label: 'Wishlist',
              value: summary.wishlistCount,
              href: '/account/wishlist',
            },
            {
              label: 'Addresses',
              value: summary.addressCount,
              href: '/account/addresses',
            },
          ].map((stat) => (
            <div key={stat.label} className="bg-surface p-6">
              <dt className="eyebrow text-fg-subtle">{stat.label}</dt>
              <dd className="font-display text-fg mt-3 text-3xl tabular-nums">
                <Link href={stat.href} className="link-retract">
                  {stat.value}
                </Link>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-14">
        <div className="mb-6 flex items-baseline justify-between gap-6">
          <h2 className="eyebrow text-fg-subtle">Recent orders</h2>
          {orders.length > 3 ? (
            <Link
              href="/account/orders"
              className="eyebrow text-fg link-underline"
            >
              All orders
            </Link>
          ) : null}
        </div>

        {recent.length === 0 ? (
          <div className="border-line border px-6 py-14 text-center">
            <p className="font-display text-fg text-xl">No orders yet</p>
            <p className="text-fg-muted mx-auto mt-3 max-w-sm text-sm">
              When you place one it will appear here, with tracking.
            </p>
            <div className="mt-8">
              <ButtonLink href="/shop" variant="secondary">
                Start shopping
              </ButtonLink>
            </div>
          </div>
        ) : (
          <ul className="border-line border-t">
            {recent.map((order) => (
              <li key={order.id} className="border-line border-b">
                <Link
                  href={`/account/orders/${order.reference}`}
                  className="hover:bg-accent-soft flex flex-wrap items-center justify-between gap-4 px-1 py-5 transition-colors"
                >
                  <span className="flex items-baseline gap-5">
                    <span className="text-fg tabular-nums">
                      {order.reference}
                    </span>
                    <span className="text-fg-subtle text-xs">
                      {dateFormat.format(order.placedAt)}
                    </span>
                  </span>
                  <span className="flex items-center gap-6">
                    <span className="text-fg-muted text-sm">
                      {ORDER_STATUS_LABELS[order.status]}
                    </span>
                    <span className="text-fg text-sm tabular-nums">
                      {formatMoney(order.grandTotal)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
