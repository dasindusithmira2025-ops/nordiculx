import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getBrands } from '@/lib/catalogue/taxonomy';
import { PageHeader } from '@/components/layout/page-header';
import { BrandLogo } from '@/components/catalogue/brand-logo';
import { EmptyState, SectionHeading } from '@/components/ui/display';
import { ButtonLink } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Brands — Nordic Lux',
  description:
    'The studios behind the range: small northern makers chosen for how they formulate, not how loudly they market.',
  alternates: { canonical: '/brands' },
};

/**
 * Brand index.
 *
 * Featured brands get a photographic card; the rest are an alphabetical index,
 * because a grid of 40 equally-weighted brand tiles is a wall nobody reads.
 * Product counts come from the same query as the cards — a brand with nothing
 * published is still listed but says so, rather than linking to an empty page
 * with no explanation.
 */
export default async function BrandsPage() {
  const brands = await getBrands();
  const featured = brands.filter((brand) => brand.featured);
  const rest = brands.filter((brand) => !brand.featured);

  return (
    <>
      <PageHeader
        eyebrow="The makers"
        title="Brands"
        description="Small northern studios, most of them family-run. We carry a brand because of how it formulates and what it leaves out — not because of what it spends on advertising."
        trail={[{ label: 'Brands', href: '/brands' }]}
      />

      <div className="page-x mx-auto max-w-(--container-page) pb-28">
        {brands.length === 0 ? (
          <EmptyState
            title="No brands published yet"
            description="The range is being prepared. In the meantime, everything currently in stock is in the shop."
            action={<ButtonLink href="/shop">Shop all</ButtonLink>}
          />
        ) : null}

        {featured.length > 0 ? (
          <section>
            <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((brand) => (
                <Link
                  key={brand.id}
                  href={`/brands/${brand.slug}`}
                  className="group block"
                >
                  <div className="bg-surface-sunken relative aspect-[4/5] overflow-hidden">
                    {brand.heroImageUrl ? (
                      <Image
                        src={brand.heroImageUrl}
                        alt=""
                        fill
                        sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
                        className="duration-editorial ease-standard object-cover transition-transform group-hover:scale-[1.02]"
                      />
                    ) : null}
                  </div>
                  <div className="mt-5">
                    {brand.originCountry ? (
                      <p className="eyebrow text-fg-subtle">
                        {brand.originCountry}
                      </p>
                    ) : null}
                    <h2 className="mt-3">
                      <BrandLogo
                        slug={brand.slug}
                        name={brand.name}
                        logoUrl={brand.logoUrl}
                        stage={36}
                      />
                    </h2>
                    {brand.tagline ? (
                      <p className="text-fg-muted mt-2 text-sm">
                        {brand.tagline}
                      </p>
                    ) : null}
                    <p className="text-fg-subtle mt-3 text-xs tabular-nums">
                      {brand.productCount}{' '}
                      {brand.productCount === 1 ? 'product' : 'products'}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {rest.length > 0 ? (
          <section className={featured.length > 0 ? 'section-y' : ''}>
            <SectionHeading
              eyebrow="A–Z"
              title="Every brand"
              className="mb-10"
            />
            <ul className="border-line border-t">
              {rest.map((brand) => (
                <li key={brand.id} className="border-line border-b">
                  <Link
                    href={`/brands/${brand.slug}`}
                    className="hover:bg-accent-soft group flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 px-1 py-6 transition-colors"
                  >
                    {/* The official logo stands in for the name here: it is
                        set on the shared stage, so a 300px-wide wordmark and a
                        stacked lockup still align down the column, and the
                        name travels with it as the image's alt text. */}
                    <span className="flex flex-wrap items-center gap-x-5 gap-y-1">
                      <BrandLogo
                        slug={brand.slug}
                        name={brand.name}
                        logoUrl={brand.logoUrl}
                        stage={32}
                      />
                      {brand.tagline ? (
                        <span className="text-fg-muted text-sm">
                          {brand.tagline}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-fg-subtle text-xs tabular-nums">
                      {brand.productCount}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
