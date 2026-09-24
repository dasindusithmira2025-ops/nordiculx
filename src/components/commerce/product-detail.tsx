'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import type { ProductDetailView } from '@/lib/catalogue/types';
import { useCart } from './cart-provider';
import { Price, UnitPrice } from './price';
import { ProductMedia } from './product-media';
import { QuantityStepper } from './quantity-stepper';
import { WishlistButton } from './wishlist-button';
import { BackInStockForm } from './back-in-stock-form';
import { Badge, Rating } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { STANDARD_SHIPPING } from '@/lib/cart/pricing';
import { formatMoney } from '@/lib/money';
import { CheckIcon, TruckIcon } from '@/components/ui/icons';

/**
 * Product gallery and buy box.
 *
 * These share one component because the selected variant drives both: choosing
 * a 50ml swaps the price, the stock line AND the lead image. Splitting them
 * would mean lifting variant state into a provider for the sake of two
 * siblings, which is more machinery than the page needs.
 */
export function ProductDetail({
  product,
  wishlisted = false,
  customerEmail,
}: {
  product: ProductDetailView;
  wishlisted?: boolean;
  /** Prefills the back-in-stock form for a signed-in customer. */
  customerEmail?: string;
}) {
  const { add } = useCart();

  const [variantId, setVariantId] = useState(
    () =>
      product.variants.find((v) => v.isDefault && v.inStock)?.id ??
      product.variants.find((v) => v.inStock)?.id ??
      product.variants[0]?.id ??
      '',
  );
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [pending, startTransition] = useTransition();

  const variant = useMemo(
    () => product.variants.find((v) => v.id === variantId) ?? null,
    [product.variants, variantId],
  );

  // A variant with its own shot leads the gallery; otherwise the product's
  // first image does. Either way the chosen index is what the viewer clicked.
  const images = product.media.length > 0 ? product.media : [];
  const variantImageIndex = variant?.imageUrl
    ? images.findIndex((m) => m.url === variant.imageUrl)
    : -1;
  const [pickedIndex, setPickedIndex] = useState<number | null>(null);
  const activeIndex =
    pickedIndex ?? (variantImageIndex >= 0 ? variantImageIndex : 0);
  const active = images[activeIndex] ?? images[0] ?? null;

  const buyable = Boolean(variant?.inStock);
  const maxQuantity = Math.max(1, Math.min(variant?.available ?? 1, 10));

  const onAdd = () => {
    if (!variant || !buyable) return;
    setError(null);
    startTransition(async () => {
      const result = await add(variant.id, quantity);
      if (result.ok) {
        setAdded(true);
        window.setTimeout(() => setAdded(false), 2400);
      } else {
        setError(result.error ?? 'Could not add to bag.');
      }
    });
  };

  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-16 xl:gap-24">
      {/* ---------------------------------------------------------------- */}
      {/* Gallery                                                          */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-col-reverse gap-4 lg:flex-row lg:gap-6">
        {images.length > 1 ? (
          <ul
            aria-label="Product images"
            className="flex gap-3 overflow-x-auto lg:h-fit lg:flex-col lg:overflow-visible"
          >
            {images.map((media, i) => (
              <li key={media.url} className="shrink-0">
                <button
                  type="button"
                  aria-label={`View image ${i + 1} of ${images.length}`}
                  aria-current={i === activeIndex ? 'true' : undefined}
                  onClick={() => setPickedIndex(i)}
                  className={cn(
                    'block w-16 border transition-colors',
                    i === activeIndex
                      ? 'border-fg'
                      : 'hover:border-line-strong border-transparent',
                  )}
                >
                  {/* Same stage as the main image, so the thumbnail strip is a
                      true miniature of what selecting it will show. */}
                  <ProductMedia src={media.url} alt="" sizes="64px" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <ProductMedia
          src={active?.url}
          alt={active?.alt ?? product.name}
          priority
          sizes="(min-width: 1024px) 45vw, 100vw"
          className="flex-1"
        >
          {product.onSale ? (
            <span className="absolute top-4 left-4">
              <Badge tone="sale">−{product.discountPercent}%</Badge>
            </span>
          ) : null}
        </ProductMedia>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Buy box                                                          */}
      {/* ---------------------------------------------------------------- */}
      <div className="lg:sticky lg:top-28 lg:h-fit lg:py-4">
        <Link
          href={`/brands/${product.brandSlug}`}
          className="eyebrow text-fg-subtle hover:text-fg link-underline"
        >
          {product.brandName}
        </Link>

        <h1 className="font-display text-display-md text-fg mt-3">
          {product.name}
        </h1>

        {product.subtitle ? (
          <p className="text-fg-muted mt-3 text-base">{product.subtitle}</p>
        ) : null}

        {product.ratingCount > 0 ? (
          <a
            href="#reviews"
            className="mt-5 inline-flex items-center gap-3 text-xs"
          >
            <Rating value={product.ratingAverage} count={product.ratingCount} />
            <span className="text-fg-muted link-underline">
              {product.ratingCount}{' '}
              {product.ratingCount === 1 ? 'review' : 'reviews'}
            </span>
          </a>
        ) : null}

        <div className="border-line mt-8 border-t pt-8">
          <div className="flex items-baseline gap-4">
            <Price
              amount={variant?.effectivePrice ?? product.effectivePrice}
              compareAt={variant?.onSale ? variant.price : null}
              size="lg"
            />
            <UnitPrice
              amount={variant?.effectivePrice ?? product.effectivePrice}
              volumeMl={variant?.volumeMl ?? null}
            />
          </div>

          {/* Size / variant selection */}
          {product.variants.length > 1 ? (
            <fieldset className="mt-8">
              <legend className="eyebrow text-fg-subtle mb-4">
                Size
                {variant ? (
                  <span className="text-fg ml-2 tracking-normal normal-case">
                    {variant.name}
                  </span>
                ) : null}
              </legend>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => (
                  <label
                    key={v.id}
                    className={cn(
                      'relative inline-flex cursor-pointer items-center border px-4 py-2.5 text-sm transition-colors',
                      v.id === variantId
                        ? 'border-fg bg-fg text-surface'
                        : 'border-line-strong text-fg hover:border-fg',
                      !v.inStock &&
                        'text-fg-subtle border-line line-through opacity-50',
                    )}
                  >
                    <input
                      type="radio"
                      name="variant"
                      value={v.id}
                      checked={v.id === variantId}
                      onChange={() => {
                        setVariantId(v.id);
                        setQuantity(1);
                        // Let the new variant's own image take over again.
                        setPickedIndex(null);
                      }}
                      className="sr-only"
                    />
                    {v.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {/* Stock line */}
          <p className="mt-6 text-xs">
            {!variant ? null : variant.inStock ? (
              variant.lowStock ? (
                <span className="text-signal-warning">
                  Only {variant.available} left
                </span>
              ) : (
                <span className="text-signal-success inline-flex items-center gap-1.5">
                  <CheckIcon width={13} height={13} /> In stock
                </span>
              )
            ) : (
              <span className="text-fg-subtle">
                Out of stock — check back soon
              </span>
            )}
          </p>

          <div className="mt-6 flex items-stretch gap-3">
            <QuantityStepper
              value={quantity}
              min={1}
              max={maxQuantity}
              onChange={setQuantity}
              disabled={!buyable}
            />
            <Button
              size="md"
              fullWidth
              loading={pending}
              disabled={!buyable}
              onClick={onAdd}
              className="flex-1"
            >
              {added ? 'Added to bag' : buyable ? 'Add to bag' : 'Out of stock'}
            </Button>
          </div>

          {error ? (
            <p role="alert" className="text-signal-danger mt-3 text-xs">
              {error}
            </p>
          ) : null}

          {/* Out of stock is the one place a customer still wants to act. */}
          {variant && !buyable ? (
            <BackInStockForm
              key={variant.id}
              variantId={variant.id}
              defaultEmail={customerEmail}
            />
          ) : null}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <WishlistButton
              productId={product.id}
              productName={product.name}
              initiallyWishlisted={wishlisted}
              variant="inline"
            />
            {STANDARD_SHIPPING.freeAboveSubtotal !== null ? (
              <p className="text-fg-subtle inline-flex items-center gap-2 text-xs">
                <TruckIcon width={15} height={15} />
                Free delivery over{' '}
                {formatMoney(STANDARD_SHIPPING.freeAboveSubtotal)}
              </p>
            ) : null}
          </div>
        </div>

        {/* Concerns this product is filed under */}
        {product.concerns.length > 0 ? (
          <div className="border-line mt-8 border-t pt-8">
            <p className="eyebrow text-fg-subtle mb-4">Good for</p>
            <ul className="flex flex-wrap gap-2">
              {product.concerns.map((concern) => (
                <li key={concern.slug}>
                  <Link
                    href={`/concern/${concern.slug}`}
                    className="border-line-strong text-fg hover:bg-fg hover:text-surface hover:border-fg inline-flex border px-3 py-1.5 text-xs transition-colors"
                  >
                    {concern.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
