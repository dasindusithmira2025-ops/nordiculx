import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import {
  listReturns,
  nextStatuses,
  returnCounts,
  RETURN_STATUS_LABELS,
} from '@/lib/returns';
import { returnStatusEnum, type ReturnStatus } from '@/lib/db/schema';
import { formatMoney } from '@/lib/money';
import { Badge } from '@/components/ui/display';
import { NoRows, PageHeader, TabNav } from '@/components/admin/admin-ui';
import { ReturnDecision } from '@/components/admin/return-decision';

/**
 * Returns queue.
 *
 * Requested first, because that is the only tab with work in it. Each row
 * carries its whole context — order, customer, items, reason, note — so a
 * decision never needs a second page.
 */

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const TONE: Record<ReturnStatus, 'neutral' | 'success' | 'out' | 'low'> = {
  requested: 'low',
  approved: 'success',
  in_transit: 'neutral',
  received: 'neutral',
  refunded: 'success',
  rejected: 'out',
  cancelled: 'out',
};

export default async function AdminReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  await requireStaff('returns.manage');

  const params = await searchParams;
  const raw = Array.isArray(params.status) ? params.status[0] : params.status;
  const valid = new Set<string>(returnStatusEnum.enumValues);
  const status = (raw && valid.has(raw) ? raw : 'requested') as ReturnStatus;

  const [rows, counts] = await Promise.all([
    listReturns(status),
    returnCounts(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Aftersales"
        title={`${rows.length} ${RETURN_STATUS_LABELS[status].toLowerCase()}`}
        description="Requests raised by customers against delivered orders. Approving one does not move money — record the refund when you issue it."
        stats={[{ label: 'Open', value: counts.requested ?? 0 }]}
      />

      <TabNav
        label="Filter by status"
        current={status}
        items={returnStatusEnum.enumValues.map((value) => ({
          value,
          label: `${RETURN_STATUS_LABELS[value]}${counts[value] ? ` ${counts[value]}` : ''}`,
          href: `/admin/returns?status=${value}`,
        }))}
      />

      {rows.length === 0 ? (
        <NoRows>Nothing here — the queue is clear.</NoRows>
      ) : (
        <ul className="space-y-4">
          {rows.map((request) => {
            // What the returned units were paid for, as a starting figure.
            // Staff decide the actual refund; shipping is not assumed either way.
            const suggested = request.items.reduce(
              (total, item) => total + item.lineValue,
              0,
            );
            return (
              <li key={request.id} className="border-line border p-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <span className="text-fg font-mono text-xs">
                    {request.reference}
                  </span>
                  <Badge tone={TONE[request.status]}>
                    {RETURN_STATUS_LABELS[request.status]}
                  </Badge>
                  <Link
                    href={`/admin/orders/${request.orderReference}`}
                    className="link-underline text-fg-muted font-mono text-xs"
                  >
                    {request.orderReference}
                  </Link>
                  <span className="text-fg-muted text-xs">
                    {request.customerEmail}
                  </span>
                  <span className="text-fg-subtle ml-auto text-xs">
                    {dateFormat.format(request.createdAt)}
                  </span>
                </div>

                <p className="text-fg mt-3 text-sm">{request.reason}</p>
                <p className="text-fg-muted mt-1 text-xs">
                  {request.items
                    .map(
                      (item) =>
                        `${item.quantity} × ${item.productName} ${item.variantName}`,
                    )
                    .join(' · ')}{' '}
                  · order total {formatMoney(request.orderTotal)}
                </p>
                {request.customerNote ? (
                  <p className="text-fg-muted mt-2 max-w-prose text-sm whitespace-pre-line">
                    {request.customerNote}
                  </p>
                ) : null}

                <div className="border-line mt-4 border-t pt-4">
                  <ReturnDecision
                    id={request.id}
                    next={nextStatuses(request.status)}
                    staffNote={request.staffNote}
                    refundAmount={request.refundAmount}
                    suggestedRefund={suggested}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
