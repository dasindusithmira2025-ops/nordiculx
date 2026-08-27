'use client';

import { useTransition, useState } from 'react';
import { updateOrderStatus } from '@/app/actions/admin';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, Input, Select } from '@/components/ui/field';

/**
 * Status transition control.
 *
 * The whole enum is offered rather than a computed "next allowed step". Real
 * fulfilment goes backwards — a packed order gets unpacked, a dispatch is
 * recalled — and a UI that only moves forward gets worked around by editing the
 * database, which is far worse. The note is what explains the jump, and it is
 * shown to the customer on their tracking timeline.
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
