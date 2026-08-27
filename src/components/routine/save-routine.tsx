'use client';

import { useActionState } from 'react';
import { saveRoutine } from '@/app/actions/routine';
import type { RoutineAnswers } from '@/lib/routine/engine';
import { publicConfig } from '@/lib/public-config';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, Input } from '@/components/ui/field';
import { CheckIcon } from '@/components/ui/icons';
import type { ActionResult } from '@/lib/validation';

/**
 * "Keep this routine" — persists the result and hands back a short code.
 *
 * Only the answers are submitted. The server recomputes the recommendations
 * from them, so the form cannot dictate which products get written into a saved
 * routine.
 */
export function SaveRoutine({
  answers,
  recommendations,
  defaultEmail,
}: {
  answers: RoutineAnswers;
  /** Rendered for the visitor's benefit only; never submitted. */
  recommendations: { step: string; productId: string; rationale?: string }[];
  defaultEmail?: string;
}) {
  const [state, formAction, pending] = useActionState<
    ActionResult<{ reference: string }> | null,
    FormData
  >(saveRoutine, null);

  const serialised = new URLSearchParams();
  for (const [key, values] of Object.entries(answers)) {
    for (const value of values) serialised.append(key, value);
  }

  if (state?.ok) {
    const url = `${publicConfig.appUrl}/routine-finder/${state.data.reference}`;
    return (
      <div role="status" className="max-w-xl">
        <p className="font-display text-fg flex items-start gap-3 text-xl">
          <CheckIcon width={18} height={18} className="mt-1.5 shrink-0" />
          Saved
        </p>
        <p className="text-fg-muted mt-3 text-sm">
          Your routine is kept at{' '}
          <a
            href={`/routine-finder/${state.data.reference}`}
            className="text-fg link-underline break-all"
          >
            {url}
          </a>
          . The code is{' '}
          <strong className="text-fg font-medium">
            {state.data.reference}
          </strong>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="max-w-xl">
      <input type="hidden" name="answers" value={serialised.toString()} />

      <h2 className="font-display text-display-sm text-fg">
        Keep this routine
      </h2>
      <p className="text-fg-muted mt-3 text-sm">
        We will give you a short code so you can come back to these{' '}
        {recommendations.length} steps without answering again.
      </p>

      <div className="mt-8 flex flex-wrap items-end gap-4">
        {defaultEmail ? null : (
          <Field className="min-w-64 flex-1">
            <FieldLabel optional>Email it to me</FieldLabel>
            <Input
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
            />
          </Field>
        )}
        <Button type="submit" loading={pending} loadingLabel="Saving">
          Save routine
        </Button>
      </div>

      {state?.ok === false ? (
        <p role="alert" className="text-signal-danger mt-4 text-sm">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
