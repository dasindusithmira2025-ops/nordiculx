'use client';

import { useActionState } from 'react';
import { changePassword } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, Input } from '@/components/ui/field';
import { CheckIcon } from '@/components/ui/icons';
import type { ActionResult } from '@/lib/validation';

/**
 * Password change.
 *
 * Asks for the current password even though the visitor is already signed in:
 * that is what stops somebody who has borrowed an unlocked laptop from taking
 * the account over. On success every other session is revoked server-side, which
 * is stated here so the customer knows their other devices will need signing in
 * again — an unexplained sign-out reads as a bug.
 */
export function PasswordForm() {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(changePassword, null);

  const error = (field: string) =>
    state?.ok === false ? state.fieldErrors?.[field] : null;

  return (
    <form action={formAction} className="max-w-md space-y-6">
      {state?.ok ? (
        <p
          role="status"
          className="text-fg-muted flex items-start gap-2 text-sm"
        >
          <CheckIcon
            width={16}
            height={16}
            className="text-fg mt-0.5 shrink-0"
          />
          <span>
            Password changed. Any other device signed in to this account has
            been signed out.
          </span>
        </p>
      ) : null}

      {state?.ok === false && !state.fieldErrors ? (
        <p role="alert" className="text-signal-danger text-sm">
          {state.error}
        </p>
      ) : null}

      <Field error={error('currentPassword')}>
        <FieldLabel>Current password</FieldLabel>
        <Input
          type="password"
          name="currentPassword"
          autoComplete="current-password"
          required
        />
      </Field>

      <Field error={error('newPassword')} hint="At least 10 characters.">
        <FieldLabel>New password</FieldLabel>
        <Input
          type="password"
          name="newPassword"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </Field>

      <Button type="submit" loading={pending} loadingLabel="Updating">
        Change password
      </Button>
    </form>
  );
}
