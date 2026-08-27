import type { Metadata } from 'next';
import { getProductFacets, listProducts } from '@/lib/catalogue/products';
import { PAGE_SIZE, parseListing } from '@/lib/catalogue/query';
import { trackEvent } from '@/lib/analytics';
import type { ListingSearchParams } from '@/lib/catalogue/query';
import { currentUser } from '@/lib/auth';
import { getWishlistProductIds } from '@/lib/wishlist';
import { PageHeader } from '@/components/layout/page-header';
import { ListingBody } from '@/components/catalogue/listing';

export const metadata: Metadata = {
  title: 'Shop all — Nordic Lux',
  description:
    'The complete Nordic Lux range: skincare, fragrance, hair, body, wellness and pantry from small northern studios.',
  alternates: { canonical: '/shop' },
};

/**
 * The master product listing.
 *
 * Every filter lives in the query string (see src/lib/catalogue/query.ts), so
 * this page holds no state of its own — it parses the URL, asks for a page of
 * products and the facet counts in parallel, and renders. Refinements are
 * ordinary links, which is why the whole thing works with JavaScript disabled.
 */
export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<ListingSearchParams>;
}) {
  const params = await searchParams;
  const { filters, locked, sort, page } = parseListing(params);

  const [result, facets, user] = await Promise.all([
    listProducts({ filters, sort, page, pageSize: PAGE_SIZE }),
    getProductFacets(filters, locked),
    currentUser(),
  ]);

  const wishlisted = user
    ? await getWishlistProductIds(user.id)
    : new Set<string>();

  // The term itself is what makes this useful — it is a query typed into a
  // shop, not personal data, and `sanitise` truncates it either way.
  if (filters.search) {
    await trackEvent(
      'search',
      { term: filters.search, results: result.total },
      { path: '/shop' },
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Everything"
        title={filters.search ? `Results for “${filters.search}”` : 'Shop all'}
        description={
          filters.search
            ? undefined
            : 'The full range, filterable by what you actually want to change.'
        }
        trail={[{ label: 'Shop', href: '/shop' }]}
      />

      <div className="page-x mx-auto max-w-(--container-page) pb-28">
        <ListingBody
          pathname="/shop"
          searchParams={params}
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
