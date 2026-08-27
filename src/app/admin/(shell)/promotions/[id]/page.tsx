import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import {
  getPromotion,
  getPromotionTargets,
  listPromotionOrders,
  promotionState,
} from '@/lib/admin/promotions';
import { formatMoney } from '@/lib/money';
import { Badge } from '@/components/ui/display';
import { NoRows, PageHeader, Table, Td, Th } from '@/components/admin/admin-ui';
import { PromotionForm } from '@/components/admin/promotion-form';
import { PromotionRowActions } from '@/components/admin/promotion-actions';

/** One promotion: its settings, and what it has actually cost. */

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export default async function AdminPromotionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff('promotions.manage');

  const { id } = await params;
  const promotion = await getPromotion(id);
  if (!promotion) notFound();

  const [targets, used] = await Promise.all([
    getPromotionTargets(),
    listPromotionOrders(promotion.id),
  ]);

  const state = promotionState(promotion);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Promotion"
        title={promotion.code ?? promotion.name}
        description={promotion.description ?? undefined}
        actions={
          <PromotionRowActions id={promotion.id} enabled={promotion.enabled} />
        }
        stats={[
          { label: 'Uses', value: promotion.usageCount },
          { label: 'Orders', value: promotion.ordersUsed },
          { label: 'Given', value: formatMoney(promotion.discountGiven) },
        ]}
      />

      <p className="text-sm">
        <Badge
          tone={
            state === 'live'
              ? 'success'
              : state === 'scheduled'
                ? 'neutral'
                : 'out'
          }
        >
          {state}
        </Badge>{' '}
        <Link href="/admin/promotions" className="link-underline ml-3 text-xs">
          All promotions
        </Link>
      </p>

      <section aria-label="Settings" className="border-line border p-4">
        <PromotionForm promotion={promotion} targets={targets} />
      </section>

      <section aria-label="Usage">
        <h2 className="eyebrow text-fg-subtle">Orders using this promotion</h2>
        {used.length === 0 ? (
          <NoRows>Not used yet.</NoRows>
        ) : (
          <Table className="mt-3">
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th className="text-right">Discount</Th>
                <Th className="text-right">Order total</Th>
                <Th>Status</Th>
                <Th>Placed</Th>
              </tr>
            </thead>
            <tbody>
              {used.map((order) => (
                <tr key={order.reference}>
                  <Td className="font-mono text-xs">
                    <Link
                      href={`/admin/orders/${order.reference}`}
                      className="link-underline"
                    >
                      {order.reference}
                    </Link>
                  </Td>
                  <Td className="text-fg-muted">{order.email}</Td>
                  <Td className="text-right tabular-nums">
                    {formatMoney(order.discountTotal)}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {formatMoney(order.grandTotal)}
                  </Td>
                  <Td className="text-fg-muted text-xs">{order.status}</Td>
                  <Td className="text-fg-muted text-xs whitespace-nowrap">
                    {dateFormat.format(order.createdAt)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}
