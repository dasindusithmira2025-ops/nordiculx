'use client';

import { useTransition, useState } from 'react';
import { updateOrderStatus } from '@/app/actions/admin';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, Input, Select } from '@/components/ui/field';

/**
 * Status transition control.
 *
 * The server and its options share one legal transition graph. Tracking fields
 * are optional because a dispatch can leave the warehouse before a courier
 * assigns a number, but any supplied URL is validated before it is stored.
 */
export function OrderStatusForm({
  reference,
  current,
  options,
}: {
  reference: string;
  current: string;
  options: { value: string; label: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const result = await updateOrderStatus(formData);
          setError(result.ok ? null : result.error);
        })
      }
      className="space-y-5"
    >
      <input type="hidden" name="reference" value={reference} />

      <Field>
        <FieldLabel>Status</FieldLabel>
        <Select name="status" defaultValue={current}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field hint="Shown to the customer on their tracking timeline.">
        <FieldLabel optional>Note</FieldLabel>
        <Input name="note" placeholder="Handed to the courier" />
      </Field>

      <fieldset className="border-line space-y-4 border p-4">
        <legend className="eyebrow text-fg-subtle px-1">
          Shipment tracking
        </legend>
        <Field>
          <FieldLabel optional>Carrier</FieldLabel>
          <Input name="carrier" placeholder="Domex" />
        </Field>
        <Field>
          <FieldLabel optional>Tracking number</FieldLabel>
          <Input name="trackingNumber" placeholder="DX123456789LK" />
        </Field>
        <Field>
          <FieldLabel optional>Tracking link</FieldLabel>
          <Input
            name="trackingUrl"
            type="url"
            inputMode="url"
            placeholder="https://carrier.example/track/DX123456789LK"
          />
        </Field>
      </fieldset>

      {error ? (
        <p role="alert" className="text-signal-danger text-sm">
          {error}
        </p>
      ) : null}

      <Button type="submit" loading={pending} loadingLabel="Updating">
        Update status
      </Button>
    </form>
  );
}
