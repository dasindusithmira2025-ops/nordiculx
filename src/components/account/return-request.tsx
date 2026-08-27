'use client';

import { useActionState, useState } from 'react';
import { requestReturn } from '@/app/actions/returns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/display';
import { formatMoney } from '@/lib/money';
import {
  RETURN_REASONS,
  RETURN_STATUS_LABELS,
  type ReturnEligibility,
  type ReturnSummary,
} from '@/lib/returns/model';
import type { ActionResult } from '@/lib/validation';

/**
 * Requesting a return, from the order it belongs to.
 *
 * Quantities are capped at what is still returnable, and the server re-derives
 * that cap on submit — this is the convenience, not the rule. Existing requests
 * are listed above the form so a customer can see where one has got to instead
 * of raising a second.
 */

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const STATUS_TONE = {
  requested: 'neutral',
  approved: 'success',
  in_transit: 'neutral',
  received: 'neutral',
  refunded: 'success',
  rejected: 'out',
  cancelled: 'out',
} as const;

export function ReturnRequest({
  orderReference,
  eligibility,
  existing,
}: {
  orderReference: string;
  eligibility: ReturnEligibility;
  existing: ReturnSummary[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<
    ActionResult<{ reference: string } | undefined> | null,
    FormData
  >(async (previous, formData) => requestReturn(previous, formData), null);

  return (
    <section aria-label="Returns" className="border-line mt-12 border-t pt-10">
      <h2 className="font-display text-fg text-xl">Returns</h2>

      {existing.length > 0 ? (
        <ul className="mt-5 space-y-4">
          {existing.map((request) => (
            <li key={request.id} className="border-line border p-4 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-fg font-mono text-xs">
                  {request.reference}
                </span>
                <Badge tone={STATUS_TONE[request.status]}>
                  {RETURN_STATUS_LABELS[request.status]}
                </Badge>
                <span className="text-fg-subtle text-xs">
                  {dateFormat.format(request.createdAt)}
                </span>
              </div>
              <p className="text-fg-muted mt-2 text-xs">
                {request.reason} ·{' '}
                {request.items
                  .map((item) => `${item.quantity} × ${item.productName}`)
                  .join(', ')}
              </p>
              {request.staffNote ? (
                <p className="text-fg-muted mt-2 text-xs">
                  <span className="text-fg-subtle">Nordic Lux:</span>{' '}
                  {request.staffNote}
                </p>
              ) : null}
              {request.refundAmount !== null ? (
                <p className="text-fg mt-2 text-xs">
                  Refund {formatMoney(request.refundAmount)}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {state?.ok && state.data ? (
        <p role="status" className="text-signal-success mt-5 text-sm">
          Return {state.data.reference} requested. We will email you once it has
          been reviewed.
        </p>
      ) : null}

      {!eligibility.eligible ? (
        <p className="text-fg-muted mt-4 text-sm">
          {eligibility.reason === 'not_delivered'
            ? 'Returns open once your order has been delivered.'
            : eligibility.reason === 'window_closed'
              ? 'The 14-day return window for this order has closed. Contact us if something is wrong.'
              : 'Everything on this order has already been returned.'}
        </p>
      ) : !open ? (
        <div className="mt-4">
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Request a return
          </Button>
          <p className="text-fg-subtle mt-2 text-xs">
            Open until {dateFormat.format(eligibility.closesOn)}.
          </p>
        </div>
      ) : (
        <form action={formAction} className="mt-5 max-w-prose space-y-6">
          <input type="hidden" name="reference" value={orderReference} />

          <fieldset>
            <legend className="eyebrow text-fg-subtle">
              What are you sending back?
            </legend>
            <ul className="mt-3 space-y-3">
              {eligibility.items.map((item) => (
                <li
                  key={item.orderItemId}
                  className="flex flex-wrap items-center gap-4 text-sm"
                >
                  <label className="flex items-center gap-3">
                    <input
                      type="number"
                      name={`qty:${item.orderItemId}`}
                      min={0}
                      max={item.returnable}
                      defaultValue={0}
                      className="border-line-strong focus:border-fg text-fg w-16 border-0 border-b bg-transparent py-1 text-sm outline-none"
                    />
                    <span className="text-fg">
                      {item.productName}
                      <span className="text-fg-subtle">
                        {' '}
                        {item.variantName}
                      </span>
                    </span>
                  </label>
                  <span className="text-fg-subtle text-xs">
                    up to {item.returnable} · {formatMoney(item.unitPrice)} each
                  </span>
                </li>
              ))}
            </ul>
          </fieldset>

          <label className="block">
            <span className="eyebrow text-fg-subtle">Reason</span>
            <select
              name="reason"
              required
              defaultValue=""
              className="border-line-strong focus:border-fg text-fg mt-2 w-full border-0 border-b bg-transparent py-2 text-sm outline-none"
            >
              <option value="" disabled>
                Choose a reason
              </option>
              {RETURN_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="eyebrow text-fg-subtle">
              Anything else? (optional)
            </span>
            <textarea
              name="note"
              rows={3}
              maxLength={1000}
              className="border-line-strong focus:border-fg text-fg mt-2 w-full border bg-transparent p-3 text-sm outline-none"
            />
          </label>

          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" disabled={pending}>
              Submit return request
            </Button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-fg-subtle hover:text-fg link-underline text-xs"
            >
              Cancel
            </button>
          </div>

          {state && !state.ok ? (
            <p role="alert" className="text-signal-danger text-sm">
              {state.error}
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}
