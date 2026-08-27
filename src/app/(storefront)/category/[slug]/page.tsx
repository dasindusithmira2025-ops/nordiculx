import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProductFacets, listProducts } from '@/lib/catalogue/products';
import { getCategoryBySlug, getCategoryTree } from '@/lib/catalogue/taxonomy';
import type { CategoryNode } from '@/lib/catalogue/taxonomy';
import { PAGE_SIZE, parseListing } from '@/lib/catalogue/query';
import type { ListingSearchParams } from '@/lib/catalogue/query';
import { currentUser } from '@/lib/auth';
import { getWishlistProductIds } from '@/lib/wishlist';
import { PageHeader } from '@/components/layout/page-header';
import { ListingBody } from '@/components/catalogue/listing';

/** Locates a category in the tree along with its parent, for the breadcrumb. */
function locate(
  tree: CategoryNode[],
  slug: string,
): { node: CategoryNode; parent: CategoryNode | null } | null {
  for (const root of tree) {
    if (root.slug === slug) return { node: root, parent: null };
    for (const child of root.children) {
      if (child.slug === slug) return { node: child, parent: root };
    }
  }
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: 'Not found — Nordic Lux' };

  return {
    title: `${category.name} — Nordic Lux`,
    description:
      category.description ??
      `Shop ${category.name} at Nordic Lux — considered products from small northern studios.`,
    alternates: { canonical: `/category/${category.slug}` },
  };
}

/**
 * Category listing.
 *
 * The category is locked into the filters rather than read from the query
 * string, so the URL cannot be edited to show products from somewhere else
 * while the page still claims to be this category. Products in child
 * categories are included — someone browsing "Skincare" expects the serums.
 */
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<ListingSearchParams>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);

  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const { filters, locked, sort, page } = parseListing(query, {
    categorySlugs: [category.slug],
  });

  const [result, facets, tree, user] = await Promise.all([
    listProducts({ filters, sort, page, pageSize: PAGE_SIZE }),
    getProductFacets(filters, locked),
    getCategoryTree(),
    currentUser(),
  ]);

  const wishlisted = user
    ? await getWishlistProductIds(user.id)
    : new Set<string>();

  const located = locate(tree, category.slug);
  const children = located?.node.children ?? [];
  const pathname = `/category/${category.slug}`;

  return (
    <>
      <PageHeader
        eyebrow={located?.parent?.name ?? 'Category'}
        title={category.name}
        description={category.description}
        trail={[
          { label: 'Shop', href: '/shop' },
          ...(located?.parent
            ? [
                {
                  label: located.parent.name,
                  href: `/category/${located.parent.slug}`,
                },
              ]
            : []),
          { label: category.name, href: pathname },
        ]}
      />

      <div className="page-x mx-auto max-w-(--container-page) pb-28">
        {children.length > 0 ? (
          <nav aria-label="Subcategories" className="mb-12">
            <ul className="flex flex-wrap gap-2">
              {children.map((child) => (
                <li key={child.id}>
                  <Link
                    href={`/category/${child.slug}`}
                    className="border-line-strong text-fg hover:bg-fg hover:text-surface hover:border-fg eyebrow inline-flex items-center border px-4 py-2 transition-colors"
                  >
                    {child.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        <ListingBody
          pathname={pathname}
          searchParams={query}
          result={result}
          facets={facets}
          filters={filters}
          sort={sort}
          wishlisted={wishlisted}
          hide={['category']}
        />
      </div>
    </>
  );
}
