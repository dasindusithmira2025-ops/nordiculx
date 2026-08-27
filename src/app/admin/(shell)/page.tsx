import Link from 'next/link';
import { requireStaff, staffCan } from '@/lib/auth';
import { getAdminOverview, listOrders } from '@/lib/admin/queries';
import { ORDER_STATUS_LABELS } from '@/lib/account';
import { formatMoney } from '@/lib/money';
import { paymentsAreMocked } from '@/lib/payments';
import { mailIsDeliverable } from '@/lib/mail';
import { rateLimitIsDurable } from '@/lib/rate-limit';

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Admin overview.
 *
 * Leads with the things that need somebody to act: orders in motion, reviews
 * waiting, tickets open. Revenue is present but not the headline — a dashboard
 * that opens with a number nobody can act on trains people to ignore it.
 */
export default async function AdminDashboard() {
  const user = await requireStaff();
  const canSeeOrders = await staffCan('orders.view');

  const [overview, recent] = await Promise.all([
    getAdminOverview(),
    canSeeOrders ? listOrders({ limit: 8 }) : Promise.resolve([]),
  ]);

  const stats = [
    { label: 'Open orders', value: overview.openOrders, href: '/admin/orders' },
    {
      label: 'Orders, 7 days',
      value: overview.orders7d,
      href: '/admin/orders',
    },
    {
      label: 'Revenue, 7 days',
      value: formatMoney(overview.revenue7d),
      href: '/admin/orders',
    },
    {
      label: 'Reviews waiting',
      value: overview.pendingReviews,
      href: '/admin/reviews',
    },
    {
      label: 'Open tickets',
      value: overview.openTickets,
      href: '/admin/support',
    },
    { label: 'Low stock', value: overview.lowStock, href: '/admin/products' },
  ];

  // Configuration that is fine locally and must not reach production. Surfaced
  // here because a warning nobody sees is not a warning.
  const warnings = [
    paymentsAreMocked ? 'Payments are simulated (PAYMENT_DRIVER=mock).' : null,
    mailIsDeliverable
      ? null
      : 'Email is not being delivered (MAIL_DRIVER=log).',
    rateLimitIsDurable
      ? null
      : 'Rate limits are in-process only — not safe across multiple instances.',
  ].filter(Boolean);

  return (
    <div>
      <header className="border-line border-b pb-6">
        <p className="eyebrow text-fg-subtle">Overview</p>
        <h1 className="font-display text-display-sm text-fg mt-3">
          Good to see you, {user.firstName ?? 'there'}
        </h1>
      </header>

      {warnings.length > 0 ? (
        <div className="border-signal-warning mt-8 border-l px-4 py-3">
          <p className="eyebrow text-fg-subtle mb-2">Environment</p>
          <ul className="text-fg-muted space-y-1 text-sm">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <dl className="border-line mt-10 grid grid-cols-2 gap-px border md:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-surface p-6">
            <dt className="eyebrow text-fg-subtle">{stat.label}</dt>
            <dd className="font-display text-fg mt-3 text-2xl tabular-nums">
              <Link href={stat.href} className="link-retract">
                {stat.value}
              </Link>
            </dd>
          </div>
        ))}
      </dl>

      {canSeeOrders ? (
        <section className="mt-14">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="eyebrow text-fg-subtle">Latest orders</h2>
            <Link
              href="/admin/orders"
              className="eyebrow text-fg link-underline"
            >
              All orders
            </Link>
          </div>

          {recent.length === 0 ? (
            <p className="text-fg-muted text-sm">No orders yet.</p>
          ) : (
            <ul className="border-line border-t">
              {recent.map((order) => (
                <li key={order.id} className="border-line border-b">
                  <Link
                    href={`/admin/orders/${order.reference}`}
                    className="hover:bg-accent-soft flex flex-wrap items-center justify-between gap-4 px-1 py-4 transition-colors"
                  >
                    <span className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
                      <span className="text-fg text-sm tabular-nums">
                        {order.reference}
                      </span>
                      <span className="text-fg-subtle text-xs">
                        {order.email}
                      </span>
                    </span>
                    <span className="flex items-center gap-6">
                      <span className="text-fg-muted text-xs">
                        {dateFormat.format(order.placedAt)}
                      </span>
                      <span className="text-fg-muted text-xs">
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
      ) : null}
    </div>
  );
}
