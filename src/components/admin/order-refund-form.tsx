'use client';

import { useActionState } from 'react';
import { recordCancelledOrderRefund } from '@/app/actions/returns';
import { Button } from '@/components/ui/button';
import { adminField } from '@/components/admin/admin-ui';
import type { ActionResult } from '@/lib/validation';

/** Records a provider-completed refund against a cancelled paid order. */
export function OrderRefundForm({ reference }: { reference: string }) {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(recordCancelledOrderRefund, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="reference" value={reference} />
      <p className="text-fg-muted text-xs">
        Complete the refund in the payment provider first, then record the
        amount here for accurate order and revenue reporting.
      </p>
      <label className="block">
        <span className="eyebrow text-fg-subtle">Refunded amount (LKR)</span>
        <input
          name="refundAmount"
          inputMode="decimal"
          required
          className={`${adminField} mt-2`}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          Record completed refund
        </Button>
        {state?.ok ? (
          <span role="status" className="text-signal-success text-xs">
            Refund recorded.
          </span>
        ) : null}
        {state && !state.ok ? (
          <span role="alert" className="text-signal-danger text-xs">
            {state.error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
