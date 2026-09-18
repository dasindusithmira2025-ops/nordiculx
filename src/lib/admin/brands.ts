import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { PAID_SALE } from '@/lib/catalogue/sales';
import type { PublishStatus } from '@/lib/db/schema';
import { uuidSchema } from '@/lib/validation';

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

export type AdminBrandRow = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  story: string | null;
  logoUrl: string | null;
  heroImageUrl: string | null;
  originCountry: string | null;
  status: PublishStatus;
  featured: boolean;
  sortOrder: number;
  /** NULL means the brand ranks on real sales. */
  merchandisingRank: number | null;
  seoTitle: string | null;
  seoDescription: string | null;
  products: number;
  publishedProducts: number;
  units: number;
  /** Cents, net of the discount apportioned to each line. */
  revenue: number;
};

type RawBrandRow = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  description: string | null;
  story: string | null;
  logo_url: string | null;
  hero_image_url: string | null;
  origin_country: string | null;
  status: PublishStatus;
  featured: boolean;
  sort_order: number;
  merchandising_rank: number | null;
  seo_title: string | null;
  seo_description: string | null;
  products: number;
  published_products: number;
  units: number;
  revenue: string | number;
};

function mapBrand(row: RawBrandRow): AdminBrandRow {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    tagline: row.tagline,
    description: row.description,
    story: row.story,
    logoUrl: row.logo_url,
    heroImageUrl: row.hero_image_url,
    originCountry: row.origin_country,
    status: row.status,
    featured: row.featured,
    sortOrder: row.sort_order,
    merchandisingRank: row.merchandising_rank,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    products: row.products,
    publishedProducts: row.published_products,
    units: row.units,
    // bigint arrives as a string; Number is exact at these magnitudes.
    revenue: Number(row.revenue ?? 0),
  };
}

const brandColumns = sql`
  b.id, b.name, b.slug, b.tagline, b.description, b.story,
  b.logo_url, b.hero_image_url, b.origin_country, b.status, b.featured,
  b.sort_order, b.merchandising_rank, b.seo_title, b.seo_description,
  (SELECT COUNT(*)::int FROM products p
    WHERE p.brand_id = b.id AND p.deleted_at IS NULL) AS products,
  (SELECT COUNT(*)::int FROM products p
    WHERE p.brand_id = b.id
      AND p.status = 'published' AND p.deleted_at IS NULL
  ) AS published_products,
  COALESCE(sales.units, 0)::int AS units,
  COALESCE(sales.revenue, 0)::bigint AS revenue
`;

async function queryBrands(where = sql``) {
  const rows = (await db.execute(sql`
    SELECT ${brandColumns}
      FROM brands b
      LEFT JOIN LATERAL (
        SELECT SUM(oi.quantity)::int AS units,
               SUM(oi.line_total - oi.line_discount)::bigint AS revenue
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          JOIN products p ON p.id = oi.product_id
         WHERE p.brand_id = b.id AND ${PAID_SALE}
      ) sales ON TRUE
      ${where}
     ORDER BY b.merchandising_rank ASC NULLS LAST,
              COALESCE(sales.units, 0) DESC,
              b.sort_order ASC,
              b.name ASC
  `)) as unknown as RawBrandRow[];

  return rows.map(mapBrand);
}

export async function listBrandsForAdmin(): Promise<AdminBrandRow[]> {
  return queryBrands();
}

export async function getBrandForAdmin(
  id: string,
): Promise<AdminBrandRow | null> {
  if (!uuidSchema.safeParse(id).success) return null;

  const rows = await queryBrands(sql`WHERE b.id = ${id}`);
  return rows[0] ?? null;
}

/**
 * Compatibility read model for the sales-driven merchandising integration
 * tests and any caller that only needs the original five fields.
 */
export type BrandMerchandisingRow = Pick<
  AdminBrandRow,
  | 'id'
  | 'name'
  | 'slug'
  | 'status'
  | 'featured'
  | 'merchandisingRank'
  | 'publishedProducts'
  | 'units'
  | 'revenue'
>;

export async function listBrandsForMerchandising(): Promise<
  BrandMerchandisingRow[]
> {
  const brands = await listBrandsForAdmin();
  return brands.map((brand) => ({
    id: brand.id,
    name: brand.name,
    slug: brand.slug,
    status: brand.status,
    featured: brand.featured,
    merchandisingRank: brand.merchandisingRank,
    publishedProducts: brand.publishedProducts,
    units: brand.units,
    revenue: brand.revenue,
  }));
}
