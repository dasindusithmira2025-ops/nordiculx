'use client';

import { useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createPromotion,
  updatePromotion,
} from '@/app/actions/admin-promotions';
import { Button } from '@/components/ui/button';
import { adminField, Cell } from '@/components/admin/admin-ui';
import type { PromotionRow } from '@/lib/admin/promotions';
import type { PromotionTargets } from '@/lib/admin/promotions';
import type { ActionResult } from '@/lib/validation';

/**
 * Create / edit a promotion.
 *
 * One form for both, because the fields are identical and a second copy is a
 * second thing to keep in step with the schema. The value input swaps with the
 * type and the target picker appears only for a scoped promotion, so staff are
 * never asked for a number the pricing engine will ignore.
 */

const TYPE_LABELS = {
  percentage: 'Percentage off',
  fixed_amount: 'Fixed amount off',
  free_shipping: 'Free shipping',
} as const;

const SCOPE_LABELS = {
  order: 'Whole order',
  product: 'Chosen products',
  category: 'Chosen categories',
  collection: 'Chosen collections',
  brand: 'Chosen brands',
} as const;

const money = (cents: number | null) =>
  cents === null ? '' : (cents / 100).toFixed(2);

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in local time. */
function toLocalInput(date: Date | null) {
  if (!date) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function PromotionForm({
  promotion,
  targets,
}: {
  promotion?: PromotionRow;
  targets: PromotionTargets;
}) {
  const router = useRouter();
  const [type, setType] = useState(promotion?.type ?? 'percentage');
  const [scope, setScope] = useState(promotion?.scope ?? 'order');

  const [state, formAction, pending] = useActionState<
    ActionResult<{ id: string } | undefined> | null,
    FormData
  >(async (_previous, formData) => {
    const result = promotion
      ? await updatePromotion(formData)
      : await createPromotion(formData);
    if (result.ok && !promotion) router.push('/admin/promotions');
    return result;
  }, null);

  const error = (name: string) =>
    state && !state.ok ? (state.fieldErrors?.[name] ?? null) : null;
  const options = scope === 'order' ? [] : targets[scope];

  return (
    <form action={formAction} className="space-y-5">
      {promotion ? (
        <input type="hidden" name="id" value={promotion.id} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Cell label="Name">
          <input
            name="name"
            required
            maxLength={120}
            defaultValue={promotion?.name ?? ''}
            className={adminField}
          />
        </Cell>
        <Cell
          label="Code"
          hint="Leave blank for an automatic promotion with no code."
        >
          <input
            name="code"
            maxLength={40}
            defaultValue={promotion?.code ?? ''}
            className={`${adminField} uppercase`}
          />
        </Cell>
        <Cell label="Type">
          <select
            name="type"
            value={type}
            onChange={(event) =>
              setType(event.target.value as PromotionRow['type'])
            }
            className={adminField}
          >
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Cell>
        <Cell label="Applies to">
          <select
            name="scope"
            value={scope}
            onChange={(event) =>
              setScope(event.target.value as PromotionRow['scope'])
            }
            className={adminField}
          >
            {Object.entries(SCOPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Cell>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Both inputs stay mounted so a mistyped value survives a type switch;
            only the relevant one is shown, and the action reads only that one. */}
        <Cell
          label="Percent off"
          className={type === 'percentage' ? '' : 'hidden'}
          hint={error('percentage') ?? undefined}
        >
          <input
            name="percentage"
            type="number"
            min={1}
            max={100}
            step={1}
            defaultValue={
              promotion?.type === 'percentage' ? promotion.value : 10
            }
            className={adminField}
          />
        </Cell>
        <Cell
          label="Amount off (LKR)"
          className={type === 'fixed_amount' ? '' : 'hidden'}
          hint={error('amount') ?? undefined}
        >
          <input
            name="amount"
            inputMode="decimal"
            defaultValue={
              promotion?.type === 'fixed_amount' ? money(promotion.value) : ''
            }
            className={adminField}
          />
        </Cell>
        <Cell label="Minimum spend (LKR)" hint="0 for no minimum.">
          <input
            name="minimumSubtotal"
            inputMode="decimal"
            defaultValue={money(promotion?.minimumSubtotal ?? 0)}
            className={adminField}
          />
        </Cell>
        <Cell
          label="Maximum discount (LKR)"
          className={type === 'percentage' ? '' : 'hidden'}
          hint="Caps what a percentage can give away. Blank for no cap."
        >
          <input
            name="maximumDiscount"
            inputMode="decimal"
            defaultValue={money(promotion?.maximumDiscount ?? null)}
            className={adminField}
          />
        </Cell>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Cell label="Starts" hint="Blank starts immediately.">
          <input
            name="startsAt"
            type="datetime-local"
            defaultValue={toLocalInput(promotion?.startsAt ?? null)}
            className={adminField}
          />
        </Cell>
        <Cell
          label="Ends"
          hint={error('endsAt') ?? 'Blank runs until turned off.'}
        >
          <input
            name="endsAt"
            type="datetime-local"
            defaultValue={toLocalInput(promotion?.endsAt ?? null)}
            className={adminField}
          />
        </Cell>
        <Cell label="Total uses" hint="Blank for unlimited.">
          <input
            name="usageLimit"
            type="number"
            min={1}
            step={1}
            defaultValue={promotion?.usageLimit ?? ''}
            className={adminField}
          />
        </Cell>
        <Cell label="Uses per customer" hint="Blank for unlimited.">
          <input
            name="usageLimitPerCustomer"
            type="number"
            min={1}
            step={1}
            defaultValue={promotion?.usageLimitPerCustomer ?? ''}
            className={adminField}
          />
        </Cell>
      </div>

      {scope === 'order' ? null : (
        <Cell
          label={SCOPE_LABELS[scope]}
          hint={
            error('targetIds') ??
            'Hold Ctrl (Cmd on Mac) to choose more than one.'
          }
        >
          <select
            name="targetIds"
            multiple
            size={8}
            defaultValue={promotion?.targetIds ?? []}
            className="border-line-strong text-fg w-full border bg-transparent p-2 text-sm outline-none"
          >
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Cell>
      )}

      <Cell label="Internal note" hint="Not shown to customers.">
        <input
          name="description"
          maxLength={500}
          defaultValue={promotion?.description ?? ''}
          className={adminField}
        />
      </Cell>

      <div className="flex flex-wrap items-center gap-6">
        <label className="text-fg flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={promotion?.enabled ?? false}
            className="size-4"
          />
          Enabled
        </label>
        <Button type="submit" size="sm" disabled={pending}>
          {promotion ? 'Save promotion' : 'Create promotion'}
        </Button>
        {state?.ok ? (
          <span role="status" className="text-signal-success text-xs">
            Saved.
          </span>
        ) : null}
        {state && !state.ok ? (
          <span role="alert" className="text-signal-danger text-xs">
            {state.error}
            {error('code') ? ` ${error('code')}` : ''}
          </span>
        ) : null}
      </div>
    </form>
  );
}
