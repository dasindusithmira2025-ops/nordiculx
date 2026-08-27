'use client';

import { useActionState } from 'react';
import { requestOrderLink } from '@/app/actions/track';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, Input } from '@/components/ui/field';
import { CheckIcon } from '@/components/ui/icons';
import type { ActionResult } from '@/lib/validation';

/**
 * Order lookup.
 *
 * The success message is deliberately non-committal and is shown whether or not
 * anything matched, so the form cannot be used to discover which references
 * exist or which address placed an order.
 */
export function TrackForm({ defaultReference }: { defaultReference?: string }) {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(requestOrderLink, null);

  if (state?.ok) {
    return (
      <div role="status" className="border-line-strong border-l px-5 py-4">
        <p className="text-fg flex items-start gap-3 text-sm">
          <CheckIcon width={16} height={16} className="mt-0.5 shrink-0" />
          <span>
            If that reference and email match an order, we have just emailed a
            link to it. The link works for thirty days.
          </span>
        </p>
      </div>
    );
  }

  const error = (field: string) =>
    state?.ok === false ? state.fieldErrors?.[field] : null;

  return (
    <form action={formAction} className="space-y-8">
      {state?.ok === false && !state.fieldErrors ? (
        <p role="alert" className="text-signal-danger text-sm">
          {state.error}
        </p>
      ) : null}

      <Field
        error={error('reference')}
        hint="On your confirmation email, in the form NL-XXXX-XXXX."
      >
        <FieldLabel>Order reference</FieldLabel>
        <Input
          name="reference"
          required
          autoFocus
          placeholder="NL-XXXX-XXXX"
          defaultValue={defaultReference}
        />
      </Field>

      <Field error={error('email')}>
        <FieldLabel>Email address</FieldLabel>
        <Input
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </Field>

      <Button
        type="submit"
        size="lg"
        loading={pending}
        loadingLabel="Looking it up"
      >
        Email me the link
      </Button>
    </form>
  );
}
