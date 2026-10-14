'use client';

import { useActionState, type ReactNode } from 'react';
import {
  bulkEditProducts,
  createProduct,
  updateProductQuick,
} from '@/app/actions/admin';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/validation';

function FormResult({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return (
    <p
      role={state.ok ? 'status' : 'alert'}
      className={
        state.ok
          ? 'text-signal-success mt-2 text-xs'
          : 'text-signal-danger mt-2 text-xs'
      }
    >
      {state.ok ? 'Saved.' : state.error}
    </p>
  );
}

/** Keeps a row's editable values in place when its quick update is rejected. */
export function ProductQuickForm({ formId }: { formId: string }) {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(async (_previous, formData) => updateProductQuick(formData), null);

  return (
    <form id={formId} action={formAction}>
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </Button>
      <FormResult state={state} />
    </form>
  );
}

/** Preserves selected variants and bulk values after validation feedback. */
export function BulkProductForm({ children }: { children: ReactNode }) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    async (_previous, formData) => bulkEditProducts(formData),
    null,
  );

  return (
    <form
      id="bulk-products"
      action={formAction}
      className="grid gap-4 md:grid-cols-[minmax(12rem,1fr)_10rem_9rem_auto]"
    >
      {children}
      <div className="md:col-span-4">
        <FormResult state={state} />
      </div>
    </form>
  );
}

/** Keeps entered product details visible if creation is rejected. */
export function CreateProductForm({ children }: { children: ReactNode }) {
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(async (_previous, formData) => createProduct(formData), null);

  return (
    <form action={formAction} className="mt-5 grid gap-4 md:grid-cols-2">
      {children}
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Adding…' : 'Add product'}
        </Button>
        <FormResult state={state} />
      </div>
    </form>
  );
}
