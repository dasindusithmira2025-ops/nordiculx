'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { register, signIn } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, Input } from '@/components/ui/field';
import type { ActionResult } from '@/lib/validation';

/**
 * Sign-in and registration forms.
 *
 * Real `<form action>` elements, so both work before hydration.
 * `autoComplete` is set precisely — `current-password` vs `new-password` is what
 * lets a password manager offer the right thing and generate a strong one on
 * registration.
 *
 * The `next` destination is carried in a hidden field and validated on the
 * server; the client is not trusted with where to send somebody after they
 * authenticate.
 */

function FormError({ state }: { state: ActionResult | null }) {
  if (!state || state.ok || state.fieldErrors) return null;
  return (
    <p
      role="alert"
      className="border-signal-danger text-signal-danger border-l px-4 py-2 text-sm"
    >
      {state.error}
    </p>
  );
}

export function SignInForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(signIn, null);

  return (
    <form action={formAction} className="space-y-8">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <FormError state={state} />

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

      <p className="text-fg-muted text-center text-sm">
        No account yet?{' '}
        <Link
          href={
            next
              ? `/account/register?next=${encodeURIComponent(next)}`
              : '/account/register'
          }
          className="text-fg link-underline"
        >
          Create one
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(register, null);

  const error = (field: string) =>
    state?.ok === false ? state.fieldErrors?.[field] : null;

  return (
    <form action={formAction} className="space-y-8">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <FormError state={state} />

      <div className="grid gap-8 sm:grid-cols-2">
        <Field error={error('firstName')}>
          <FieldLabel>First name</FieldLabel>
          <Input
            name="firstName"
            autoComplete="given-name"
            autoFocus
            required
          />
        </Field>
        <Field error={error('lastName')}>
          <FieldLabel>Last name</FieldLabel>
          <Input name="lastName" autoComplete="family-name" required />
        </Field>
      </div>

      <Field error={error('email')}>
        <FieldLabel>Email address</FieldLabel>
        <Input type="email" name="email" autoComplete="email" required />
      </Field>

      <Field
        error={error('password')}
        hint="At least 10 characters. A short phrase is easier to remember and harder to guess than a mangled word."
      >
        <FieldLabel>Password</FieldLabel>
        <Input
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </Field>

      {/* Unticked by definition — a pre-selected consent box is not consent. */}
      <label className="text-fg-subtle flex cursor-pointer items-start gap-3 text-xs">
        <input
          type="checkbox"
          name="marketingOptIn"
          className="mt-0.5 size-3.5 shrink-0 accent-current"
        />
        <span>
          Email me occasionally about new arrivals and the journal. You can
          unsubscribe from any of them.
        </span>
      </label>

      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={pending}
        loadingLabel="Creating account"
      >
        Create account
      </Button>

      <p className="text-fg-muted text-center text-sm">
        Already have an account?{' '}
        <Link
          href={
            next
              ? `/account/login?next=${encodeURIComponent(next)}`
              : '/account/login'
          }
          className="text-fg link-underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
