'use client';

import { useActionState } from 'react';
import { applyPromotionCode, removePromotionCode } from '@/app/actions/cart';
import type { ActionResult } from '@/lib/validation';

/**
 * Promotion code entry.
 *
 * `applyPromotionCode` validates and stores the code server-side, then
 * re-reads the cart to confirm it actually discounts something — this is only
 * the input for it. The code was previously unreachable from the storefront:
 * the action existed and nothing called it, so no customer could ever redeem
 * one.
 */
export function PromotionCodeForm({ applied }: { applied: string | null }) {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(async (_previous, formData) => {
    if (formData.get('intent') === 'remove') return removePromotionCode();
    return applyPromotionCode(String(formData.get('code') ?? ''));
  }, null);

  if (applied) {
    return (
      <form action={formAction} className="mt-6">
        <input type="hidden" name="intent" value="remove" />
        <p className="text-fg-muted flex items-center justify-between text-xs">
          <span>
            Code <strong className="text-fg font-medium">{applied}</strong>{' '}
            applied
          </span>
          <button
            type="submit"
            disabled={pending}
            className="link-underline hover:text-fg disabled:opacity-40"
          >
            Remove
          </button>
        </p>
      </form>
    );
  }

  return (
    <form action={formAction} className="mt-6">
      <label htmlFor="promotion-code" className="eyebrow text-fg-subtle">
        Promotion code
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="promotion-code"
          name="code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="border-line-strong focus:border-fg text-fg min-w-0 flex-1 border-0 border-b bg-transparent py-1.5 text-sm uppercase outline-none"
        />
        <button
          type="submit"
          disabled={pending}
          className="eyebrow text-fg-muted hover:text-fg link-underline disabled:opacity-40"
        >
          Apply
        </button>
      </div>
      {state && !state.ok ? (
        <p role="alert" className="text-signal-danger mt-2 text-xs">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
