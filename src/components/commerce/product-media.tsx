import Image from 'next/image';
import { cn } from '@/lib/cn';

/**
 * The product-media stage.
 *
 * One frame for every place a product photograph appears — card, gallery,
 * cart line, search result — so a product cannot look like one size in the
 * grid and another in the drawer. Before this existed the frame was retyped at
 * each call site and had drifted: cards contained the image, while the cart,
 * the search results and the wishlist covered it, which cropped the packaging
 * and cut off label text.
 *
 * The rules, in one place:
 *
 *   - 3:4 portrait, square corners, no shadow
 *   - `object-contain`, so packaging is never cropped and never stretched
 *   - centred, so a tall bottle and a wide box share an optical centre
 *   - a percentage safe area, so the margin scales with the frame: a fixed
 *     `p-4` is a quarter of a 64px cart thumbnail and invisible on a 700px
 *     gallery
 *
 * What this component deliberately does NOT do is make the products
 * themselves the same size. Source photographs are framed differently by every
 * brand, and no amount of CSS can tell how much white space sits around the
 * bottle in a JPEG. That is normalised once, in the asset itself, by
 * `scripts/normalize-product-media.ts`. This component is the other half of
 * that contract: a fixed stage for an asset with a known safe area.
 */
export function ProductMedia({
  src,
  alt,
  hoverSrc,
  sizes,
  priority = false,
  loading,
  className,
  imageClassName,
  children,
}: {
  src: string | null | undefined;
  alt: string;
  /** Second shot, cross-faded in on hover of the enclosing `group`. */
  hoverSrc?: string | null;
  sizes: string;
  priority?: boolean;
  loading?: 'eager' | 'lazy';
  className?: string;
  /** Extra classes for the primary image only — opacity states, transitions. */
  imageClassName?: string;
  /** Badges and controls positioned over the stage. */
  children?: React.ReactNode;
}) {
  // A block-level <span>, not a <div>: the stage is rendered inside a <button>
  // in the gallery thumbnail strip and inside <a> elsewhere, and only phrasing
  // content is valid in a button.
  return (
    <span
      className={cn(
        'bg-surface-sunken relative block aspect-3/4 overflow-hidden',
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          {...(loading && !priority ? { loading } : {})}
          className={cn(
            'object-contain object-center p-[3%]',
            hoverSrc &&
              'duration-editorial ease-standard transition-opacity group-hover:opacity-0',
            imageClassName,
          )}
        />
      ) : (
        <span className="text-fg-subtle absolute inset-0 grid place-items-center text-xs">
          No image
        </span>
      )}

      {hoverSrc ? (
        <Image
          src={hoverSrc}
          alt=""
          aria-hidden
          fill
          sizes={sizes}
          loading="lazy"
          className="duration-editorial ease-standard -z-0 object-contain object-center p-[3%] opacity-0 transition-opacity group-hover:opacity-100"
        />
      ) : null}

      {children}
    </span>
  );
}
