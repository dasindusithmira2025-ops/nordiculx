import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { PAID_SALE } from '@/lib/catalogue/sales';
import type { PublishStatus } from '@/lib/db/schema';

/**
 * Every brand with what it has actually sold.
 *
 * Unpublished and archived brands are included: the screen is where a brand is
 * brought back as much as where one is pushed forward, and a brand that has
 * vanished from the list cannot be either.
 *
 * Same sale definition as the storefront ranking — see `PAID_SALE`. Staff
 * reading a units figure here and a customer reading the Top Selling Brands
 * row are looking at the same orders.
 *
 * Authorisation is NOT performed here; callers have been through
 * `requireStaff`.
 */

export type BrandMerchandisingRow = {
  id: string;
  name: string;
  slug: string;
  status: PublishStatus;
  featured: boolean;
  /** NULL means the brand ranks on real sales. */
  merchandisingRank: number | null;
  publishedProducts: number;
  units: number;
  /** Cents, net of the discount apportioned to each line. */
  revenue: number;
};

export async function listBrandsForMerchandising(): Promise<
  BrandMerchandisingRow[]
> {
  const rows = (await db.execute(sql`
    SELECT b.id, b.name, b.slug, b.status, b.featured, b.merchandising_rank,
           (SELECT COUNT(*)::int FROM products p
             WHERE p.brand_id = b.id
               AND p.status = 'published' AND p.deleted_at IS NULL
           ) AS published_products,
           COALESCE(sales.units, 0)::int AS units,
           COALESCE(sales.revenue, 0)::bigint AS revenue
      FROM brands b
      LEFT JOIN LATERAL (
        SELECT SUM(oi.quantity)::int AS units,
               SUM(oi.line_total - oi.line_discount)::bigint AS revenue
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          JOIN products p ON p.id = oi.product_id
         WHERE p.brand_id = b.id AND ${PAID_SALE}
      ) sales ON TRUE
     ORDER BY b.merchandising_rank ASC NULLS LAST,
              COALESCE(sales.units, 0) DESC,
              b.name ASC
  `)) as unknown as {
    id: string;
    name: string;
    slug: string;
    status: PublishStatus;
    featured: boolean;
    merchandising_rank: number | null;
    published_products: number;
    units: number;
    revenue: string | number;
  }[];

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    status: r.status,
    featured: r.featured,
    merchandisingRank: r.merchandising_rank,
    publishedProducts: r.published_products,
    units: r.units,
    // bigint arrives as a string; Number is exact at these magnitudes.
    revenue: Number(r.revenue ?? 0),
  }));
}
