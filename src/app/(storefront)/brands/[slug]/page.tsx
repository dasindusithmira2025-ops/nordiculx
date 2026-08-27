import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getProductFacets, listProducts } from '@/lib/catalogue/products';
import { getBrandBySlug } from '@/lib/catalogue/taxonomy';
import { PAGE_SIZE, parseListing } from '@/lib/catalogue/query';
import type { ListingSearchParams } from '@/lib/catalogue/query';
import { currentUser } from '@/lib/auth';
import { getWishlistProductIds } from '@/lib/wishlist';
import { PageHeader } from '@/components/layout/page-header';
import { ListingBody } from '@/components/catalogue/listing';
import { Prose } from '@/components/ui/display';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) return { title: 'Not found — Nordic Lux' };

  return {
    title: brand.seoTitle ?? `${brand.name} — Nordic Lux`,
    description:
      brand.seoDescription ??
      brand.tagline ??
      brand.description ??
      `Shop ${brand.name} at Nordic Lux.`,
    alternates: { canonical: `/brands/${brand.slug}` },
  };
}

/**
 * Brand landing page: the brand's story, then its products.
 *
 * The brand is a locked filter rather than a query param, so editing the URL
 * cannot show another brand's products on a page still titled with this one.
 * The brand facet is hidden — on /brands/kvist every result is Kvist by
 * definition, so offering it as a refinement is noise.
 */
export default async function BrandPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<ListingSearchParams>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);

  const brand = await getBrandBySlug(slug);
  if (!brand) notFound();

  const { filters, locked, sort, page } = parseListing(query, {
    brandSlugs: [brand.slug],
  });

  const [result, facets, user] = await Promise.all([
    listProducts({ filters, sort, page, pageSize: PAGE_SIZE }),
    getProductFacets(filters, locked),
    currentUser(),
  ]);

  const wishlisted = user
    ? await getWishlistProductIds(user.id)
    : new Set<string>();

  const pathname = `/brands/${brand.slug}`;

  return (
    <>
      {brand.heroImageUrl ? (
        <div className="bg-surface-sunken relative aspect-[21/9] w-full overflow-hidden md:aspect-[3/1]">
          <Image
            src={brand.heroImageUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>
      ) : null}

      <PageHeader
        eyebrow={brand.originCountry ?? 'Brand'}
        title={brand.name}
        description={brand.tagline ?? brand.description}
        trail={[
          { label: 'Brands', href: '/brands' },
          { label: brand.name, href: pathname },
        ]}
      />

      <div className="page-x mx-auto max-w-(--container-page) pb-28">
        {brand.story ? (
          <div className="border-line mb-16 border-b pb-16">
            <Prose>
              {brand.story.split('\n\n').map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </Prose>
          </div>
        ) : null}

        <ListingBody
          pathname={pathname}
          searchParams={query}
          result={result}
          facets={facets}
          filters={filters}
          sort={sort}
          wishlisted={wishlisted}
          hide={['brand']}
        />
      </div>
    </>
  );
}
