import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, staffCan } from '@/lib/auth';
import { getOrderByReference } from '@/lib/orders';
import { nextOrderStatuses } from '@/lib/orders/fulfilment';
import { ORDER_STATUS_LABELS } from '@/lib/account';
import { OrderDetailView } from '@/components/commerce/order-detail';
import { OrderRefundForm } from '@/components/admin/order-refund-form';
import { OrderStatusForm } from '@/components/admin/order-status-form';

/**
 * One order, for staff.
 *
 * Reuses the customer-facing `OrderDetailView` deliberately: staff should be
 * looking at exactly what the customer sees when they talk to them about it. The
 * only addition is the status control, which is gated on `orders.manage` —
 * `orders.view` alone can read but not change.
 */
export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  await requireStaff('orders.view');
  const [canManage, canRecordRefund] = await Promise.all([
    staffCan('orders.manage'),
    staffCan('returns.manage'),
  ]);
  const { reference } = await params;
  const order = await getOrderByReference(reference.toUpperCase());
  if (!order) notFound();

  const options = [
    order.status,
    ...nextOrderStatuses(order.status, order.paymentStatus),
  ].map((value) => ({
    value,
    label: ORDER_STATUS_LABELS[value],
  }));

  return (
    <div>
      <header className="border-line border-b pb-6">
        <Link
          href="/admin/orders"
          className="eyebrow text-fg-subtle hover:text-fg link-underline"
        >
          All orders
        </Link>
        <h1 className="font-display text-display-sm text-fg mt-4 tabular-nums">
          {order.reference}
        </h1>
        <p className="text-fg-muted mt-2 text-sm">{order.email}</p>
      </header>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_18rem] lg:items-start">
        <div className="min-w-0">
          {/* Support links are for customers, not staff looking at the order. */}
          <OrderDetailView order={order} showSupportLink={false} />
        </div>

        {canManage ||
        (canRecordRefund &&
          order.status === 'cancelled' &&
          (order.paymentStatus === 'paid' ||
            order.paymentStatus === 'partially_refunded')) ? (
          <aside className="border-line border p-6 lg:sticky lg:top-10">
            {canManage ? (
              options.length > 1 ? (
                <section>
                  <h2 className="eyebrow text-fg-subtle mb-5">Fulfilment</h2>
                  <OrderStatusForm
                    reference={order.reference}
                    current={order.status}
                    options={options}
                  />
                  <p className="text-fg-subtle mt-6 text-xs">
                    Dispatch moves reserved stock out of inventory and sends the
                    dispatch email once. Shipped and terminal orders cannot
                    return to an earlier fulfilment step.
                  </p>
                </section>
              ) : (
                <p className="text-fg-subtle text-xs">
                  This order has no further fulfilment status changes.
                </p>
              )
            ) : null}

            {canRecordRefund &&
            order.status === 'cancelled' &&
            (order.paymentStatus === 'paid' ||
              order.paymentStatus === 'partially_refunded') ? (
              <section
                className={
                  canManage ? 'border-line mt-8 border-t pt-8' : undefined
                }
              >
                <h2 className="eyebrow text-fg-subtle mb-5">Refund</h2>
                <OrderRefundForm reference={order.reference} />
              </section>
            ) : null}
          </aside>
        ) : (
          <aside className="border-line border p-6">
            <p className="text-fg-subtle text-xs">
              Your role can view orders but not change them.
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}
