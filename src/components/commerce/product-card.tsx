import Link from 'next/link';
import { cn } from '@/lib/cn';
import type { ProductCardView } from '@/lib/catalogue/types';
import { Badge } from '@/components/ui/display';
import { Rating } from '@/components/ui/display';
import { Price } from './price';
import { ProductMedia } from './product-media';
import { WishlistButton } from './wishlist-button';
import { QuickAdd } from './quick-add';

/**
 * Product card.
 *
 * Composition rules (docs/DESIGN.md § Product cards):
 *   - the image is a 3:4 portrait with square corners and no shadow; the
 *     photography is the only decoration the card gets
 *   - at most ONE badge is shown, chosen by priority, so a grid never turns
 *     into a wall of competing labels
 *   - hover reveals the second shot and the add control; neither is required to
 *     buy, and both are unreachable-safe on touch
 *   - the whole card is one link, with the wishlist and add controls as
 *     explicit exceptions that stop propagation
 */
export function ProductCard({
  product,
  wishlisted = false,
  priority = false,
  sizes = '(min-width: 1280px) 22vw, (min-width: 768px) 33vw, 50vw',
  className,
}: {
  product: ProductCardView;
  wishlisted?: boolean;
  /** Set on above-the-fold cards so the LCP image is not lazy-loaded. */
  priority?: boolean;
  sizes?: string;
  className?: string;
}) {
  const href = `/product/${product.slug}`;

  // One badge only, most important first.
  const badge = !product.inStock
    ? { tone: 'out' as const, label: 'Out of stock' }
    : product.onSale
      ? { tone: 'sale' as const, label: `−${product.discountPercent}%` }
      : product.isNew
        ? { tone: 'new' as const, label: 'New' }
        : product.lowStock
          ? { tone: 'low' as const, label: 'Low stock' }
          : null;

  return (
    <article className={cn('group relative flex flex-col', className)}>
      <div className="relative overflow-hidden">
        <Link href={href} className="block focus-visible:outline-offset-[-2px]">
          <ProductMedia
            src={product.image?.url}
            alt={product.image?.alt ?? product.name}
            hoverSrc={product.hoverImage?.url}
            sizes={sizes}
            priority={priority}
            imageClassName={cn(!product.inStock && 'opacity-60')}
          />
        </Link>

        {badge ? (
          <div className="pointer-events-none absolute top-2 left-2 z-10">
            <Badge tone={badge.tone}>{badge.label}</Badge>
          </div>
        ) : null}

        <WishlistButton
          productId={product.id}
          productName={product.name}
          initiallyWishlisted={wishlisted}
        />

        {/* Add control sits over the base of the image, revealed on hover. */}
        <div className="absolute inset-x-0 bottom-0 z-10 hidden md:block">
          <QuickAdd
            variantId={product.defaultVariantId}
            productName={product.name}
            productHref={href}
            variantCount={product.variantCount}
            inStock={product.inStock}
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col pt-4">
        <Link
          href={`/brands/${product.brandSlug}`}
          className="eyebrow text-fg-subtle hover:text-fg-muted transition-colors"
        >
          {product.brandName}
        </Link>

        <h3 className="text-fg mt-1.5 text-sm leading-snug">
          <Link href={href} className="link-underline">
            {product.name}
          </Link>
        </h3>

        {product.subtitle ? (
          <p className="text-fg-subtle mt-1 line-clamp-1 text-xs">
            {product.subtitle}
          </p>
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-3">
          <Price
            amount={product.effectivePrice}
            compareAt={product.onSale ? product.fromPrice : null}
            from={product.variantCount > 1}
          />
          {product.ratingCount > 0 ? (
            <Rating
              value={product.ratingAverage}
              count={product.ratingCount}
              size={12}
            />
          ) : null}
        </div>
      </div>
    </article>
  );
}

/** Matching skeleton, so a loading grid holds the same rhythm as a loaded one. */
export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="animate-shimmer bg-surface-sunken aspect-3/4 bg-[linear-gradient(100deg,transparent_20%,var(--surface-raised)_45%,transparent_70%)] bg-[length:220%_100%]" />
      <div className="space-y-2 pt-4">
        <div className="bg-surface-sunken h-2.5 w-20" />
        <div className="bg-surface-sunken h-3.5 w-36" />
        <div className="bg-surface-sunken h-3 w-24" />
      </div>
    </div>
  );
}
