import Image from 'next/image';
import Link from 'next/link';
import type { CartView } from '@/lib/cart';
import { formatMoney } from '@/lib/money';
import { Rule } from '@/components/ui/display';
import { PromotionCodeForm } from '@/components/checkout/promotion-code-form';

/**
 * The bag, restated beside the checkout form.
 *
 * Every figure comes from `cart.pricing`, which is the same server-side
 * calculation `placeOrder` runs — so what is shown here and what is charged
 * cannot drift. Nothing is recomputed in this component.
 */
export function CheckoutSummary({ cart }: { cart: CartView }) {
  const { pricing } = cart;

  return (
    <aside
      aria-label="Order summary"
      className="border-line bg-surface-sunken border p-6 lg:sticky lg:top-28"
    >
      <h2 className="eyebrow text-fg-subtle mb-6">Your bag</h2>

      <ul className="space-y-5">
        {cart.lines.map((line) => (
          <li key={line.id} className="flex gap-4">
            <div className="bg-surface relative size-16 shrink-0 overflow-hidden">
              {line.imageUrl ? (
                <Image
                  src={line.imageUrl}
                  alt=""
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              ) : null}
              {/* Quantity as a corner badge keeps the line compact. */}
              <span className="bg-fg text-surface absolute -top-1 -right-1 flex size-5 items-center justify-center text-[10px] tabular-nums">
                {line.quantity}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <p className="eyebrow text-fg-subtle">{line.brandName}</p>
              <p className="text-fg mt-0.5 text-sm">{line.productName}</p>
              <p className="text-fg-subtle mt-0.5 text-xs">
                {line.variantName}
              </p>
            </div>

            <p className="text-fg shrink-0 text-sm tabular-nums">
              {formatMoney(line.lineTotal)}
            </p>
          </li>
        ))}
      </ul>

      <Rule className="my-6" />

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-fg-muted">Subtotal</dt>
          <dd className="text-fg tabular-nums">
            {formatMoney(pricing.subtotal)}
          </dd>
        </div>

        {pricing.discountTotal > 0 ? (
          <div className="flex justify-between">
            <dt className="text-fg-muted">
              Discount
              {pricing.appliedPromotion?.code ? (
                <span className="text-fg-subtle">
                  {' '}
                  ({pricing.appliedPromotion.code})
                </span>
              ) : null}
            </dt>
            <dd className="text-signal-sale tabular-nums">
              −{formatMoney(pricing.discountTotal)}
            </dd>
          </div>
        ) : null}

        <div className="flex justify-between">
          <dt className="text-fg-muted">Delivery</dt>
          <dd className="text-fg tabular-nums">
            {pricing.shippingTotal === 0
              ? 'Complimentary'
              : formatMoney(pricing.shippingTotal)}
          </dd>
        </div>

        <Rule className="my-3" />

        <div className="flex justify-between text-base">
          <dt className="text-fg font-medium">Total</dt>
          <dd className="text-fg font-medium tabular-nums">
            {formatMoney(pricing.grandTotal)}
          </dd>
        </div>
      </dl>

      <PromotionCodeForm
        applied={pricing.appliedPromotion?.code ?? cart.promotionCode ?? null}
      />

      {cart.promotionWarning ? (
        <p role="status" className="text-signal-warning mt-4 text-xs">
          {cart.promotionWarning}
        </p>
      ) : null}

      <p className="text-fg-subtle mt-6 text-xs">
        <Link href="/shop" className="link-underline">
          Continue shopping
        </Link>
      </p>
    </aside>
  );
}
