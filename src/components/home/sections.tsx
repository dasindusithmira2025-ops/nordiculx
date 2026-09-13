import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import type { ProductCardView } from '@/lib/catalogue/types';
import { BrandLogo } from '@/components/catalogue/brand-logo';
import { ProductCard } from '@/components/commerce/product-card';
import { ButtonLink } from '@/components/ui/button';
import { SectionHeading } from '@/components/ui/display';
import {
  ArrowRightIcon,
  LeafIcon,
  TruckIcon,
  SparkleIcon,
} from '@/components/ui/icons';
import { NewsletterForm } from '@/components/marketing/newsletter-form';

/**
 * Homepage sections.
 *
 * Each is a pure presentational block; the page resolves data and picks which
 * to render from `homepage_sections`. Section order, copy and scheduling are
 * merchandising decisions made in the admin, not in this file.
 */

/* -------------------------------------------------------------------------- */

export function ProductRow({
  eyebrow,
  title,
  description,
  ctaLabel,
  ctaHref,
  products,
  wishlisted,
  columns = 4,
}: {
  eyebrow?: string | null;
  title?: string | null;
  description?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  products: ProductCardView[];
  wishlisted: Set<string>;
  columns?: 3 | 4;
}) {
  if (products.length === 0) return null;

  return (
    <section className="page-x section-y mx-auto max-w-(--container-page)">
      <SectionHeading
        eyebrow={eyebrow ?? undefined}
        title={title ?? ''}
        description={description ?? undefined}
        action={
          ctaLabel && ctaHref ? (
            <ButtonLink href={ctaHref} variant="secondary" size="sm">
              {ctaLabel}
            </ButtonLink>
          ) : undefined
        }
      />

      <div
        className={cn(
          'mt-12 grid gap-x-5 gap-y-12 sm:gap-x-6',
          'grid-cols-2',
          columns === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
        )}
      >
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            wishlisted={wishlisted.has(product.id)}
          />
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export function ConcernGrid({
  eyebrow,
  title,
  description,
  concerns,
}: {
  eyebrow?: string | null;
  title?: string | null;
  description?: string | null;
  concerns: {
    slug: string;
    name: string;
    description: string | null;
    imageUrl: string | null;
    productCount: number;
  }[];
}) {
  if (concerns.length === 0) return null;

  return (
    <section className="border-line bg-surface-raised border-y">
      <div className="page-x section-y mx-auto max-w-(--container-page)">
        <SectionHeading
          eyebrow={eyebrow ?? undefined}
          title={title ?? ''}
          description={description ?? undefined}
          action={
            <ButtonLink href="/concern" variant="secondary" size="sm">
              All concerns
            </ButtonLink>
          }
        />

        {/* Still the hairline-divided grid, not a row of rounded tiles: cells
            are separated by a 1px gap over the rule colour, and the image sits
            flush inside its cell rather than in a card of its own.

            The imagery is the editorial concern set already in the media
            library (`/media/editorial/concern-*`) — still lifes that carry the
            mood: linen over cracked earth for dryness, a droplet on stone for
            dehydration. Deliberately never a face or a close-up of skin. Those
            would read as a photograph of a condition, and Nordic Lux does not
            make claims about conditions. */}
        <ul className="border-line bg-line mt-12 grid gap-px overflow-hidden border sm:grid-cols-2 lg:grid-cols-3">
          {concerns.map((concern) => (
            <li key={concern.slug} className="bg-surface">
              <Link
                href={`/concern/${concern.slug}`}
                className="group hover:bg-surface-raised flex h-full flex-col transition-colors"
              >
                {/* A concern with no image keeps the original text-only cell
                    rather than opening with an empty grey band. */}
                {concern.imageUrl ? (
                  <div className="bg-surface-sunken relative aspect-[16/10] overflow-hidden">
                    <Image
                      src={concern.imageUrl}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="duration-editorial ease-standard object-cover transition-transform group-hover:scale-[1.02]"
                    />
                  </div>
                ) : null}

                <div className="flex flex-1 flex-col justify-between gap-8 p-8">
                  <div>
                    <h3 className="font-display text-display-sm">
                      {concern.name}
                    </h3>
                    {concern.description ? (
                      <p className="text-fg-muted mt-3 text-sm">
                        {concern.description}
                      </p>
                    ) : null}
                  </div>
                  <span className="eyebrow text-fg-subtle flex items-center justify-between">
                    {concern.productCount}{' '}
                    {concern.productCount === 1 ? 'product' : 'products'}
                    <ArrowRightIcon
                      width={16}
                      height={16}
                      className="duration-standard transition-transform group-hover:translate-x-1"
                    />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Editorial split: a full-height image against a block of copy, on the dark
 * surface. Used for a collection spotlight and the Routine Finder promo.
 */
export function EditorialSplit({
  eyebrow,
  title,
  description,
  ctaLabel,
  ctaHref,
  imageUrl,
  imageAlt,
  dark = true,
  reverse = false,
  products,
  wishlisted,
}: {
  eyebrow?: string | null;
  title?: string | null;
  description?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  dark?: boolean;
  reverse?: boolean;
  products?: ProductCardView[];
  wishlisted?: Set<string>;
}) {
  return (
    <section
      data-surface={dark ? 'ink' : 'paper'}
      className="bg-surface text-fg"
    >
      <div className="grid lg:grid-cols-2">
        <div
          className={cn(
            'relative min-h-[22rem] lg:min-h-[40rem]',
            reverse && 'lg:order-2',
          )}
        >
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={imageAlt ?? ''}
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          ) : (
            <div className="bg-surface-raised absolute inset-0" />
          )}
        </div>

        <div className="flex flex-col justify-center px-6 py-16 sm:px-12 lg:px-20 lg:py-24">
          <div className="max-w-lg">
            {eyebrow ? (
              <p className="eyebrow text-fg-subtle">{eyebrow}</p>
            ) : null}
            {title ? (
              <h2 className="font-display text-display-lg mt-5">
                {title.split('\n').map((line, i) => (
                  <span key={i} className="block">
                    {line}
                  </span>
                ))}
              </h2>
            ) : null}
            {description ? (
              <p className="text-fg-muted mt-6 text-base">{description}</p>
            ) : null}
            {ctaLabel && ctaHref ? (
              <ButtonLink href={ctaHref} size="lg" className="mt-10 self-start">
                {ctaLabel}
              </ButtonLink>
            ) : null}
          </div>

          {products && products.length > 0 ? (
            <div className="mt-14 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
              {products.slice(0, 4).map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  wishlisted={wishlisted?.has(product.id) ?? false}
                  sizes="(min-width: 1024px) 20vw, 45vw"
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export function BrandMarquee({
  eyebrow,
  title,
  ctaLabel,
  ctaHref,
  brands,
}: {
  eyebrow?: string | null;
  title?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  brands: {
    slug: string;
    name: string;
    tagline: string | null;
    logoUrl: string | null;
  }[];
}) {
  if (brands.length === 0) return null;

  return (
    <section className="page-x section-y mx-auto max-w-(--container-page)">
      <SectionHeading
        eyebrow={eyebrow ?? undefined}
        title={title ?? ''}
        action={
          ctaLabel && ctaHref ? (
            <ButtonLink href={ctaHref} variant="secondary" size="sm">
              {ctaLabel}
            </ButtonLink>
          ) : undefined
        }
      />

      {/* A logo wall held to one optical height, on the same hairline grid as
          the rest of the page. The official assets are stored locally and
          rendered in their own colours; the restraint is in the size of the
          stage and the air around it, not in recolouring somebody else's
          mark. A brand we hold no asset for keeps its name in the display
          serif on the same stage, so the row still lines up. */}
      <ul className="border-line bg-line mt-12 grid gap-px overflow-hidden border sm:grid-cols-2 lg:grid-cols-4">
        {brands.map((brand) => (
          <li key={brand.slug} className="bg-surface">
            <Link
              href={`/brands/${brand.slug}`}
              className="group hover:bg-surface-raised flex h-full flex-col gap-4 p-8 transition-colors"
            >
              <BrandLogo
                slug={brand.slug}
                name={brand.name}
                logoUrl={brand.logoUrl}
              />
              {brand.tagline ? (
                <span className="text-fg-subtle text-xs">{brand.tagline}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export function ArticleRow({
  eyebrow,
  title,
  description,
  ctaLabel,
  ctaHref,
  articles,
}: {
  eyebrow?: string | null;
  title?: string | null;
  description?: string | null;
  ctaLabel?: string | null;
  ctaHref?: string | null;
  articles: {
    slug: string;
    title: string;
    excerpt: string | null;
    heroImageUrl: string | null;
    heroImageAlt: string | null;
    topicName: string | null;
    readingMinutes: number | null;
  }[];
}) {
  if (articles.length === 0) return null;

  return (
    <section className="border-line border-t">
      <div className="page-x section-y mx-auto max-w-(--container-page)">
        <SectionHeading
          eyebrow={eyebrow ?? undefined}
          title={title ?? ''}
          description={description ?? undefined}
          action={
            ctaLabel && ctaHref ? (
              <ButtonLink href={ctaHref} variant="secondary" size="sm">
                {ctaLabel}
              </ButtonLink>
            ) : undefined
          }
        />

        <div className="mt-12 grid gap-10 md:grid-cols-3">
          {articles.map((article) => (
            <article key={article.slug} className="group">
              <Link href={`/edit/${article.slug}`} className="block">
                <div className="bg-surface-sunken relative aspect-4/3 overflow-hidden">
                  {article.heroImageUrl ? (
                    <Image
                      src={article.heroImageUrl}
                      alt={article.heroImageAlt ?? ''}
                      fill
                      sizes="(min-width: 768px) 33vw, 100vw"
                      className="duration-editorial ease-standard object-cover transition-transform group-hover:scale-[1.03]"
                    />
                  ) : null}
                </div>

                <div className="pt-5">
                  <p className="eyebrow text-fg-subtle">
                    {article.topicName}
                    {article.readingMinutes
                      ? ` · ${article.readingMinutes} min read`
                      : ''}
                  </p>
                  <h3 className="font-display text-display-sm mt-3">
                    <span className="link-underline">{article.title}</span>
                  </h3>
                  {article.excerpt ? (
                    <p className="text-fg-muted mt-3 line-clamp-3 text-sm">
                      {article.excerpt}
                    </p>
                  ) : null}
                </div>
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Trust row.
 *
 * Every claim here must be one Nordic Lux can stand behind operationally.
 * No invented guarantees, no certification badges we do not hold.
 */
export function AssuranceRow({ title }: { title?: string | null }) {
  const items = [
    {
      icon: <SparkleIcon width={20} height={20} />,
      title: 'Sourced directly',
      body: 'We buy from each brand or its appointed distributor, never from grey-market resellers.',
    },
    {
      icon: <TruckIcon width={20} height={20} />,
      title: 'Island-wide delivery',
      body: 'Complimentary over $100. Tracked from our Weboda studio to your door.',
    },
    {
      icon: <LeafIcon width={20} height={20} />,
      title: 'Described honestly',
      body: 'We tell you how a product is used and how it feels. We do not make medical claims.',
    },
  ];

  return (
    <section className="border-line bg-surface-raised border-y">
      <div className="page-x mx-auto max-w-(--container-page) py-16">
        {title ? <h2 className="sr-only">{title}</h2> : null}
        <ul className="grid gap-10 md:grid-cols-3">
          {items.map((item) => (
            <li key={item.title} className="flex gap-4">
              <span className="text-fg-muted mt-0.5 shrink-0">{item.icon}</span>
              <div>
                <h3 className="eyebrow text-fg">{item.title}</h3>
                <p className="text-fg-muted mt-2 text-sm">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export function NewsletterSection({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string | null;
  title?: string | null;
  description?: string | null;
}) {
  return (
    <section data-surface="ink" className="bg-surface text-fg">
      <div className="page-x section-y mx-auto max-w-3xl text-center">
        {eyebrow ? <p className="eyebrow text-fg-subtle">{eyebrow}</p> : null}
        {title ? (
          <h2 className="font-display text-display-lg mt-5">{title}</h2>
        ) : null}
        {description ? (
          <p className="text-fg-muted mx-auto mt-6 max-w-xl text-base">
            {description}
          </p>
        ) : null}
        <div className="mx-auto mt-10 max-w-md text-left">
          <NewsletterForm source="homepage" />
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

/** One advertised offer. Authored in `homepage_sections.config.tiles`. */
export type PromoTile = {
  imageUrl: string;
  imageAlt?: string | null;
  /** Offer terms, e.g. "20% off" — set over the image. */
  eyebrow?: string | null;
  title?: string | null;
  ctaLabel?: string | null;
  href: string;
};

/**
 * A row of advertised offers.
 *
 * Image-first: the artwork carries the offer and the text is a legible
 * fallback over it, so merchandising can ship a campaign by swapping images
 * without touching copy. Tiles come from the section's `config.tiles`, so the
 * count and the links are editable without a deploy.
 */
export function PromoBanners({
  eyebrow,
  title,
  description,
  tiles,
}: {
  eyebrow?: string | null;
  title?: string | null;
  description?: string | null;
  tiles: PromoTile[];
}) {
  if (tiles.length === 0) return null;

  return (
    <section className="border-line border-t">
      <div className="page-x section-y mx-auto max-w-(--container-page)">
        {title || eyebrow ? (
          <SectionHeading
            eyebrow={eyebrow ?? undefined}
            title={title ?? ''}
            description={description ?? undefined}
          />
        ) : null}

        <div
          className={cn(
            'mt-12 grid gap-5 sm:gap-6',
            tiles.length === 1
              ? 'grid-cols-1'
              : tiles.length % 2 === 0
                ? 'sm:grid-cols-2'
                : 'sm:grid-cols-2 lg:grid-cols-3',
          )}
        >
          {tiles.map((tile) => (
            <Link
              key={tile.href + tile.imageUrl}
              href={tile.href}
              className="group bg-surface-sunken relative block aspect-16/9 overflow-hidden"
            >
              <Image
                src={tile.imageUrl}
                alt={tile.imageAlt ?? tile.title ?? ''}
                fill
                sizes={
                  tiles.length === 1
                    ? '100vw'
                    : '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw'
                }
                className="duration-editorial ease-standard object-cover transition-transform group-hover:scale-[1.03]"
              />

              {/* Scrim only where the type sits, so the artwork stays readable. */}
              <div
                aria-hidden
                className="from-ink-950/85 via-ink-950/30 absolute inset-0 bg-linear-to-t to-transparent"
              />

              <div
                data-surface="ink"
                className="text-fg absolute inset-x-0 bottom-0 p-6 sm:p-8"
              >
                {tile.eyebrow ? (
                  <p className="eyebrow text-fg-muted">{tile.eyebrow}</p>
                ) : null}
                {tile.title ? (
                  <h3 className="font-display text-display-sm mt-2">
                    {tile.title}
                  </h3>
                ) : null}
                {tile.ctaLabel ? (
                  <span className="mt-4 inline-flex items-center gap-2 text-sm">
                    <span className="link-underline">{tile.ctaLabel}</span>
                    <ArrowRightIcon width={16} height={16} />
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
