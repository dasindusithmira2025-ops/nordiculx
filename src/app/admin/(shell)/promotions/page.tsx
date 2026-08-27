import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import {
  getPromotionTargets,
  listPromotions,
  promotionState,
  type PromotionRow,
  type PromotionState,
} from '@/lib/admin/promotions';
import { formatMoney } from '@/lib/money';
import { Badge } from '@/components/ui/display';
import { NoRows, PageHeader, Table, Td, Th } from '@/components/admin/admin-ui';
import { PromotionForm } from '@/components/admin/promotion-form';
import { PromotionRowActions } from '@/components/admin/promotion-actions';

/**
 * Promotions.
 *
 * Everything on one screen: the list is the working surface, and creating a
 * code is a disclosure above it rather than a separate page — staff make a
 * discount in the middle of a phone call, not as a planned project.
 */

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const STATE_TONE: Record<PromotionState, 'success' | 'neutral' | 'out'> = {
  live: 'success',
  scheduled: 'neutral',
  expired: 'out',
  exhausted: 'out',
  off: 'out',
};

function value(promotion: PromotionRow) {
  if (promotion.type === 'percentage') return `${promotion.value}%`;
  if (promotion.type === 'fixed_amount') return formatMoney(promotion.value);
  return 'Free shipping';
}

function window_(promotion: PromotionRow) {
  const from = promotion.startsAt ? dateFormat.format(promotion.startsAt) : '—';
  const to = promotion.endsAt ? dateFormat.format(promotion.endsAt) : '—';
  return `${from} → ${to}`;
}

export default async function AdminPromotionsPage() {
  await requireStaff('promotions.manage');

  const [rows, targets] = await Promise.all([
    listPromotions(),
    getPromotionTargets(),
  ]);

  const now = new Date();
  const states = new Map(rows.map((row) => [row.id, promotionState(row, now)]));
  const live = rows.filter((row) => states.get(row.id) === 'live').length;
  const given = rows.reduce((total, row) => total + row.discountGiven, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Merchandising"
        title={`${rows.length} promotions`}
        description="Discount codes and automatic promotions. Checkout validates the window, the minimum spend and the usage limits on every attempt."
        stats={[
          { label: 'Live', value: live },
          { label: 'Given', value: formatMoney(given) },
        ]}
      />

      <details className="border-line border">
        <summary className="text-fg cursor-pointer px-4 py-3 text-sm">
          New promotion
        </summary>
        <div className="border-line border-t p-4">
          <PromotionForm targets={targets} />
        </div>
      </details>

      {rows.length === 0 ? (
        <NoRows>No promotions yet.</NoRows>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Name</Th>
              <Th>Value</Th>
              <Th>Applies to</Th>
              <Th>Window</Th>
              <Th className="text-right">Used</Th>
              <Th className="text-right">Given</Th>
              <Th>State</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const state = states.get(row.id)!;
              return (
                <tr key={row.id}>
                  <Td className="font-mono text-xs whitespace-nowrap">
                    <Link
                      href={`/admin/promotions/${row.id}`}
                      className="link-underline"
                    >
                      {row.code ?? 'Automatic'}
                    </Link>
                  </Td>
                  <Td className="text-fg-muted">{row.name}</Td>
                  <Td className="whitespace-nowrap tabular-nums">
                    {value(row)}
                  </Td>
                  <Td className="text-fg-muted text-xs">
                    {row.scope === 'order'
                      ? 'Whole order'
                      : `${row.targetIds.length} ${row.scope}`}
                  </Td>
                  <Td className="text-fg-muted text-xs whitespace-nowrap">
                    {window_(row)}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {row.usageCount}
                    {row.usageLimit === null ? '' : ` / ${row.usageLimit}`}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {formatMoney(row.discountGiven)}
                  </Td>
                  <Td>
                    <Badge tone={STATE_TONE[state]}>{state}</Badge>
                  </Td>
                  <Td>
                    <PromotionRowActions id={row.id} enabled={row.enabled} />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
