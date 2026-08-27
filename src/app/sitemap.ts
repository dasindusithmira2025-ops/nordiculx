import type { MetadataRoute } from 'next';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { publicConfig } from '@/lib/public-config';

/**
 * Sitemap.
 *
 * Only pages a search engine should actually index. Deliberately absent:
 * everything under `/account`, `/checkout`, `/order` and `/track` — those are
 * private or single-use, they already carry `noindex`, and listing them would
 * publish order references.
 *
 * Built from one query per entity rather than the route modules, so a product
 * that is unpublished or soft-deleted disappears from the sitemap the moment it
 * disappears from the shop.
 */
export const revalidate = 3600;

type Row = { slug: string; updated_at: string | Date };

const toDate = (value: string | Date) => new Date(value);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicConfig.appUrl.replace(/\/$/, '');

  // Destructuring a tuple of query results is typed as possibly-undefined under
  // `noUncheckedIndexedAccess`, so each group is defaulted at the call site.
  const results = (await Promise.all([
    db.execute(sql`SELECT slug, updated_at FROM products
                      WHERE status = 'published' AND deleted_at IS NULL`),
    db.execute(
      sql`SELECT slug, updated_at FROM categories WHERE status = 'published'`,
    ),
    db.execute(
      sql`SELECT slug, updated_at FROM brands WHERE status = 'published'`,
    ),
    db.execute(
      sql`SELECT slug, updated_at FROM concerns WHERE status = 'published'`,
    ),
    db.execute(
      sql`SELECT slug, updated_at FROM collections WHERE status = 'published'`,
    ),
    db.execute(sql`SELECT slug, updated_at FROM articles
                      WHERE status = 'published' AND published_at <= NOW()`),
    db.execute(
      sql`SELECT slug, updated_at FROM pages WHERE status = 'published'`,
    ),
  ])) as unknown as Row[][];

  const [products, categories, brands, concerns, collections, articles, pages] =
    results;

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/shop`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/brands`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/concern`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/collection`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/edit`, changeFrequency: 'weekly', priority: 0.6 },
    {
      url: `${base}/routine-finder`,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    { url: `${base}/faq`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/contact`, changeFrequency: 'yearly', priority: 0.4 },
  ];

  const group = (
    rows: Row[] | undefined,
    prefix: string,
    changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'],
    priority: number,
  ): MetadataRoute.Sitemap =>
    (rows ?? []).map((row) => ({
      url: `${base}${prefix}${row.slug}`,
      lastModified: toDate(row.updated_at),
      changeFrequency,
      priority,
    }));

  return [
    ...staticEntries,
    ...group(products, '/product/', 'weekly', 0.8),
    ...group(categories, '/category/', 'weekly', 0.7),
    ...group(brands, '/brands/', 'weekly', 0.6),
    ...group(concerns, '/concern/', 'monthly', 0.6),
    ...group(collections, '/collection/', 'weekly', 0.6),
    ...group(articles, '/edit/', 'monthly', 0.5),
    // CMS pages live at the root: /about, /privacy, and so on.
    ...group(pages, '/', 'yearly', 0.3),
  ];
}
