'use client';

import { useActionState } from 'react';
import { submitContactForm } from '@/app/actions/support';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldLabel,
  Input,
  Select,
  Textarea,
} from '@/components/ui/field';
import { CheckIcon } from '@/components/ui/icons';
import type { ActionResult } from '@/lib/validation';

const SUBJECTS = [
  'An order',
  'Delivery',
  'A return or refund',
  'Product advice',
  'Authenticity',
  'Something else',
];

/**
 * Contact form.
 *
 * A real `<form action>` so it submits without JavaScript; `useActionState`
 * adds only the pending state and the result. On success the form is replaced
 * by the reference rather than reset — leaving the filled form on screen
 * invites a duplicate submission.
 */
export function ContactForm({
  defaultEmail,
  defaultName,
}: {
  defaultEmail?: string;
  defaultName?: string;
}) {
  const [state, formAction, pending] = useActionState<
    ActionResult<{ reference: string }> | null,
    FormData
  >(submitContactForm, null);

  if (state?.ok) {
    return (
      <div
        role="status"
        className="border-line-strong flex items-start gap-4 border p-8"
      >
        <CheckIcon width={20} height={20} className="text-fg mt-0.5 shrink-0" />
        <div>
          <p className="font-display text-fg text-xl">Message received</p>
          <p className="text-fg-muted mt-3 text-sm">
            We will reply within one working day. Your reference is{' '}
            <strong className="text-fg font-medium">
              {state.data.reference}
            </strong>
            — quote it if you follow up.
          </p>
        </div>
      </div>
    );
  }

  const fieldError = (name: string) => state?.fieldErrors?.[name] ?? null;

  return (
    <form action={formAction} className="space-y-8">
      <div className="grid gap-8 sm:grid-cols-2">
        <Field error={fieldError('name')}>
          <FieldLabel>Your name</FieldLabel>
          <Input
            name="name"
            autoComplete="name"
            required
            defaultValue={defaultName}
          />
        </Field>

        <Field error={fieldError('email')}>
          <FieldLabel>Email address</FieldLabel>
          <Input
            type="email"
            name="email"
            autoComplete="email"
            required
            defaultValue={defaultEmail}
          />
        </Field>

        <Field
          error={fieldError('phone')}
          hint="So we can call if it is faster"
        >
          <FieldLabel optional>Phone</FieldLabel>
          <Input
            type="tel"
            name="phone"
            autoComplete="tel"
            placeholder="0771234567"
          />
        </Field>

        <Field error={fieldError('orderReference')}>
          <FieldLabel optional>Order reference</FieldLabel>
          <Input name="orderReference" placeholder="NL-XXXX-XXXX" />
        </Field>
      </div>

      <Field error={fieldError('subject')}>
        <FieldLabel>What is this about?</FieldLabel>
        <Select name="subject" required defaultValue="">
          <option value="" disabled>
            Choose one
          </option>
          {SUBJECTS.map((subject) => (
            <option key={subject} value={subject}>
              {subject}
            </option>
          ))}
        </Select>
      </Field>

      <Field error={fieldError('message')}>
        <FieldLabel>Message</FieldLabel>
        <Textarea name="message" rows={6} required />
      </Field>

      {state?.ok === false && !state.fieldErrors ? (
        <p role="alert" className="text-signal-danger text-sm">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" loading={pending} loadingLabel="Sending">
        Send message
      </Button>
    </form>
  );
}
