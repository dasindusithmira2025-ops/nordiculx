'use client';

import type { MouseEvent } from 'react';
import { useCallback } from 'react';

const LABELS: Record<string, string> = {
  publish: 'publish',
  draft: 'unpublish',
  set_price: 'set an exact price for',
  increase_amount: 'increase prices for',
  decrease_amount: 'decrease prices for',
  increase_percent: 'increase prices by percentage for',
  decrease_percent: 'decrease prices by percentage for',
  clear_sale: 'clear sale prices for',
  restock: 'restock',
};

export function BulkSubmitButton({ formId }: { formId: string }) {
  const confirmBulkEdit = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const form = document.getElementById(formId) as HTMLFormElement | null;
      if (!form) return;

      const selected = document.querySelectorAll<HTMLInputElement>(
        `input[form="${formId}"][name="variantId"]:checked`,
      );
      const action = form.querySelector<HTMLSelectElement>(
        'select[name="bulkAction"]',
      )?.value;
      const amount = form.querySelector<HTMLInputElement>(
        'input[name="bulkAmount"]',
      )?.value;
      const stock = form.querySelector<HTMLInputElement>(
        'input[name="bulkStockDelta"]',
      )?.value;

      if (selected.length === 0) {
        event.preventDefault();
        window.alert(
          'Select at least one product before applying a bulk edit.',
        );
        return;
      }

      const actionLabel = LABELS[action ?? ''] ?? 'update';
      const suffix =
        action === 'restock'
          ? stock
            ? ` by ${stock} units`
            : ''
          : amount
            ? ` using ${amount}`
            : '';
      const noun = selected.length === 1 ? 'product' : 'products';

      if (
        !window.confirm(
          `Apply this bulk edit: ${actionLabel} ${selected.length} selected ${noun}${suffix}?`,
        )
      ) {
        event.preventDefault();
      }
    },
    [formId],
  );

  return (
    <button
      type="submit"
      form={formId}
      onClick={confirmBulkEdit}
      className="bg-fg text-surface hover:bg-fg-muted focus-visible:outline-fg inline-flex h-10 items-center justify-center px-4 text-xs font-medium tracking-[0.14em] uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      Apply to selected
    </button>
  );
}
