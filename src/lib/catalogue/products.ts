import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discountPercent } from '@/lib/money';
import { unitsSoldFor } from './sales';
import type {
  ProductCardView,
  ProductDetailView,
  ProductFacets,
  ProductFilters,
  ProductListResult,
  ProductSort,
  VariantView,
} from './types';

/**
 * Product queries.
 *
 * Written as parameterised SQL rather than ORM chains because the listing
 * needs a lateral aggregate over variants and inventory in the SAME statement.
 * Fetching cards and then their prices/stock per row is the classic N+1 that
 * makes a PLP slow, and no amount of query-builder elegance fixes it.
 *
 * Every value interpolated below goes through drizzle's `sql` tagged template,
 * which binds parameters — user input is never concatenated into SQL.
 */

const LOW_STOCK_THRESHOLD = 5;

/** Only published, non-deleted products are ever visible on the storefront. */
const visibleProduct = sql`p.status = 'published' AND p.deleted_at IS NULL`;

/**
 * Per-product aggregate over its sellable variants: the price range, whether
 * anything is discounted, and how many units can actually be sold.
 */
const variantAggregate = sql`
  LEFT JOIN LATERAL (
    SELECT
      MIN(pv.price)                                        AS min_price,
      MIN(COALESCE(pv.sale_price, pv.price))               AS min_effective,
      MIN(pv.sale_price)                                   AS min_sale_price,
      BOOL_OR(pv.sale_price IS NOT NULL)                   AS has_sale,
      COUNT(*)::int                                        AS variant_count,
      COALESCE(SUM(GREATEST(COALESCE(i.on_hand, 0) - COALESCE(i.reserved, 0), 0)), 0)::int AS available,
      BOOL_OR(COALESCE(i.allow_backorder, false))          AS allow_backorder,
      (ARRAY_AGG(pv.id ORDER BY pv.is_default DESC, pv.sort_order ASC))[1] AS default_variant_id
    FROM product_variants pv
    LEFT JOIN inventory_items i ON i.variant_id = pv.id
    WHERE pv.product_id = p.id
      AND pv.deleted_at IS NULL
      AND pv.status = 'published'
  ) v ON TRUE
`;

/** Primary and secondary imagery, resolved without a second round trip. */
const mediaJoin = sql`
  LEFT JOIN LATERAL (
    SELECT
      (ARRAY_AGG(m.url ORDER BY m.sort_order))[1] AS url,
      (ARRAY_AGG(m.alt ORDER BY m.sort_order))[1] AS alt,
      (ARRAY_AGG(m.url ORDER BY m.sort_order))[2] AS hover_url,
      (ARRAY_AGG(m.alt ORDER BY m.sort_order))[2] AS hover_alt
    FROM product_media m
    WHERE m.product_id = p.id AND m.kind = 'image'
  ) img ON TRUE
`;

type CardRow = {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  brand_name: string;
  brand_slug: string;
  rating_average: number;
  rating_count: number;
  new_until: Date | null;
  min_price: number | null;
  min_effective: number | null;
  min_sale_price: number | null;
  has_sale: boolean | null;
  variant_count: number | null;
  available: number | null;
  allow_backorder: boolean | null;
  default_variant_id: string | null;
  url: string | null;
  alt: string | null;
  hover_url: string | null;
  hover_alt: string | null;
};

function toCard(row: CardRow): ProductCardView {
  const fromPrice = row.min_price ?? 0;
  const effectivePrice = row.min_effective ?? fromPrice;
  const onSale = Boolean(row.has_sale) && effectivePrice < fromPrice;
  const available = row.available ?? 0;
  const inStock = available > 0 || Boolean(row.allow_backorder);

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    subtitle: row.subtitle,
    brandName: row.brand_name,
    brandSlug: row.brand_slug,
    image: row.url
      ? { url: row.url, alt: row.alt ?? row.name, width: 1200, height: 1600 }
      : null,
    hoverImage: row.hover_url
      ? {
          url: row.hover_url,
          alt: row.hover_alt ?? row.name,
          width: 1200,
          height: 1600,
        }
      : null,
    fromPrice,
    effectivePrice,
    salePrice: onSale ? (row.min_sale_price ?? null) : null,
    onSale,
    discountPercent: onSale ? discountPercent(fromPrice, effectivePrice) : 0,
    ratingAverage: Number(row.rating_average ?? 0),
    ratingCount: Number(row.rating_count ?? 0),
    inStock,
    lowStock: inStock && available > 0 && available <= LOW_STOCK_THRESHOLD,
    isNew: row.new_until !== null && new Date(row.new_until) > new Date(),
    variantCount: row.variant_count ?? 0,
    defaultVariantId: row.default_variant_id,
  };
}

