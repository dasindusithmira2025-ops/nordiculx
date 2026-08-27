import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import {
  ORDER_STATUS_LABELS,
  getOrdersForUser,
  isOpenOrder,
} from '@/lib/account';
import { formatMoney } from '@/lib/money';
import { Badge } from '@/components/ui/display';
import { ButtonLink } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Your orders — Nordic Lux',
  robots: { index: false, follow: false },
};

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export default async function OrdersPage() {
  const user = await requireUser('/account/orders');
  const orders = await getOrdersForUser(user.id);

  return (
    <div>
      <header className="border-line border-b pb-8">
        <p className="eyebrow text-fg-subtle">Account</p>
        <h1 className="font-display text-display-md text-fg mt-4">Orders</h1>
      </header>

      {orders.length === 0 ? (
        <div className="border-line mt-12 border px-6 py-20 text-center">
          <p className="font-display text-display-sm text-fg">No orders yet</p>
          <p className="text-fg-muted mx-auto mt-3 max-w-sm text-sm">
            Everything you order will be listed here with its tracking history.
          </p>
          <div className="mt-8">
            <ButtonLink href="/shop">Start shopping</ButtonLink>
          </div>
        </div>
      ) : (
        <ul className="mt-4">
          {orders.map((order) => (
            <li key={order.id} className="border-line border-b py-8">
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div>
                  <Link
                    href={`/account/orders/${order.reference}`}
                    className="font-display text-fg link-retract text-xl tabular-nums"
                  >
                    {order.reference}
                  </Link>
                  <p className="text-fg-subtle mt-2 text-xs">
                    Placed {dateFormat.format(order.placedAt)} ·{' '}
                    {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}{' '}
                    · {formatMoney(order.grandTotal)}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <Badge
                    tone={isOpenOrder(order.status) ? 'neutral' : 'success'}
                  >
                    {ORDER_STATUS_LABELS[order.status]}
                  </Badge>
                  {order.paymentStatus === 'pending' ? (
                    <Badge tone="low">Payment pending</Badge>
                  ) : null}
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                {order.thumbnails.filter(Boolean).map((url, i) => (
                  <div
                    key={`${url}-${i}`}
                    className="bg-surface-sunken relative size-16 overflow-hidden"
                  >
                    <Image
                      src={url!}
                      alt=""
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  </div>
                ))}
                <Link
                  href={`/account/orders/${order.reference}`}
                  className="eyebrow text-fg-subtle hover:text-fg link-underline ml-2"
                >
                  View order
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
