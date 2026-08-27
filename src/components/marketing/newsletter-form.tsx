'use client';

import { useActionState } from 'react';
import { subscribeToNewsletter } from '@/app/actions/newsletter';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, Input } from '@/components/ui/field';
import { CheckIcon } from '@/components/ui/icons';
import type { ActionResult } from '@/lib/validation';

/**
 * Newsletter capture.
 *
 * A plain <form action={...}> so it works before hydration; `useActionState`
 * only adds the pending state and the inline result. Consent is an explicit,
 * unticked checkbox — never pre-selected.
 */
export function NewsletterForm({ source = 'footer' }: { source?: string }) {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(subscribeToNewsletter, null);

  if (state?.ok) {
    return (
      <p role="status" className="text-fg-muted flex items-start gap-2 text-sm">
        <CheckIcon width={16} height={16} className="text-fg mt-0.5 shrink-0" />
        <span>
          Thank you — if that address is not already on the list, you will hear
          from us shortly.
        </span>
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="source" value={source} />

      <div className="flex items-end gap-3">
        <Field
          className="flex-1"
          error={
            state?.fieldErrors?.email ??
            (state?.ok === false ? state.error : null)
          }
        >
          <FieldLabel>Email address</FieldLabel>
          <Input
            type="email"
            name="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
        </Field>
        <Button type="submit" loading={pending} loadingLabel="Subscribing">
          Join
        </Button>
      </div>

      <label className="text-fg-subtle flex cursor-pointer items-start gap-3 text-xs">
        <input
          type="checkbox"
          name="consent"
          required
          className="mt-0.5 size-3.5 shrink-0 accent-current"
        />
        <span>
          I would like to receive occasional emails from Nordic Lux. You can
          unsubscribe from any of them.
        </span>
      </label>
    </form>
  );
}