/**
 * Builds the WHERE fragment for a set of filters. Always includes visibility.
 *
 * Note on arrays: drizzle's `sql` template expands a JS array into a
 * parenthesised PARAMETER LIST — `('a','b')` — not into a Postgres array
 * literal. So list membership must be written as `IN ${array}`; writing
 * `= ANY(${array})` produces `ANY(($1))` and fails at runtime with
 * "malformed array literal".
 */
function buildConditions(filters: ProductFilters): SQL {
  const parts: SQL[] = [visibleProduct];

  if (filters.categorySlugs?.length) {
    // Matches the category itself or any of its children, so "Skincare"
    // includes everything filed under Cleansers, Serums and so on.
    parts.push(sql`EXISTS (
      SELECT 1 FROM categories c
      LEFT JOIN categories parent ON parent.id = c.parent_id
      WHERE c.id = p.category_id
        AND (c.slug IN ${filters.categorySlugs} OR parent.slug IN ${filters.categorySlugs})
    )`);
  }

  if (filters.brandSlugs?.length) {
    parts.push(sql`b.slug IN ${filters.brandSlugs}`);
  }

  if (filters.concernSlugs?.length) {
    parts.push(sql`EXISTS (
      SELECT 1 FROM product_concerns pc
      JOIN concerns co ON co.id = pc.concern_id
      WHERE pc.product_id = p.id AND co.slug IN ${filters.concernSlugs}
    )`);
  }

  if (filters.collectionSlug) {
    parts.push(sql`EXISTS (
      SELECT 1 FROM product_collections pcol
      JOIN collections col ON col.id = pcol.collection_id
      WHERE pcol.product_id = p.id AND col.slug = ${filters.collectionSlug}
    )`);
  }

  if (filters.skinTypes?.length) {
    // Unnest-and-match rather than array overlap, because the selected types
    // arrive as a parameter list rather than a Postgres array. A product
    // marked 'all' matches every selection.
    parts.push(sql`(
      EXISTS (
        SELECT 1 FROM UNNEST(p.suitable_skin_types) AS st
        WHERE st::text IN ${filters.skinTypes}
      )
      OR 'all' = ANY(p.suitable_skin_types)
    )`);
  }

  if (filters.minPrice !== undefined) {
    parts.push(sql`v.min_effective >= ${filters.minPrice}`);
  }
  if (filters.maxPrice !== undefined) {
    parts.push(sql`v.min_effective <= ${filters.maxPrice}`);
  }

  if (filters.inStockOnly) {
    parts.push(sql`(v.available > 0 OR v.allow_backorder)`);
  }

  if (filters.onSaleOnly) {
    parts.push(sql`v.has_sale`);
  }

  if (filters.search?.trim()) {
    const term = filters.search.trim();
    // Postgres full-text over name, brand, subtitle and excerpt, with a
    // prefix-matching fallback so partial words still return something.
    parts.push(sql`(
      to_tsvector('english',
        coalesce(p.name,'') || ' ' || coalesce(b.name,'') || ' ' ||
        coalesce(p.subtitle,'') || ' ' || coalesce(p.excerpt,'')
      ) @@ plainto_tsquery('english', ${term})
      OR p.name ILIKE ${'%' + term + '%'}
      OR b.name ILIKE ${'%' + term + '%'}
    )`);
  }

  return sql.join(parts, sql` AND `);
}

