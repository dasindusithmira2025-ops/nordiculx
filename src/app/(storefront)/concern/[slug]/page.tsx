import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProductFacets, listProducts } from '@/lib/catalogue/products';
import { getConcernBySlug } from '@/lib/catalogue/taxonomy';
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
  const concern = await getConcernBySlug(slug);
  if (!concern) return { title: 'Not found — Nordic Lux' };

  return {
    title: `${concern.name} — Nordic Lux`,
    description:
      concern.description ?? `Products for ${concern.name} at Nordic Lux.`,
    alternates: { canonical: `/concern/${concern.slug}` },
  };
}

/**
 * Concern landing page.
 *
 * The `guidance` copy leads before the grid: somebody who arrived searching
 * "dehydration" needs to know what that means and what actually helps before
 * being shown twelve things to buy. The concern is a locked filter and its
 * facet is hidden, for the same reason as the brand on /brands/[slug].
 */
export default async function ConcernPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<ListingSearchParams>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);

  const concern = await getConcernBySlug(slug);
  if (!concern) notFound();

  const { filters, locked, sort, page } = parseListing(query, {
    concernSlugs: [concern.slug],
  });

  const [result, facets, user] = await Promise.all([
    listProducts({ filters, sort, page, pageSize: PAGE_SIZE }),
    getProductFacets(filters, locked),
    currentUser(),
  ]);

  const wishlisted = user
    ? await getWishlistProductIds(user.id)
    : new Set<string>();

  const pathname = `/concern/${concern.slug}`;

  return (
    <>
      <PageHeader
        eyebrow="Concern"
        title={concern.name}
        description={concern.description}
        trail={[
          { label: 'Concerns', href: '/concern' },
          { label: concern.name, href: pathname },
        ]}
      />

      <div className="page-x mx-auto max-w-(--container-page) pb-28">
        {concern.guidance ? (
          <div className="border-line mb-16 border-y py-10">
            <p className="eyebrow text-fg-subtle mb-4">What helps</p>
            <div className="text-read text-fg-muted max-w-prose space-y-6">
              {concern.guidance.split('\n\n').map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
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
          hide={['concern']}
        />
      </div>
    </>
  );
}
