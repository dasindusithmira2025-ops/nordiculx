'use client';

import { useActionState } from 'react';
import { decideReturn } from '@/app/actions/returns';
import { Button } from '@/components/ui/button';
import { adminField } from '@/components/admin/admin-ui';
import { RETURN_STATUS_LABELS } from '@/lib/returns/model';
import type { ReturnStatus } from '@/lib/db/schema';
import type { ActionResult } from '@/lib/validation';

/**
 * Moving one return along.
 *
 * Only the transitions the workflow actually permits are offered; the server
 * re-checks the same table, so a stale page cannot refund a return twice.
 */
export function ReturnDecision({
  id,
  next,
  staffNote,
  refundAmount,
  suggestedRefund,
}: {
  id: string;
  next: ReturnStatus[];
  staffNote: string | null;
  refundAmount: number | null;
  suggestedRefund: number;
}) {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(async (previous, formData) => decideReturn(previous, formData), null);

  if (next.length === 0) {
    return (
      <p className="text-fg-subtle text-xs">
        This return is closed. Any correction is a new request.
      </p>
    );
  }

  const money = (cents: number | null) =>
    cents === null ? '' : (cents / 100).toFixed(2);

  return (
    <form
      action={formAction}
      className="grid gap-4 lg:grid-cols-[10rem_8rem_minmax(0,1fr)_auto] lg:items-end"
    >
      <input type="hidden" name="id" value={id} />

      <label className="block">
        <span className="eyebrow text-fg-subtle">Move to</span>
        <select name="status" className={adminField} required>
          {next.map((status) => (
            <option key={status} value={status}>
              {RETURN_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="eyebrow text-fg-subtle">Refund (USD)</span>
        <input
          name="refundAmount"
          inputMode="decimal"
          defaultValue={money(refundAmount)}
          placeholder={money(suggestedRefund)}
          className={adminField}
        />
      </label>

      <label className="block">
        <span className="eyebrow text-fg-subtle">Note to customer</span>
        <input
          name="staffNote"
          maxLength={1000}
          defaultValue={staffNote ?? ''}
          className={adminField}
        />
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          Apply
        </Button>
        {state && !state.ok ? (
          <span role="alert" className="text-signal-danger text-xs">
            {state.error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