function buildOrderBy(sort: ProductSort): SQL {
  switch (sort) {
    case 'best-selling':
      // Real units on paid orders, with the editorial pin ahead of it. A
      // product staff flagged leads the row; below that the order is what
      // customers actually bought, so a store with no sales yet degrades to
      // the flag and then to rating rather than to an empty listing.
      return sql`(v.available > 0) DESC, p.best_seller DESC, ${unitsSoldFor()} DESC, p.rating_count DESC, p.created_at DESC`;
    case 'newest':
      return sql`p.created_at DESC`;
    case 'price-asc':
      return sql`v.min_effective ASC NULLS LAST`;
    case 'price-desc':
      return sql`v.min_effective DESC NULLS LAST`;
    case 'rating':
      return sql`p.rating_average DESC, p.rating_count DESC`;
    case 'name':
      return sql`p.name ASC`;
    case 'featured':
    default:
      // In-stock first: an out-of-stock product at the top of a grid is a
      // dead end, whatever its merchandising weight.
      return sql`(v.available > 0) DESC, p.featured DESC, p.created_at DESC`;
  }
}

export async function listProducts(options: {
  filters?: ProductFilters;
  sort?: ProductSort;
  page?: number;
  pageSize?: number;
}): Promise<ProductListResult> {
  const filters = options.filters ?? {};
  const sort = options.sort ?? 'featured';
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(96, Math.max(1, options.pageSize ?? 24));
  const offset = (page - 1) * pageSize;

  const where = buildConditions(filters);

  const rows = (await db.execute(sql`
    SELECT
      p.id, p.slug, p.name, p.subtitle, p.rating_average, p.rating_count, p.new_until,
      b.name AS brand_name, b.slug AS brand_slug,
      v.min_price, v.min_effective, v.min_sale_price, v.has_sale, v.variant_count,
      v.available, v.allow_backorder, v.default_variant_id,
      img.url, img.alt, img.hover_url, img.hover_alt,
      COUNT(*) OVER()::int AS total_count
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    ${variantAggregate}
    ${mediaJoin}
    WHERE ${where}
    ORDER BY ${buildOrderBy(sort)}
    LIMIT ${pageSize} OFFSET ${offset}
  `)) as unknown as (CardRow & { total_count: number })[];

  const total = rows[0]?.total_count ?? 0;

  return {
    items: rows.map(toCard),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Facet counts for the current result set.
 *
 * Each dimension is counted with its OWN selection removed but every other
 * filter applied — standard drill-down faceting. Counting a dimension against
 * itself would leave the brand list containing only the brand already chosen,
 * making a second brand unselectable and stranding the visitor in a one-value
 * refinement they can only undo.
 *
 * `locked` filters come from the route (the category on /category/skincare)
 * rather than from the visitor, so they are reapplied to every dimension: they
 * define which page this is, not a refinement that can be widened away.
 */
export async function getProductFacets(
  filters: ProductFilters = {},
  locked: ProductFilters = {},
): Promise<ProductFacets> {
  const without = (...keys: (keyof ProductFilters)[]): SQL => {
    const next: ProductFilters = { ...filters };
    for (const key of keys) delete next[key];
    return buildConditions({ ...next, ...locked });
  };

  const brandWhere = without('brandSlugs');
  const categoryWhere = without('categorySlugs');
  const concernWhere = without('concernSlugs');
  const skinWhere = without('skinTypes');
  // The slider's bounds must describe what is reachable, not what the current
  // bounds already allow — otherwise dragging it in once collapses its range.
  const priceWhere = without('minPrice', 'maxPrice');

  const [brandRows, categoryRows, concernRows, skinTypeRows, priceRows] =
    await Promise.all([
      db.execute(sql`
        SELECT b.slug, b.name, COUNT(*)::int AS count
        FROM products p
        JOIN brands b ON b.id = p.brand_id
        ${variantAggregate}
        WHERE ${brandWhere}
        GROUP BY b.slug, b.name ORDER BY b.name
      `) as unknown as Promise<{ slug: string; name: string; count: number }[]>,

      db.execute(sql`
        SELECT c.slug, c.name, COUNT(*)::int AS count
        FROM products p
        JOIN brands b ON b.id = p.brand_id
        JOIN categories c ON c.id = p.category_id
        ${variantAggregate}
        WHERE ${categoryWhere}
        GROUP BY c.slug, c.name ORDER BY c.name
      `) as unknown as Promise<{ slug: string; name: string; count: number }[]>,

      db.execute(sql`
        SELECT co.slug, co.name, COUNT(DISTINCT p.id)::int AS count
        FROM products p
        JOIN brands b ON b.id = p.brand_id
        JOIN product_concerns pc ON pc.product_id = p.id
        JOIN concerns co ON co.id = pc.concern_id
        ${variantAggregate}
        WHERE ${concernWhere}
        GROUP BY co.slug, co.name ORDER BY co.name
      `) as unknown as Promise<{ slug: string; name: string; count: number }[]>,

      db.execute(sql`
        SELECT st AS slug, COUNT(*)::int AS count
        FROM products p
        JOIN brands b ON b.id = p.brand_id
        ${variantAggregate}
        CROSS JOIN LATERAL UNNEST(p.suitable_skin_types) AS st
        WHERE ${skinWhere}
        GROUP BY st ORDER BY st
      `) as unknown as Promise<{ slug: string; count: number }[]>,

      db.execute(sql`
        SELECT COALESCE(MIN(v.min_effective), 0)::int AS min,
               COALESCE(MAX(v.min_effective), 0)::int AS max
        FROM products p
        JOIN brands b ON b.id = p.brand_id
        ${variantAggregate}
        WHERE ${priceWhere}
      `) as unknown as Promise<{ min: number; max: number }[]>,
    ]);

  const skinTypeLabels: Record<string, string> = {
    normal: 'Balanced',
    dry: 'Dry',
    oily: 'Oily',
    combination: 'Combination',
    sensitive: 'Sensitive',
    all: 'All skin types',
  };

  return {
    brands: brandRows,
    categories: categoryRows,
    concerns: concernRows,
    skinTypes: skinTypeRows.map((r) => ({
      slug: r.slug,
      name: skinTypeLabels[r.slug] ?? r.slug,
      count: r.count,
    })),
    priceRange: {
      min: priceRows[0]?.min ?? 0,
      max: priceRows[0]?.max ?? 0,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Product detail                                                             */
/* -------------------------------------------------------------------------- */

export async function getProductBySlug(
  slug: string,
): Promise<ProductDetailView | null> {
  const rows = (await db.execute(sql`
    SELECT
      p.id, p.slug, p.name, p.subtitle, p.excerpt, p.description, p.benefits,
      p.how_to_use, p.ingredients_list, p.suitable_skin_types, p.routine_step,
      p.rating_average, p.rating_count, p.new_until, p.seo_title, p.seo_description,
      b.name AS brand_name, b.slug AS brand_slug,
      c.name AS category_name, c.slug AS category_slug,
      v.min_price, v.min_effective, v.min_sale_price, v.has_sale, v.variant_count,
      v.available, v.allow_backorder, v.default_variant_id,
      img.url, img.alt, img.hover_url, img.hover_alt
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    LEFT JOIN categories c ON c.id = p.category_id
    ${variantAggregate}
    ${mediaJoin}
    WHERE p.slug = ${slug} AND ${visibleProduct}
    LIMIT 1
  `)) as unknown as (CardRow & {
    excerpt: string | null;
    description: string | null;
    benefits: string[];
    how_to_use: string | null;
    ingredients_list: string | null;
    suitable_skin_types: string[];
    routine_step: string | null;
    category_name: string | null;
    category_slug: string | null;
    seo_title: string | null;
    seo_description: string | null;
  })[];

  const row = rows[0];
  if (!row) return null;

  const [variants, media, concerns, keyIngredients] = await Promise.all([
    db.execute(sql`
      SELECT pv.id, pv.sku, pv.name, pv.price, pv.sale_price, pv.volume_ml,
             pv.image_url, pv.is_default,
             GREATEST(COALESCE(i.on_hand,0) - COALESCE(i.reserved,0), 0)::int AS available,
             COALESCE(i.allow_backorder, false) AS allow_backorder,
             COALESCE(i.low_stock_threshold, ${LOW_STOCK_THRESHOLD})::int AS low_stock_threshold
        FROM product_variants pv
        LEFT JOIN inventory_items i ON i.variant_id = pv.id
       WHERE pv.product_id = ${row.id}
         AND pv.deleted_at IS NULL AND pv.status = 'published'
       ORDER BY pv.sort_order ASC, pv.price ASC
    `) as unknown as Promise<
      {
        id: string;
        sku: string;
        name: string;
        price: number;
        sale_price: number | null;
        volume_ml: number | null;
        image_url: string | null;
        is_default: boolean;
        available: number;
        allow_backorder: boolean;
        low_stock_threshold: number;
      }[]
    >,

    db.execute(sql`
      SELECT url, alt, width, height FROM product_media
       WHERE product_id = ${row.id} AND kind = 'image'
       ORDER BY sort_order ASC
    `) as unknown as Promise<
      {
        url: string;
        alt: string;
        width: number | null;
        height: number | null;
      }[]
    >,

    db.execute(sql`
      SELECT co.name, co.slug FROM product_concerns pc
      JOIN concerns co ON co.id = pc.concern_id
      WHERE pc.product_id = ${row.id}
      ORDER BY pc.relevance DESC, co.name
    `) as unknown as Promise<{ name: string; slug: string }[]>,

    db.execute(sql`
      SELECT i.name, i.slug, i.benefit_summary FROM product_ingredients pi
      JOIN ingredients i ON i.id = pi.ingredient_id
      WHERE pi.product_id = ${row.id} AND pi.is_key_ingredient
      ORDER BY pi.sort_order
    `) as unknown as Promise<
      { name: string; slug: string; benefit_summary: string | null }[]
    >,
  ]);

  const card = toCard(row);

  const variantViews: VariantView[] = variants.map((v) => {
    const effectivePrice = v.sale_price ?? v.price;
    const available = v.available;
    const inStock = available > 0 || v.allow_backorder;
    return {
      id: v.id,
      sku: v.sku,
      name: v.name,
      price: v.price,
      salePrice: v.sale_price,
      effectivePrice,
      onSale: v.sale_price !== null && v.sale_price < v.price,
      discountPercent:
        v.sale_price !== null ? discountPercent(v.price, v.sale_price) : 0,
      volumeMl: v.volume_ml,
      imageUrl: v.image_url,
      isDefault: v.is_default,
      available,
      inStock,
      lowStock: inStock && available > 0 && available <= v.low_stock_threshold,
    };
  });

  return {
    ...card,
    description: row.description,
    excerpt: row.excerpt,
    benefits: Array.isArray(row.benefits) ? row.benefits : [],
    howToUse: row.how_to_use,
    ingredientsList: row.ingredients_list,
    suitableSkinTypes: (row.suitable_skin_types ??
      []) as ProductDetailView['suitableSkinTypes'],
    routineStep: row.routine_step as ProductDetailView['routineStep'],
    categoryName: row.category_name,
    categorySlug: row.category_slug,
    media: media.map((m) => ({
      url: m.url,
      alt: m.alt || row.name,
      width: m.width,
      height: m.height,
    })),
    variants: variantViews,
    concerns,
    keyIngredients: keyIngredients.map((i) => ({
      name: i.name,
      slug: i.slug,
      benefitSummary: i.benefit_summary,
    })),
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
  };
}

/** Curated cross-sell for the PDP, by relation kind. */
export async function getRelatedProducts(
  productId: string,
  kind: 'routine' | 'related' | 'frequently_paired' = 'routine',
  limit = 4,
): Promise<ProductCardView[]> {
  const rows = (await db.execute(sql`
    SELECT
      p.id, p.slug, p.name, p.subtitle, p.rating_average, p.rating_count, p.new_until,
      b.name AS brand_name, b.slug AS brand_slug,
      v.min_price, v.min_effective, v.min_sale_price, v.has_sale, v.variant_count,
      v.available, v.allow_backorder, v.default_variant_id,
      img.url, img.alt, img.hover_url, img.hover_alt
    FROM product_relations pr
    JOIN products p ON p.id = pr.related_product_id
    JOIN brands b ON b.id = p.brand_id
    ${variantAggregate}
    ${mediaJoin}
    WHERE pr.product_id = ${productId} AND pr.kind = ${kind} AND ${visibleProduct}
    ORDER BY pr.sort_order
    LIMIT ${limit}
  `)) as unknown as CardRow[];
  return rows.map(toCard);
}

/** Products by explicit id list, preserving the order given. */
export async function getProductsByIds(
  ids: string[],
): Promise<ProductCardView[]> {
  if (ids.length === 0) return [];
  const rows = (await db.execute(sql`
    SELECT
      p.id, p.slug, p.name, p.subtitle, p.rating_average, p.rating_count, p.new_until,
      b.name AS brand_name, b.slug AS brand_slug,
      v.min_price, v.min_effective, v.min_sale_price, v.has_sale, v.variant_count,
      v.available, v.allow_backorder, v.default_variant_id,
      img.url, img.alt, img.hover_url, img.hover_alt
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    ${variantAggregate}
    ${mediaJoin}
    WHERE p.id IN ${ids} AND ${visibleProduct}
  `)) as unknown as CardRow[];

  const byId = new Map(rows.map((r) => [r.id, toCard(r)]));
  return ids.flatMap((id) => {
    const card = byId.get(id);
    return card ? [card] : [];
  });
}

/* -------------------------------------------------------------------------- */
/* Reviews                                                                    */
/* -------------------------------------------------------------------------- */

export type ReviewView = {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  verifiedPurchase: boolean;
  authorName: string;
  createdAt: Date;
};

/** Distribution of a product's ratings, 5 stars down to 1. */
export type RatingBreakdown = { rating: number; count: number }[];

/**
 * Published reviews for a product, newest first.
 *
 * Only moderator-approved rows are ever returned, and the author is
 * reduced to a first name plus a last initial — a review is public, the
 * reviewer's full identity is not.
 */
export async function getProductReviews(
  productId: string,
  limit = 20,
): Promise<{ reviews: ReviewView[]; breakdown: RatingBreakdown }> {
  const [rows, counts] = await Promise.all([
    db.execute(sql`
      SELECT r.id, r.rating, r.title, r.body, r.verified_purchase, r.created_at,
             u.first_name, u.last_name
        FROM reviews r
        JOIN users u ON u.id = r.user_id
       WHERE r.product_id = ${productId} AND r.status = 'approved'
       ORDER BY r.verified_purchase DESC, r.created_at DESC
       LIMIT ${limit}
    `) as unknown as Promise<
      {
        id: string;
        rating: number;
        title: string | null;
        body: string;
        verified_purchase: boolean;
        // `db.execute` bypasses drizzle's column decoding, so a timestamp
        // arrives however the driver hands it over — normalised below.
        created_at: string | Date;
        first_name: string | null;
        last_name: string | null;
      }[]
    >,

    db.execute(sql`
      SELECT rating, COUNT(*)::int AS count
        FROM reviews
       WHERE product_id = ${productId} AND status = 'approved'
       GROUP BY rating
    `) as unknown as Promise<{ rating: number; count: number }[]>,
  ]);

  const byRating = new Map(counts.map((c) => [c.rating, c.count]));

  return {
    reviews: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      verifiedPurchase: r.verified_purchase,
      authorName:
        [r.first_name, r.last_name ? `${r.last_name.charAt(0)}.` : null]
          .filter(Boolean)
          .join(' ') || 'Nordic Lux customer',
      createdAt: new Date(r.created_at),
    })),
    breakdown: [5, 4, 3, 2, 1].map((rating) => ({
      rating,
      count: byRating.get(rating) ?? 0,
    })),
  };
}
