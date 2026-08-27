import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

/**
 * Storefront search.
 *
 * Driver-agnostic by design: the shape returned here is what the UI consumes,
 * so swapping the Postgres implementation for Meilisearch (SEARCH_DRIVER) is a
 * change to this file alone. See docs/ARCHITECTURE.md § Search.
 *
 * The Postgres implementation combines a full-text match with a trigram-style
 * ILIKE prefix so partial words ("clea", "kvi") still return something —
 * typeahead is useless if it only fires on complete words.
 */

export type SearchResultKind =
  'product' | 'brand' | 'category' | 'concern' | 'article';

export type SearchResult = {
  kind: SearchResultKind;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  imageUrl: string | null;
  /** Cents. Products only. */
  price: number | null;
};

export type SearchResults = {
  query: string;
  products: SearchResult[];
  brands: SearchResult[];
  categories: SearchResult[];
  concerns: SearchResult[];
  articles: SearchResult[];
  total: number;
};

const EMPTY: Omit<SearchResults, 'query'> = {
  products: [],
  brands: [],
  categories: [],
  concerns: [],
  articles: [],
  total: 0,
};

export async function search(
  rawQuery: string,
  options: { productLimit?: number; otherLimit?: number } = {},
): Promise<SearchResults> {
  const query = rawQuery.trim();
  // Two characters is the shortest input that returns anything meaningful;
  // below that every query would match most of the catalogue.
  if (query.length < 2) return { query, ...EMPTY };

  const like = `%${query}%`;
  const prefix = `${query}%`;
  const productLimit = options.productLimit ?? 6;
  const otherLimit = options.otherLimit ?? 4;

  const [products, brands, categories, concerns, articles] = await Promise.all([
    db.execute(sql`
      SELECT p.id, p.name AS title, b.name AS subtitle, p.slug,
             (SELECT m.url FROM product_media m
               WHERE m.product_id = p.id ORDER BY m.sort_order LIMIT 1) AS image_url,
             (SELECT MIN(COALESCE(pv.sale_price, pv.price)) FROM product_variants pv
               WHERE pv.product_id = p.id AND pv.status = 'published'
                 AND pv.deleted_at IS NULL)::int AS price,
             ts_rank(
               to_tsvector('english', p.name || ' ' || b.name || ' ' ||
                 coalesce(p.subtitle,'') || ' ' || coalesce(p.excerpt,'')),
               plainto_tsquery('english', ${query})
             ) AS rank
        FROM products p
        JOIN brands b ON b.id = p.brand_id
       WHERE p.status = 'published' AND p.deleted_at IS NULL
         AND (
           to_tsvector('english', p.name || ' ' || b.name || ' ' ||
             coalesce(p.subtitle,'') || ' ' || coalesce(p.excerpt,''))
             @@ plainto_tsquery('english', ${query})
           OR p.name ILIKE ${like}
           OR b.name ILIKE ${like}
         )
       ORDER BY rank DESC, (p.name ILIKE ${prefix}) DESC, p.featured DESC, p.name
       LIMIT ${productLimit}
    `) as unknown as Promise<
      {
        id: string;
        title: string;
        subtitle: string;
        slug: string;
        image_url: string | null;
        price: number | null;
      }[]
    >,

    db.execute(sql`
      SELECT id, name AS title, tagline AS subtitle, slug FROM brands
       WHERE status = 'published' AND (name ILIKE ${like} OR tagline ILIKE ${like})
       ORDER BY (name ILIKE ${prefix}) DESC, name LIMIT ${otherLimit}
    `) as unknown as Promise<
      { id: string; title: string; subtitle: string | null; slug: string }[]
    >,

    db.execute(sql`
      SELECT id, name AS title, description AS subtitle, slug FROM categories
       WHERE status = 'published' AND name ILIKE ${like}
       ORDER BY (name ILIKE ${prefix}) DESC, name LIMIT ${otherLimit}
    `) as unknown as Promise<
      { id: string; title: string; subtitle: string | null; slug: string }[]
    >,

    db.execute(sql`
      SELECT id, name AS title, description AS subtitle, slug FROM concerns
       WHERE status = 'published' AND (name ILIKE ${like} OR description ILIKE ${like})
       ORDER BY (name ILIKE ${prefix}) DESC, name LIMIT ${otherLimit}
    `) as unknown as Promise<
      { id: string; title: string; subtitle: string | null; slug: string }[]
    >,

    db.execute(sql`
      SELECT id, title, excerpt AS subtitle, slug, hero_image_url AS image_url
        FROM articles
       WHERE status = 'published' AND published_at <= NOW()
         AND (title ILIKE ${like} OR excerpt ILIKE ${like})
       ORDER BY (title ILIKE ${prefix}) DESC, published_at DESC LIMIT ${otherLimit}
    `) as unknown as Promise<
      {
        id: string;
        title: string;
        subtitle: string | null;
        slug: string;
        image_url: string | null;
      }[]
    >,
  ]);

  const results: SearchResults = {
    query,
    products: products.map((p) => ({
      kind: 'product' as const,
      id: p.id,
      title: p.title,
      subtitle: p.subtitle,
      href: `/product/${p.slug}`,
      imageUrl: p.image_url,
      price: p.price,
    })),
    brands: brands.map((b) => ({
      kind: 'brand' as const,
      id: b.id,
      title: b.title,
      subtitle: b.subtitle,
      href: `/brands/${b.slug}`,
      imageUrl: null,
      price: null,
    })),
    categories: categories.map((c) => ({
      kind: 'category' as const,
      id: c.id,
      title: c.title,
      subtitle: null,
      href: `/category/${c.slug}`,
      imageUrl: null,
      price: null,
    })),
    concerns: concerns.map((c) => ({
      kind: 'concern' as const,
      id: c.id,
      title: c.title,
      subtitle: c.subtitle,
      href: `/concern/${c.slug}`,
      imageUrl: null,
      price: null,
    })),
    articles: articles.map((a) => ({
      kind: 'article' as const,
      id: a.id,
      title: a.title,
      subtitle: a.subtitle,
      href: `/edit/${a.slug}`,
      imageUrl: a.image_url,
      price: null,
    })),
    total: 0,
  };

  results.total =
    results.products.length +
    results.brands.length +
    results.categories.length +
    results.concerns.length +
    results.articles.length;

  return results;
}
