import type { Metadata } from 'next';
import { listProducts } from '@/lib/catalogue/products';
import {
  getArticles,
  getBrands,
  getConcerns,
  getHomepageSections,
} from '@/lib/catalogue/taxonomy';
import { currentUser } from '@/lib/auth';
import { getWishlistProductIds } from '@/lib/wishlist';
import { Hero } from '@/components/home/hero';
import {
  ArticleRow,
  AssuranceRow,
  BrandMarquee,
  ConcernGrid,
  EditorialSplit,
  NewsletterSection,
  ProductRow,
} from '@/components/home/sections';

export const metadata: Metadata = {
  title: 'Nordic Lux — Curated beauty, wellness and pantry',
  description:
    'A curated house of beauty, skincare, fragrance, wellness and pantry from small northern studios. Considered products, honestly described.',
  alternates: { canonical: '/' },
};

/**
 * Homepage.
 *
 * Composed entirely from `homepage_sections`, so merchandising controls the
 * order, the copy and the scheduling without a deploy. Data for every section
 * is fetched in one parallel batch rather than per-section, so adding a
 * section does not add a request waterfall.
 */
export default async function HomePage() {
  const [sections, user] = await Promise.all([
    getHomepageSections(),
    currentUser(),
  ]);

  // The collection a spotlight section points at, resolved from its config so
  // merchandising can repoint the section without a code change.
  const spotlightSlug = sections
    .filter((s) => s.kind === 'collection_spotlight')
    .map((s) => (s.ctaHref ?? '').replace('/collection/', ''))
    .find(Boolean);

  const [
    newProducts,
    featuredProducts,
    spotlightProducts,
    concerns,
    brands,
    articles,
    wishlisted,
  ] = await Promise.all([
    listProducts({ sort: 'newest', pageSize: 4 }),
    listProducts({ sort: 'featured', pageSize: 8 }),
    spotlightSlug
      ? listProducts({
          filters: { collectionSlug: spotlightSlug },
          pageSize: 4,
        })
      : Promise.resolve(null),
    getConcerns(),
    getBrands(),
    getArticles({ limit: 3 }),
    user ? getWishlistProductIds(user.id) : Promise.resolve(new Set<string>()),
  ]);

  return (
    <>
      {sections.map((section) => {
        switch (section.kind) {
          case 'hero':
            return (
              <Hero
                key={section.id}
                eyebrow={section.eyebrow}
                title={section.title ?? 'Nordic Lux'}
                description={section.description}
                ctaLabel={section.ctaLabel}
                ctaHref={section.ctaHref}
                imageUrl={section.imageUrl}
                imageAlt={section.imageAlt}
                dark={section.dark}
              />
            );

          case 'featured_products': {
            const filter = (section.config as { filter?: string }).filter;
            const limit = (section.config as { limit?: number }).limit ?? 4;
            const source = filter === 'new' ? newProducts : featuredProducts;
            return (
              <ProductRow
                key={section.id}
                eyebrow={section.eyebrow}
                title={section.title}
                description={section.description}
                ctaLabel={section.ctaLabel}
                ctaHref={section.ctaHref}
                products={source.items.slice(0, limit)}
                wishlisted={wishlisted}
              />
            );
          }

          case 'concern_grid':
            return (
              <ConcernGrid
                key={section.id}
                eyebrow={section.eyebrow}
                title={section.title}
                description={section.description}
                concerns={concerns
                  .filter((c) => c.productCount > 0)
                  .slice(0, (section.config as { limit?: number }).limit ?? 6)}
              />
            );

          case 'collection_spotlight':
            return (
              <EditorialSplit
                key={section.id}
                eyebrow={section.eyebrow}
                title={section.title}
                description={section.description}
                ctaLabel={section.ctaLabel}
                ctaHref={section.ctaHref}
                imageUrl={section.imageUrl}
                imageAlt={section.imageAlt}
                dark={section.dark}
                products={spotlightProducts?.items ?? []}
                wishlisted={wishlisted}
              />
            );

          case 'routine_finder_promo':
            return (
              <EditorialSplit
                key={section.id}
                eyebrow={section.eyebrow}
                title={section.title}
                description={section.description}
                ctaLabel={section.ctaLabel}
                ctaHref={section.ctaHref}
                imageUrl={section.imageUrl}
                imageAlt={section.imageAlt}
                dark={section.dark}
                reverse
              />
            );

          case 'brand_marquee':
            return (
              <BrandMarquee
                key={section.id}
                eyebrow={section.eyebrow}
                title={section.title}
                ctaLabel={section.ctaLabel}
                ctaHref={section.ctaHref}
                brands={brands}
              />
            );

          case 'article_row':
            return (
              <ArticleRow
                key={section.id}
                eyebrow={section.eyebrow}
                title={section.title}
                description={section.description}
                ctaLabel={section.ctaLabel}
                ctaHref={section.ctaHref}
                articles={articles}
              />
            );

          case 'assurance_row':
            return <AssuranceRow key={section.id} title={section.title} />;

          case 'newsletter':
            return (
              <NewsletterSection
                key={section.id}
                eyebrow={section.eyebrow}
                title={section.title}
                description={section.description}
              />
            );

          default:
            // An unknown section kind renders nothing rather than crashing the
            // homepage — content data must never be able to take the site down.
            return null;
        }
      })}
    </>
  );
}
