import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getWishlist } from '@/lib/wishlist';
import { ButtonLink } from '@/components/ui/button';
import { WishlistGrid } from '@/components/account/wishlist-grid';

export const metadata: Metadata = {
  title: 'Your wishlist — Nordic Lux',
  robots: { index: false, follow: false },
};

export default async function WishlistPage() {
  const user = await requireUser('/account/wishlist');
  const items = await getWishlist(user.id);

  return (
    <div>
      <header className="border-line border-b pb-8">
        <p className="eyebrow text-fg-subtle">Account</p>
        <h1 className="font-display text-display-md text-fg mt-4">Wishlist</h1>
        {items.length > 0 ? (
          <p className="text-fg-muted mt-3 text-sm">
            {items.length} saved {items.length === 1 ? 'product' : 'products'}.
          </p>
        ) : null}
      </header>

      <div className="mt-12">
        {items.length === 0 ? (
          <div className="border-line border px-6 py-20 text-center">
            <p className="font-display text-display-sm text-fg">
              Nothing saved yet
            </p>
            <p className="text-fg-muted mx-auto mt-3 max-w-sm text-sm">
              Tap the heart on any product to keep it here. Your wishlist
              follows you between devices.
            </p>
            <div className="mt-8">
              <ButtonLink href="/shop">Browse the range</ButtonLink>
            </div>
          </div>
        ) : (
          <WishlistGrid items={items} />
        )}
      </div>
    </div>
  );
}
