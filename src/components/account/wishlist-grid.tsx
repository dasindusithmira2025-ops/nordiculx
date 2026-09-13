'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import type { WishlistEntry } from '@/lib/wishlist';
import { removeFromWishlist } from '@/app/actions/wishlist';
import { addToCart } from '@/app/actions/cart';
import { formatMoney } from '@/lib/money';
import { Button, ButtonLink, IconButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/display';
import { TrashIcon } from '@/components/ui/icons';
import { ProductMedia } from '@/components/commerce/product-media';

/**
 * Wishlist grid.
 *
 * Each row can be moved straight into the bag, which is the whole point of a
 * wishlist. A saved product whose variant has since sold out keeps its place and
 * says so rather than disappearing — silently dropping something somebody saved
 * looks like data loss.
 */
export function WishlistGrid({ items }: { items: WishlistEntry[] }) {
  const [pending, startTransition] = useTransition();

  return (
    <ul className="grid grid-cols-2 gap-x-6 gap-y-12 md:grid-cols-3">
      {items.map((item) => {
        const price = item.salePrice ?? item.price;

        return (
          <li key={item.id}>
            <ProductMedia
              src={item.imageUrl}
              alt=""
              sizes="(min-width: 768px) 30vw, 50vw"
            >
              {!item.inStock ? (
                <span className="absolute top-3 left-3">
                  <Badge tone="out">Out of stock</Badge>
                </span>
              ) : null}

              <span className="absolute top-2 right-2">
                <IconButton
                  label={`Remove ${item.name} from wishlist`}
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await removeFromWishlist(item.productId);
                    })
                  }
                  className="bg-surface/80 backdrop-blur-[2px]"
                >
                  <TrashIcon width={15} height={15} />
                </IconButton>
              </span>
            </ProductMedia>

            <div className="mt-4">
              <p className="eyebrow text-fg-subtle">{item.brandName}</p>
              <p className="text-fg mt-1 text-sm">
                <Link href={`/product/${item.slug}`} className="link-retract">
                  {item.name}
                </Link>
              </p>
              <p className="text-fg mt-2 text-sm tabular-nums">
                {item.salePrice ? (
                  <>
                    <span className="text-signal-sale">
                      {formatMoney(item.salePrice)}
                    </span>{' '}
                    <span className="text-fg-subtle line-through">
                      {formatMoney(item.price)}
                    </span>
                  </>
                ) : (
                  formatMoney(price)
                )}
              </p>

              <div className="mt-4">
                {item.inStock && item.defaultVariantId ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidth
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await addToCart({
                          variantId: item.defaultVariantId!,
                          quantity: 1,
                        });
                      })
                    }
                  >
                    Add to bag
                  </Button>
                ) : (
                  // Still a route forward: the PDP is where a back-in-stock
                  // subscription and the other sizes live.
                  <ButtonLink
                    href={`/product/${item.slug}`}
                    variant="secondary"
                    size="sm"
                    fullWidth
                  >
                    View product
                  </ButtonLink>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
