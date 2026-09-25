'use client';

import { useActionState, useState } from 'react';
import type { addresses } from '@/lib/db/schema';
import { submitCheckout } from '@/app/actions/checkout';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, Input, Textarea } from '@/components/ui/field';
import { Rule } from '@/components/ui/display';
import { cn } from '@/lib/cn';
import type { ActionResult } from '@/lib/validation';

type Address = typeof addresses.$inferSelect;

/**
 * Checkout form.
 *
 * One page, not a wizard. A multi-step checkout hides how much is left to do and
 * loses answers when somebody goes back; a single form with clear sections can
 * be filled top to bottom and survives a reload.
 *
 * Billing defaults to the delivery address and only appears when it differs.
 * Asking everybody for two addresses to serve the few who need it is one of the
 * most common needless drop-off points in a checkout.
 */
export function CheckoutForm({
  savedAddresses,
  defaultEmail,
  defaultPhone,
}: {
  savedAddresses: Address[];
  defaultEmail?: string;
  defaultPhone?: string;
}) {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(submitCheckout, null);

  const preselected =
    savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0] ?? null;

  const [selectedId, setSelectedId] = useState<string>(
    preselected ? preselected.id : 'new',
  );
  const [billingSame, setBillingSame] = useState(true);

  const chosen =
    selectedId === 'new'
      ? null
      : (savedAddresses.find((a) => a.id === selectedId) ?? null);

  const error = (field: string) =>
    state?.ok === false ? state.fieldErrors?.[field] : null;

  return (
    <form action={formAction} className="space-y-12">
      {state?.ok === false && !state.fieldErrors ? (
        <p
          role="alert"
          className="border-signal-danger text-signal-danger border-l px-4 py-3 text-sm"
        >
          {state.error}
        </p>
      ) : null}

      {/* --- contact --- */}
      <section>
        <h2 className="font-display text-display-sm text-fg mb-6">Contact</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            error={error('email')}
            hint="Your receipt and tracking updates go here."
          >
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
            error={error('phone')}
            hint="Used for delivery questions."
          >
            <FieldLabel>Phone</FieldLabel>
            <Input
              type="tel"
              name="phone"
              autoComplete="tel"
              required
              placeholder="0771234567"
              defaultValue={defaultPhone}
            />
          </Field>
        </div>
      </section>

      <Rule />

      {/* --- delivery --- */}
      <section>
        <h2 className="font-display text-display-sm text-fg mb-6">Delivery</h2>

        {savedAddresses.length > 0 ? (
          <fieldset className="mb-8">
            <legend className="eyebrow text-fg-subtle mb-4">Deliver to</legend>
            <div className="space-y-3">
              {savedAddresses.map((address) => (
                <label
                  key={address.id}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 border p-4 text-sm transition-colors',
                    selectedId === address.id
                      ? 'border-fg bg-accent-soft'
                      : 'border-line hover:border-fg-muted',
                  )}
                >
                  <input
                    type="radio"
                    name="savedAddress"
                    value={address.id}
                    checked={selectedId === address.id}
                    onChange={() => setSelectedId(address.id)}
                    className="mt-1 shrink-0 accent-current"
                  />
                  <span>
                    <span className="text-fg block">
                      {address.recipientName}
                      {address.label ? (
                        <span className="text-fg-subtle">
                          {' '}
                          · {address.label}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-fg-muted mt-1 block">
                      {address.line1}
                      {address.line2 ? `, ${address.line2}` : ''},{' '}
                      {address.city}
                    </span>
                  </span>
                </label>
              ))}

              <label
                className={cn(
                  'flex cursor-pointer items-center gap-3 border p-4 text-sm transition-colors',
                  selectedId === 'new'
                    ? 'border-fg bg-accent-soft'
                    : 'border-line hover:border-fg-muted',
                )}
              >
                <input
                  type="radio"
                  name="savedAddress"
                  value="new"
                  checked={selectedId === 'new'}
                  onChange={() => setSelectedId('new')}
                  className="shrink-0 accent-current"
                />
                <span className="text-fg">Use a different address</span>
              </label>
            </div>
          </fieldset>
        ) : null}

        {/*
          The address fields are always submitted; picking a saved address only
          prefills them, so the server receives one consistent shape either way.
          `key` forces React to remount them when the selection changes, which is
          what makes `defaultValue` pick up the newly chosen address.
        */}
        <div key={selectedId} className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <Field error={error('shipping.recipientName')}>
              <FieldLabel>Recipient name</FieldLabel>
              <Input
                name="shipping.recipientName"
                autoComplete="name"
                required
                defaultValue={chosen?.recipientName ?? ''}
              />
            </Field>
            <Field error={error('shipping.phone')}>
              <FieldLabel>Delivery phone</FieldLabel>
              <Input
                name="shipping.phone"
                type="tel"
                autoComplete="tel"
                required
                placeholder="0771234567"
                defaultValue={chosen?.phone ?? defaultPhone ?? ''}
              />
            </Field>
          </div>

          <Field error={error('shipping.line1')}>
            <FieldLabel>Address</FieldLabel>
            <Input
              name="shipping.line1"
              autoComplete="address-line1"
              required
              defaultValue={chosen?.line1 ?? ''}
            />
          </Field>

          <Field error={error('shipping.line2')}>
            <FieldLabel optional>Apartment, floor, landmark</FieldLabel>
            <Input
              name="shipping.line2"
              autoComplete="address-line2"
              defaultValue={chosen?.line2 ?? ''}
            />
          </Field>

          <div className="grid gap-6 sm:grid-cols-3">
            <Field error={error('shipping.city')}>
              <FieldLabel>City</FieldLabel>
              <Input
                name="shipping.city"
                autoComplete="address-level2"
                required
                defaultValue={chosen?.city ?? ''}
              />
            </Field>
            <Field error={error('shipping.district')}>
              <FieldLabel optional>District</FieldLabel>
              <Input
                name="shipping.district"
                autoComplete="address-level1"
                defaultValue={chosen?.district ?? ''}
              />
            </Field>
            <Field error={error('shipping.postalCode')}>
              <FieldLabel optional>Postal code</FieldLabel>
              <Input
                name="shipping.postalCode"
                autoComplete="postal-code"
                defaultValue={chosen?.postalCode ?? ''}
              />
            </Field>
          </div>

          <input type="hidden" name="shipping.country" value="LK" />
        </div>
      </section>

      <Rule />

      {/* --- billing --- */}
      <section>
        <h2 className="font-display text-display-sm text-fg mb-6">Billing</h2>

        <label className="text-fg flex cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="billingSameAsShipping"
            checked={billingSame}
            onChange={(e) => setBillingSame(e.target.checked)}
            className="size-3.5 shrink-0 accent-current"
          />
          Billing address is the same as delivery
        </label>

        {billingSame ? null : (
          <div className="mt-8 space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <Field error={error('billing.recipientName')}>
                <FieldLabel>Name on the bill</FieldLabel>
                <Input name="billing.recipientName" required />
              </Field>
              <Field error={error('billing.phone')}>
                <FieldLabel>Phone</FieldLabel>
                <Input
                  name="billing.phone"
                  type="tel"
                  required
                  placeholder="0771234567"
                />
              </Field>
            </div>

            <Field error={error('billing.line1')}>
              <FieldLabel>Address</FieldLabel>
              <Input name="billing.line1" required />
            </Field>

            <Field error={error('billing.line2')}>
              <FieldLabel optional>Address line 2</FieldLabel>
              <Input name="billing.line2" />
            </Field>

            <div className="grid gap-6 sm:grid-cols-3">
              <Field error={error('billing.city')}>
                <FieldLabel>City</FieldLabel>
                <Input name="billing.city" required />
              </Field>
              <Field error={error('billing.district')}>
                <FieldLabel optional>District</FieldLabel>
                <Input name="billing.district" />
              </Field>
              <Field error={error('billing.postalCode')}>
                <FieldLabel optional>Postal code</FieldLabel>
                <Input name="billing.postalCode" />
              </Field>
            </div>

            <input type="hidden" name="billing.country" value="LK" />
          </div>
        )}
      </section>

      <Rule />

      <section>
        <Field error={error('note')}>
          <FieldLabel optional>Anything we should know?</FieldLabel>
          <Textarea
            name="note"
            rows={3}
            maxLength={500}
            placeholder="Delivery instructions, a gift note…"
          />
        </Field>
      </section>

      <div>
        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={pending}
          loadingLabel="Placing your order"
        >
          Place order
        </Button>
        <p className="text-fg-subtle mt-4 text-center text-xs">
          You will see a confirmation before anything is dispatched.
        </p>
      </div>
    </form>
  );
}
