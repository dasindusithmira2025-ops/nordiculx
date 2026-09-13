import { cn } from '@/lib/cn';
import { brandLogo } from '@/lib/catalogue/brand-logos';

/**
 * A brand's official logo on a shared stage.
 *
 * The stage is a fixed-height box; the logo is fitted inside it and never
 * stretched — `width: auto` against a capped height means the source aspect
 * ratio is the only thing deciding how wide a mark ends up. A very wide
 * wordmark and a compact stacked lockup therefore occupy the same vertical
 * band without either being distorted.
 *
 * Box height alone does not make a row of logos look even, because different
 * marks carry very different amounts of artwork around their letterforms. The
 * per-brand `opticalScale` from the generated manifest corrects for that; see
 * scripts/fetch-brand-logos.ts.
 *
 * Logos are shown in their original colours. Forcing the set to monochrome
 * would flatten marks whose colour is the identity — CeraVe's blue block,
 * Eucerin's red chevron, Garnier's leaf — and repainting a brand's asset is a
 * modification we are not entitled to make. Restraint comes from the stage
 * being small and the surface around it being quiet.
 *
 * A brand with no held asset falls back to its name set in the display serif,
 * occupying the same stage, so a mixed grid still lines up.
 */
export function BrandLogo({
  slug,
  name,
  logoUrl,
  /** Stage height in px. The logo is capped at `stage × opticalScale`. */
  stage = 40,
  className,
}: {
  slug: string;
  name: string;
  /** `brands.logo_url` — the source of truth, when it is set. */
  logoUrl?: string | null;
  stage?: number;
  className?: string;
}) {
  const held = brandLogo(slug);
  const src = logoUrl ?? held?.src ?? null;

  // A <span>, not a <div>: the stage is rendered inside an <h2> and inside
  // inline runs, neither of which may contain flow content.
  return (
    <span
      className={cn('flex items-center', className)}
      style={{ height: stage }}
    >
      {src ? (
        /* Plain <img>, not next/image: these are eleven local assets of a few
           kilobytes each and most of them are SVG, which the optimiser will
           not touch without `dangerouslyAllowSVG`. Turning that on to save a
           few hundred bytes is a bad trade. Intrinsic width/height are still
           set, so the row does not shift as they load. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          width={held?.width}
          height={held?.height}
          loading="lazy"
          decoding="async"
          className="w-auto max-w-full object-contain object-left"
          style={{ maxHeight: stage * (held?.opticalScale ?? 1) }}
        />
      ) : (
        <span className="font-display text-fg text-xl">{name}</span>
      )}
    </span>
  );
}
