'use client';

import { useActionState, useState, useTransition } from 'react';
import type { addresses } from '@/lib/db/schema';
import {
  deleteAddress,
  saveAddress,
  setDefaultAddress,
} from '@/app/actions/addresses';
import { Button, IconButton } from '@/components/ui/button';
import { Field, FieldLabel, Input } from '@/components/ui/field';
import { Modal } from '@/components/ui/overlay';
import { Badge } from '@/components/ui/display';
import { PlusIcon, TrashIcon } from '@/components/ui/icons';
import type { ActionResult } from '@/lib/validation';

type Address = typeof addresses.$inferSelect;

/**
 * Address book.
 *
 * The form lives in a modal so the list stays the page's subject. Deleting asks
 * for confirmation inline rather than via `window.confirm`, which blocks the
 * whole tab and cannot be styled or made accessible.
 */
function AddressForm({
  address,
  onDone,
}: {
  address?: Address;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(async (prev, formData) => {
    const result = await saveAddress(prev, formData);
    if (result.ok) onDone();
    return result;
  }, null);

  const error = (field: string) =>
    state?.ok === false ? state.fieldErrors?.[field] : null;

  return (
    <form action={formAction} className="space-y-6">
      {address ? <input type="hidden" name="id" value={address.id} /> : null}

      {state?.ok === false && !state.fieldErrors ? (
        <p role="alert" className="text-signal-danger text-sm">
          {state.error}
        </p>
      ) : null}

      <Field error={error('label')}>
        <FieldLabel optional>Label</FieldLabel>
        <Input
          name="label"
          placeholder="Home, Office…"
          defaultValue={address?.label ?? ''}
        />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field error={error('recipientName')}>
          <FieldLabel>Recipient name</FieldLabel>
          <Input
            name="recipientName"
            autoComplete="name"
            required
            defaultValue={address?.recipientName ?? ''}
          />
        </Field>
        <Field error={error('phone')}>
          <FieldLabel>Phone</FieldLabel>
          <Input
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            placeholder="0771234567"
            defaultValue={address?.phone ?? ''}
          />
        </Field>
      </div>

      <Field error={error('line1')}>
        <FieldLabel>Address</FieldLabel>
        <Input
          name="line1"
          autoComplete="address-line1"
          required
          defaultValue={address?.line1 ?? ''}
        />
      </Field>

      <Field error={error('line2')}>
        <FieldLabel optional>Address line 2</FieldLabel>
        <Input
          name="line2"
          autoComplete="address-line2"
          defaultValue={address?.line2 ?? ''}
        />
      </Field>

      <div className="grid gap-6 sm:grid-cols-3">
        <Field error={error('city')}>
          <FieldLabel>City</FieldLabel>
          <Input
            name="city"
            autoComplete="address-level2"
            required
            defaultValue={address?.city ?? ''}
          />
        </Field>
        <Field error={error('district')}>
          <FieldLabel optional>District</FieldLabel>
          <Input
            name="district"
            autoComplete="address-level1"
            defaultValue={address?.district ?? ''}
          />
        </Field>
        <Field error={error('postalCode')}>
          <FieldLabel optional>Postal code</FieldLabel>
          <Input
            name="postalCode"
            autoComplete="postal-code"
            defaultValue={address?.postalCode ?? ''}
          />
        </Field>
      </div>

      <label className="text-fg flex cursor-pointer items-center gap-3 text-sm">
        <input
          type="checkbox"
          name="isDefault"
          defaultChecked={address?.isDefault ?? false}
          className="size-3.5 shrink-0 accent-current"
        />
        Use as my default delivery address
      </label>

      <div className="flex justify-end gap-4 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={pending} loadingLabel="Saving">
          {address ? 'Save changes' : 'Add address'}
        </Button>
      </div>
    </form>
  );
}

function AddressCard({ address }: { address: Address }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <li className="border-line border p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          {address.label ? (
            <p className="eyebrow text-fg-subtle mb-2">{address.label}</p>
          ) : null}
          <p className="text-fg text-sm">{address.recipientName}</p>
          <p className="text-fg-muted mt-1 text-sm leading-relaxed">
            {address.line1}
            {address.line2 ? `, ${address.line2}` : ''}
            <br />
            {address.city}
            {address.district ? `, ${address.district}` : ''}
            {address.postalCode ? ` ${address.postalCode}` : ''}
          </p>
          <p className="text-fg-subtle mt-2 text-xs">{address.phone}</p>
        </div>

        {address.isDefault ? <Badge tone="neutral">Default</Badge> : null}
      </div>

      <div className="border-line mt-5 flex items-center gap-5 border-t pt-4">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="eyebrow text-fg-subtle hover:text-fg link-underline"
        >
          Edit
        </button>

        {address.isDefault ? null : (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await setDefaultAddress(address.id);
              })
            }
            className="eyebrow text-fg-subtle hover:text-fg link-underline disabled:opacity-40"
          >
            Make default
          </button>
        )}

        <span className="ml-auto">
          {confirming ? (
            <span className="flex items-center gap-3">
              <span className="text-fg-muted text-xs">Remove?</span>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await deleteAddress(address.id);
                  })
                }
                className="eyebrow text-signal-danger link-underline disabled:opacity-40"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="eyebrow text-fg-subtle hover:text-fg"
              >
                No
              </button>
            </span>
          ) : (
            <IconButton
              label={`Remove address ${address.label ?? address.line1}`}
              size="sm"
              onClick={() => setConfirming(true)}
            >
              <TrashIcon width={16} height={16} />
            </IconButton>
          )}
        </span>
      </div>

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit address"
      >
        <AddressForm address={address} onDone={() => setEditing(false)} />
      </Modal>
    </li>
  );
}

export function AddressManager({ addresses }: { addresses: Address[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <div className="mb-8 flex items-center justify-between gap-4">
        <p className="text-fg-muted text-sm">
          {addresses.length === 0
            ? 'No saved addresses yet.'
            : `${addresses.length} saved ${addresses.length === 1 ? 'address' : 'addresses'}.`}
        </p>
        <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
          <PlusIcon width={12} height={12} aria-hidden />
          Add address
        </Button>
      </div>

      {addresses.length > 0 ? (
        <ul className="grid gap-6 sm:grid-cols-2">
          {addresses.map((address) => (
            <AddressCard key={address.id} address={address} />
          ))}
        </ul>
      ) : (
        <div className="border-line border px-6 py-16 text-center">
          <p className="font-display text-fg text-xl">
            Save an address for faster checkout
          </p>
          <p className="text-fg-muted mx-auto mt-3 max-w-sm text-sm">
            Your default address is preselected at checkout.
          </p>
          <div className="mt-8">
            <Button onClick={() => setAdding(true)}>Add your first</Button>
          </div>
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add address">
        <AddressForm onDone={() => setAdding(false)} />
      </Modal>
    </div>
  );
}
