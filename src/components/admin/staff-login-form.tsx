'use client';

import { useActionState } from 'react';
import { staffSignIn } from '@/app/actions/staff-auth';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, Input } from '@/components/ui/field';
import type { ActionResult } from '@/lib/validation';

export function StaffLoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(staffSignIn, null);

  return (
    <form action={formAction} className="space-y-8">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state?.ok === false && !state.fieldErrors ? (
        <p
          role="alert"
          className="border-signal-danger text-signal-danger border-l px-4 py-2 text-sm"
        >
          {state.error}
        </p>
      ) : null}

      <Field error={state?.ok === false ? state.fieldErrors?.email : null}>
        <FieldLabel>Email address</FieldLabel>
        <Input
          type="email"
          name="email"
          autoComplete="email"
          autoFocus
          required
        />
      </Field>

      <Field error={state?.ok === false ? state.fieldErrors?.password : null}>
        <FieldLabel>Password</FieldLabel>
        <Input
          type="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={pending}
        loadingLabel="Signing in"
      >
        Sign in
      </Button>
    </form>
  );
}
