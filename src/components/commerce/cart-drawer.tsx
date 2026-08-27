'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useCart } from './cart-provider';
import { Price } from './price';
import { QuantityStepper } from './quantity-stepper';
import { Drawer } from '@/components/ui/overlay';
import { ButtonLink } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/display';
import { AlertIcon, BagIcon, TrashIcon } from '@/components/ui/icons';
import { formatMoney } from '@/lib/money';
import { removeCartItem, updateCartItemQuantity } from '@/app/actions/cart';
import { STANDARD_SHIPPING } from '@/lib/cart/pricing';

/**
 * Mini cart.
 *
 * Shows the server's numbers, never its own arithmetic: subtotal, discount and
 * shipping all come from the same `priceOrder` result that checkout will use,
 * so a customer can never be shown one total and charged another.
 */
export function CartDrawer() {
  const { cart, isOpen, closeCart, refresh } = useCart();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const lines = cart?.lines ?? [];
  const isEmpty = cart !== null && lines.length === 0;

  const update = (itemId: string, quantity: number) => {
    setError(null);
    startTransition(async () => {
      const result = await updateCartItemQuantity({ itemId, quantity });
      if (!result.ok) setError(result.error);
      await refresh();
    });
  };

  const remove = (itemId: string) => {
    setError(null);
    startTransition(async () => {
      await removeCartItem(itemId);
      await refresh();
    });
  };

  const subtotal = cart?.pricing.subtotal ?? 0;
  const remainingForFreeShipping =
    STANDARD_SHIPPING.freeAboveSubtotal !== null
      ? STANDARD_SHIPPING.freeAboveSubtotal -
        (subtotal - (cart?.pricing.discountTotal ?? 0))
      : 0;

  return (
    <Drawer
      open={isOpen}
      onClose={closeCart}
      title="Your bag"
      side="right"
      footer={
        isEmpty ? null : (
          <div className="space-y-4">
            {cart ? (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-fg-muted">Subtotal</dt>
                  <dd className="tabular-nums">
                    {formatMoney(cart.pricing.subtotal)}
                  </dd>
                </div>
                {cart.pricing.discountTotal > 0 ? (
                  <div className="text-signal-sale flex justify-between">
                    <dt>
                      Discount
                      {cart.pricing.appliedPromotion?.code
                        ? ` (${cart.pricing.appliedPromotion.code})`
                        : ''}
                    </dt>
                    <dd className="tabular-nums">
                      −{formatMoney(cart.pricing.discountTotal)}
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <dt className="text-fg-muted">Delivery</dt>
                  <dd className="tabular-nums">
                    {cart.pricing.shippingTotal === 0
                      ? 'Complimentary'
                      : formatMoney(cart.pricing.shippingTotal)}
                  </dd>
                </div>
                <div className="border-line flex justify-between border-t pt-3 text-base">
                  <dt>Total</dt>
                  <dd className="tabular-nums">
                    {formatMoney(cart.pricing.grandTotal)}
                  </dd>
                </div>
              </dl>
            ) : null}

            <ButtonLink
              href="/checkout"
              fullWidth
              size="lg"
              aria-disabled={cart?.hasStockIssues || undefined}
              className={
                cart?.hasStockIssues ? 'pointer-events-none opacity-40' : ''
              }
            >
              Checkout
            </ButtonLink>

            <button
              type="button"
              onClick={closeCart}
              className="eyebrow text-fg-muted link-underline block w-full py-1 text-center"
            >
              Continue shopping
            </button>
          </div>
        )
      }
    >
      {/* Free-delivery progress — a genuine incentive, shown only when close. */}
      {cart && lines.length > 0 && remainingForFreeShipping > 0 ? (
        <p className="border-line bg-surface-raised text-fg-muted border-b px-5 py-3 text-xs">
          Add {formatMoney(remainingForFreeShipping)} more for complimentary
          delivery.
        </p>
      ) : null}

      {cart?.promotionWarning ? (
        <p
          role="status"
          className="border-line text-signal-warning flex items-start gap-2 border-b px-5 py-3 text-xs"
        >
          <AlertIcon width={14} height={14} className="mt-0.5 shrink-0" />
          {cart.promotionWarning}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="border-line text-signal-danger flex items-start gap-2 border-b px-5 py-3 text-xs"
        >
          <AlertIcon width={14} height={14} className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}

      {cart === null ? (
        <ul className="divide-line divide-y">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex gap-4 p-5">
              <Skeleton className="aspect-3/4 w-20 shrink-0" />
              <div className="flex-1 space-y-2 py-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-16" />
              </div>
            </li>
          ))}
        </ul>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
          <BagIcon width={28} height={28} className="text-fg-subtle" />
          <p className="font-display text-display-sm mt-6">Your bag is empty</p>
          <p className="text-fg-muted mt-2 max-w-xs text-sm">
            Nothing here yet. Start with the pieces people come back for.
          </p>
          <ButtonLink
            href="/shop"
            variant="secondary"
            className="mt-8"
            onClick={closeCart}
          >
            Shop all
          </ButtonLink>
        </div>
      ) : (
        <ul className="divide-line divide-y">
          {lines.map((line) => (
            <li key={line.id} className="flex gap-4 p-5">
              <Link
                href={`/product/${line.slug}`}
                onClick={closeCart}
                className="bg-surface-sunken relative aspect-3/4 w-20 shrink-0 overflow-hidden"
              >
                {line.imageUrl ? (
                  <Image
                    src={line.imageUrl}
                    alt={line.productName}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                ) : null}
              </Link>

              <div className="min-w-0 flex-1">
                <p className="eyebrow text-fg-subtle">{line.brandName}</p>
                <Link
                  href={`/product/${line.slug}`}
                  onClick={closeCart}
                  className="text-fg link-underline mt-1 block text-sm"
                >
                  {line.productName}
                </Link>
                <p className="text-fg-muted mt-0.5 text-xs">
                  {line.variantName}
                </p>

                {line.exceedsStock ? (
                  <p className="text-signal-warning mt-2 text-xs">
                    Only {line.available} left — reduce the quantity to
                    continue.
                  </p>
                ) : null}
                {!line.inStock ? (
                  <p className="text-signal-danger mt-2 text-xs">
                    Now out of stock. Remove it to continue.
                  </p>
                ) : null}

                <div className="mt-3 flex items-center justify-between gap-3">
                  <QuantityStepper
                    size="sm"
                    value={line.quantity}
                    max={line.available > 0 ? line.available : 99}
                    disabled={pending}
                    onChange={(next) => update(line.id, next)}
                    label={`Quantity for ${line.productName}`}
                  />
                  <Price
                    amount={line.lineTotal}
                    compareAt={
                      line.onSale ? line.listPrice * line.quantity : null
                    }
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => remove(line.id)}
                disabled={pending}
                aria-label={`Remove ${line.productName} from bag`}
                className="text-fg-subtle hover:text-fg -mt-1 -mr-1 size-8 shrink-0 self-start transition-colors disabled:opacity-40"
              >
                <TrashIcon width={16} height={16} className="mx-auto" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
