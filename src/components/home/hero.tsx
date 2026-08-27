import Image from 'next/image';
import { ButtonLink } from '@/components/ui/button';

/**
 * Campaign hero.
 *
 * The one place on the site that gets to be loud. Full-bleed image on the dark
 * editorial surface, headline set in the display serif at fluid size, and
 * everything else deliberately quiet around it.
 *
 * The scrim is a two-stop gradient rather than a flat overlay so the image
 * keeps its depth at the top while the text stays legible at the bottom —
 * contrast is guaranteed by the scrim, not by hoping the artwork is dark
 * enough.
 */
export function Hero({
  eyebrow,
  title,
  description,
  ctaLabel,
  ctaHref,
  imageUrl,
  imageAlt,
  dark = true,
}: {
  eyebrow?: string | null;
  title: string;
  description?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  dark?: boolean;
}) {
  // Titles carry an explicit line break from the CMS so merchandising controls
  // where a headline turns, rather than leaving it to the viewport.
  const lines = title.split('\n');

  return (
    <section
      data-surface={dark ? 'ink' : 'paper'}
      className="bg-surface text-fg relative isolate flex min-h-[34rem] items-end overflow-hidden md:min-h-[78dvh]"
    >
      {imageUrl ? (
        <>
          <Image
            src={imageUrl}
            alt={imageAlt ?? ''}
            fill
            priority
            sizes="100vw"
            className="-z-20 object-cover"
          />
          <div
            aria-hidden
            className="from-ink-950/85 via-ink-950/35 absolute inset-0 -z-10 bg-linear-to-t to-transparent"
          />
        </>
      ) : null}

      <div className="page-x mx-auto w-full max-w-(--container-page) pt-32 pb-16 md:pb-24">
        <div className="max-w-3xl">
          {eyebrow ? (
            <p className="eyebrow animate-fade-up text-fg-muted">{eyebrow}</p>
          ) : null}

          <h1 className="font-display text-display-xl mt-6">
            {lines.map((line, i) => (
              <span key={i} className="animate-fade-up block">
                {line}
              </span>
            ))}
          </h1>

          {description ? (
            <p className="animate-fade-up text-fg-muted mt-7 max-w-xl text-lg">
              {description}
            </p>
          ) : null}

          {ctaLabel && ctaHref ? (
            <div className="animate-fade-up mt-10">
              <ButtonLink href={ctaHref} size="lg">
                {ctaLabel}
              </ButtonLink>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
