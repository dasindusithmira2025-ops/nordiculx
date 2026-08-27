'use client';

import { useActionState } from 'react';
import { subscribeBackInStock } from '@/app/actions/back-in-stock';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/validation';

/**
 * "Tell me when this is back".
 *
 * Shown in place of Add to Bag when a variant is out of stock. Guests may
 * subscribe — requiring an account here would lose most of the requests — so
 * the email address is the identity and the server dedupes on it.
 */
export function BackInStockForm({
  variantId,
  defaultEmail,
}: {
  variantId: string;
  defaultEmail?: string;
}) {
  const [state, formAction, pending] = useActionState<
    ActionResult<{ alreadyInStock: boolean } | undefined> | null,
    FormData
  >(
    async (previous, formData) => subscribeBackInStock(previous, formData),
    null,
  );

  if (state?.ok) {
    return (
      <p role="status" className="text-fg-muted mt-6 text-sm">
        {state.data?.alreadyInStock
          ? 'Good news — this is back in stock now. Refresh to add it to your bag.'
          : 'We will email you once this is back. One message, then we stop.'}
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-6">
      <input type="hidden" name="variantId" value={variantId} />
      <label htmlFor="back-in-stock-email" className="eyebrow text-fg-subtle">
        Tell me when this is back
      </label>
      <div className="mt-2 flex max-w-sm gap-3">
        <input
          id="back-in-stock-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={defaultEmail}
          placeholder="you@example.com"
          className="border-line-strong focus:border-fg text-fg min-w-0 flex-1 border-0 border-b bg-transparent py-2 text-sm outline-none"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          Notify me
        </Button>
      </div>
      {state && !state.ok ? (
        <p role="alert" className="text-signal-danger mt-2 text-xs">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
