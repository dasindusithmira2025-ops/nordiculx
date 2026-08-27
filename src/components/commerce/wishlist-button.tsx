'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { toggleWishlist } from '@/app/actions/wishlist';
import { HeartFilledIcon, HeartIcon } from '@/components/ui/icons';

/**
 * Wishlist toggle.
 *
 * Optimistic, but honest: if the server rejects (signed out, or a failure) the
 * heart reverts and a guest is sent to sign in with a return path, rather than
 * showing a saved state that was never saved.
 */
export function WishlistButton({
  productId,
  productName,
  initiallyWishlisted = false,
  variant = 'overlay',
  className,
}: {
  productId: string;
  productName: string;
  initiallyWishlisted?: boolean;
  variant?: 'overlay' | 'inline';
  className?: string;
}) {
  const router = useRouter();
  const [wishlisted, setWishlisted] = useState(initiallyWishlisted);
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    const previous = wishlisted;
    setWishlisted(!previous);

    startTransition(async () => {
      const result = await toggleWishlist(productId);
      if (!result.ok) {
        setWishlisted(previous);
        router.push(
          `/account/login?next=${encodeURIComponent(window.location.pathname)}`,
        );
        return;
      }
      setWishlisted(result.data.wishlisted);
    });
  };

  const label = wishlisted
    ? `Remove ${productName} from wishlist`
    : `Save ${productName} to wishlist`;

  if (variant === 'inline') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-pressed={wishlisted}
        className={cn(
          'text-2xs tracking-eyebrow inline-flex items-center gap-2 uppercase',
          'text-fg-muted hover:text-fg transition-colors disabled:opacity-50',
          className,
        )}
      >
        {wishlisted ? (
          <HeartFilledIcon width={16} height={16} />
        ) : (
          <HeartIcon width={16} height={16} />
        )}
        {wishlisted ? 'Saved' : 'Save'}
        <span className="sr-only">{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={wishlisted}
      aria-label={label}
      title={label}
      className={cn(
        'absolute top-2 right-2 z-10 flex size-9 items-center justify-center',
        'bg-surface/70 text-fg duration-standard backdrop-blur-[2px] transition-all',
        // Hidden until hover on pointer devices, always visible on touch —
        // a hover-only control is unreachable on a phone.
        'opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100',
        wishlisted && 'md:opacity-100',
        'hover:bg-surface disabled:opacity-50',
        className,
      )}
    >
      {wishlisted ? (
        <HeartFilledIcon width={17} height={17} />
      ) : (
        <HeartIcon width={17} height={17} />
      )}
    </button>
  );
}
