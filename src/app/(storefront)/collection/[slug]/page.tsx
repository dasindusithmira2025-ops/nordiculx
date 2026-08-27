import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getProductFacets, listProducts } from '@/lib/catalogue/products';
import { getCollectionBySlug } from '@/lib/catalogue/taxonomy';
import { PAGE_SIZE, parseListing } from '@/lib/catalogue/query';
import type { ListingSearchParams } from '@/lib/catalogue/query';
import { currentUser } from '@/lib/auth';
import { getWishlistProductIds } from '@/lib/wishlist';
import { PageHeader } from '@/components/layout/page-header';
import { ListingBody } from '@/components/catalogue/listing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);
  if (!collection) return { title: 'Not found — Nordic Lux' };

  return {
    title: collection.seoTitle ?? `${collection.name} — Nordic Lux`,
    description:
      collection.seoDescription ??
      collection.description ??
      `Shop the ${collection.name} collection at Nordic Lux.`,
    alternates: { canonical: `/collection/${collection.slug}` },
  };
}

/**
 * Collection listing.
 *
 * `collectionSlug` is a single locked filter rather than a facet: a collection
 * is a curated set, and letting a visitor union two of them would produce a
 * page that is no longer any of the collections it names.
 */
export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<ListingSearchParams>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);

  const collection = await getCollectionBySlug(slug);
  if (!collection) notFound();

  const { filters, locked, sort, page } = parseListing(query, {
    collectionSlug: collection.slug,
  });

  const [result, facets, user] = await Promise.all([
    listProducts({ filters, sort, page, pageSize: PAGE_SIZE }),
    getProductFacets(filters, locked),
    currentUser(),
  ]);

  const wishlisted = user
    ? await getWishlistProductIds(user.id)
    : new Set<string>();

  const pathname = `/collection/${collection.slug}`;

  return (
    <>
      {collection.heroImageUrl ? (
        <div className="bg-surface-sunken relative aspect-[21/9] w-full overflow-hidden md:aspect-[3/1]">
          <Image
            src={collection.heroImageUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>
      ) : null}

      <PageHeader
        eyebrow="Collection"
        title={collection.name}
        description={collection.description}
        trail={[
          { label: 'Collections', href: '/collection' },
          { label: collection.name, href: pathname },
        ]}
      />

      <div className="page-x mx-auto max-w-(--container-page) pb-28">
        <ListingBody
          pathname={pathname}
          searchParams={query}
          result={result}
          facets={facets}
          filters={filters}
          sort={sort}
          wishlisted={wishlisted}
        />
      </div>
    </>
  );
}
