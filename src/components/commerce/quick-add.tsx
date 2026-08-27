'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { useCart } from './cart-provider';
import { SpinnerIcon } from '@/components/ui/icons';

/**
 * Quick add from a product card.
 *
 * Only rendered when the product has exactly one variant. With two or more
 * sizes there is no honest default, so the card links to the PDP instead of
 * guessing which one somebody meant.
 */
export function QuickAdd({
  variantId,
  productName,
  productHref,
  variantCount,
  inStock,
  className,
}: {
  variantId: string | null;
  productName: string;
  productHref: string;
  variantCount: number;
  inStock: boolean;
  className?: string;
}) {
  const { add } = useCart();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const base = cn(
    'flex h-11 w-full items-center justify-center bg-surface/95 text-2xs uppercase tracking-eyebrow',
    'text-fg backdrop-blur-[2px] transition-all duration-standard',
    'translate-y-full opacity-0',
    'group-hover:translate-y-0 group-hover:opacity-100',
    'group-focus-within:translate-y-0 group-focus-within:opacity-100',
    'hover:bg-fg hover:text-surface',
    className,
  );

  if (!inStock) {
    return (
      <Link href={productHref} className={base}>
        Notify me
      </Link>
    );
  }

  if (variantCount !== 1 || !variantId) {
    return (
      <Link href={productHref} className={base}>
        Choose size
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Add ${productName} to bag`}
      onClick={(e) => {
        // The card is a link; adding to the bag must not navigate.
        e.preventDefault();
        e.stopPropagation();
        setError(null);
        startTransition(async () => {
          const result = await add(variantId, 1);
          if (!result.ok) setError(result.error ?? 'Could not add to bag.');
        });
      }}
      className={base}
    >
      {pending ? (
        <SpinnerIcon width={14} height={14} />
      ) : error ? (
        <span className="text-signal-danger">{error}</span>
      ) : (
        'Add to bag'
      )}
    </button>
  );
}
