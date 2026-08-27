import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { listOrders } from '@/lib/admin/queries';
import { ORDER_STATUS_LABELS } from '@/lib/account';
import { orderStatusEnum } from '@/lib/db/schema';
import type { OrderStatus } from '@/lib/db/schema';
import { formatMoney } from '@/lib/money';
import { Badge } from '@/components/ui/display';
import { cn } from '@/lib/cn';

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Order list.
 *
 * The status filter is a link, so a filtered view is a real URL staff can
 * bookmark or send to a colleague. An unrecognised value falls back to "all"
 * rather than returning nothing.
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  await requireStaff('orders.view');

  const params = await searchParams;
  const raw = Array.isArray(params.status) ? params.status[0] : params.status;

  const valid = new Set<string>([...orderStatusEnum.enumValues, 'open']);
  const status = raw && valid.has(raw) ? raw : undefined;

  const orders = await listOrders({
    status: status as OrderStatus | 'open' | undefined,
    limit: 100,
  });

  const filters = [
    { value: undefined, label: 'All' },
    { value: 'open', label: 'In motion' },
    { value: 'pending_payment', label: 'Awaiting payment' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'dispatched', label: 'Dispatched' },
    { value: 'delivered', label: 'Delivered' },
  ];

  return (
    <div>
      <header className="border-line border-b pb-6">
        <p className="eyebrow text-fg-subtle">Orders</p>
        <h1 className="font-display text-display-sm text-fg mt-3">
          {orders.length} {orders.length === 1 ? 'order' : 'orders'}
        </h1>
      </header>

      <nav aria-label="Filter by status" className="mt-6">
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {filters.map((filter) => {
            const active = status === filter.value;
            return (
              <li key={filter.label}>
                <Link
                  href={
                    filter.value
                      ? `/admin/orders?status=${filter.value}`
                      : '/admin/orders'
                  }
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'eyebrow',
                    active
                      ? 'text-fg link-underline'
                      : 'text-fg-subtle hover:text-fg',
                  )}
                >
                  {filter.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {orders.length === 0 ? (
        <p className="text-fg-muted mt-12 text-sm">
          Nothing matches that filter.
        </p>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-line border-b text-left">
                <th className="eyebrow text-fg-subtle py-3 font-normal">
                  Reference
                </th>
                <th className="eyebrow text-fg-subtle py-3 font-normal">
                  Customer
                </th>
                <th className="eyebrow text-fg-subtle py-3 font-normal">
                  Placed
                </th>
                <th className="eyebrow text-fg-subtle py-3 font-normal">
                  Status
                </th>
                <th className="eyebrow text-fg-subtle py-3 text-right font-normal">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-line border-b">
                  <td className="py-4">
                    <Link
                      href={`/admin/orders/${order.reference}`}
                      className="text-fg link-retract tabular-nums"
                    >
                      {order.reference}
                    </Link>
                  </td>
                  <td className="text-fg-muted py-4">{order.email}</td>
                  <td className="text-fg-muted py-4 text-xs">
                    {dateFormat.format(order.placedAt)}
                  </td>
                  <td className="py-4">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">
                        {ORDER_STATUS_LABELS[order.status]}
                      </Badge>
                      {order.paymentStatus !== 'paid' ? (
                        <Badge tone="low">{order.paymentStatus}</Badge>
                      ) : null}
                    </span>
                  </td>
                  <td className="text-fg py-4 text-right tabular-nums">
                    {formatMoney(order.grandTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
