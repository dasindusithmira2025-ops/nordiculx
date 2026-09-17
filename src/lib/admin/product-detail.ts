import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { PAID_SALE } from '@/lib/catalogue/sales';
import type {
  MediaKind,
  PublishStatus,
  RoutineStep,
  SkinType,
} from '@/lib/db/schema';

/**
 * The full product, as the admin editor needs it.
 *
 * Separate from `listProductsForAdmin`, which is a row per VARIANT for the
 * operations table. This is a row per PRODUCT with everything hanging off it,
 * because the editor's job is the opposite one: not "show me every price at a
 * glance" but "show me one product completely".
 *
 * Archived and soft-deleted products are included deliberately — an editor
 * that cannot open the thing you archived cannot un-archive it either.
 *
 * Authorisation is NOT performed here; every caller has already been through
 * `requireStaff`.
 */

export type EditorVariant = {
  id: string;
  sku: string;
  name: string;
  optionLabel: string | null;
  price: number;
  salePrice: number | null;
  compareAtPrice: number | null;
  weightGrams: number | null;
  volumeMl: number | null;
  barcode: string | null;
  imageUrl: string | null;
  status: PublishStatus;
  isDefault: boolean;
  sortOrder: number;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  allowBackorder: boolean;
};

export type EditorMedia = {
  id: string;
  kind: MediaKind;
  url: string;
  posterUrl: string | null;
  alt: string;
  sortOrder: number;
};

export type EditorProduct = {
  id: string;
  name: string;
  slug: string;
  brandId: string;
  categoryId: string | null;
  subtitle: string | null;
  excerpt: string | null;
  description: string | null;
  benefits: string[];
  howToUse: string | null;
  ingredientsList: string | null;
  suitableSkinTypes: SkinType[];
  routineStep: RoutineStep | null;
  status: PublishStatus;
  featured: boolean;
  bestSeller: boolean;
  newUntil: Date | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ratingAverage: number;
  ratingCount: number;
  deletedAt: Date | null;
  updatedAt: Date;
  /** Units on paid, un-cancelled orders. Shown as fact, never as a target. */
  unitsSold: number;
  collectionIds: string[];
  concernIds: string[];
  variants: EditorVariant[];
  media: EditorMedia[];
};

export async function getProductForEdit(
  id: string,
): Promise<EditorProduct | null> {
  const rows = (await db.execute(sql`
    SELECT p.*,
           ${sql`COALESCE((
             SELECT SUM(oi.quantity)::int
               FROM order_items oi
               JOIN orders o ON o.id = oi.order_id
              WHERE oi.product_id = p.id AND ${PAID_SALE}
           ), 0)`} AS units_sold
      FROM products p
     WHERE p.id = ${id}
     LIMIT 1
  `)) as unknown as Record<string, unknown>[];

  const row = rows[0];
  if (!row) return null;

  const [variants, media, collections, concerns] = await Promise.all([
    db.execute(sql`
      SELECT pv.id, pv.sku, pv.name, pv.option_label, pv.price, pv.sale_price,
             pv.compare_at_price, pv.weight_grams, pv.volume_ml, pv.barcode,
             pv.image_url, pv.status, pv.is_default, pv.sort_order,
             COALESCE(i.on_hand, 0)::int AS on_hand,
             COALESCE(i.reserved, 0)::int AS reserved,
             COALESCE(i.low_stock_threshold, 5)::int AS low_stock_threshold,
             COALESCE(i.allow_backorder, FALSE) AS allow_backorder
        FROM product_variants pv
        LEFT JOIN inventory_items i ON i.variant_id = pv.id
       WHERE pv.product_id = ${id} AND pv.deleted_at IS NULL
       ORDER BY pv.sort_order ASC, pv.price ASC
    `) as unknown as Promise<Record<string, never>[]>,

    db.execute(sql`
      SELECT id, kind, url, poster_url, alt, sort_order
        FROM product_media
       WHERE product_id = ${id}
       ORDER BY sort_order ASC
    `) as unknown as Promise<Record<string, never>[]>,

    db.execute(sql`
      SELECT collection_id FROM product_collections WHERE product_id = ${id}
    `) as unknown as Promise<{ collection_id: string }[]>,

    db.execute(sql`
      SELECT concern_id FROM product_concerns WHERE product_id = ${id}
    `) as unknown as Promise<{ concern_id: string }[]>,
  ]);

  const r = row as {
    id: string;
    name: string;
    slug: string;
    brand_id: string;
    category_id: string | null;
    subtitle: string | null;
    excerpt: string | null;
    description: string | null;
    benefits: string[] | null;
    how_to_use: string | null;
    ingredients_list: string | null;
    suitable_skin_types: SkinType[] | null;
    routine_step: RoutineStep | null;
    status: PublishStatus;
    featured: boolean;
    best_seller: boolean;
    new_until: string | Date | null;
    seo_title: string | null;
    seo_description: string | null;
    rating_average: number;
    rating_count: number;
    deleted_at: string | Date | null;
    updated_at: string | Date;
    units_sold: number;
  };

  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    brandId: r.brand_id,
    categoryId: r.category_id,
    subtitle: r.subtitle,
    excerpt: r.excerpt,
    description: r.description,
    benefits: Array.isArray(r.benefits) ? r.benefits : [],
    howToUse: r.how_to_use,
    ingredientsList: r.ingredients_list,
    suitableSkinTypes: Array.isArray(r.suitable_skin_types)
      ? r.suitable_skin_types
      : [],
    routineStep: r.routine_step,
    status: r.status,
    featured: r.featured,
    bestSeller: r.best_seller,
    newUntil: r.new_until ? new Date(r.new_until) : null,
    seoTitle: r.seo_title,
    seoDescription: r.seo_description,
    ratingAverage: r.rating_average,
    ratingCount: r.rating_count,
    deletedAt: r.deleted_at ? new Date(r.deleted_at) : null,
    // Raw SQL bypasses drizzle's decoders, so timestamps arrive as strings.
    updatedAt: new Date(r.updated_at),
    unitsSold: r.units_sold,
    collectionIds: collections.map((c) => c.collection_id),
    concernIds: concerns.map((c) => c.concern_id),
    variants: (variants as unknown as Record<string, never>[]).map((v) => {
      const row = v as unknown as {
        id: string;
        sku: string;
        name: string;
        option_label: string | null;
        price: number;
        sale_price: number | null;
        compare_at_price: number | null;
        weight_grams: number | null;
        volume_ml: number | null;
        barcode: string | null;
        image_url: string | null;
        status: PublishStatus;
        is_default: boolean;
        sort_order: number;
        on_hand: number;
        reserved: number;
        low_stock_threshold: number;
        allow_backorder: boolean;
      };
      return {
        id: row.id,
        sku: row.sku,
        name: row.name,
        optionLabel: row.option_label,
        price: row.price,
        salePrice: row.sale_price,
        compareAtPrice: row.compare_at_price,
        weightGrams: row.weight_grams,
        volumeMl: row.volume_ml,
        barcode: row.barcode,
        imageUrl: row.image_url,
        status: row.status,
        isDefault: row.is_default,
        sortOrder: row.sort_order,
        onHand: row.on_hand,
        reserved: row.reserved,
        available: Math.max(row.on_hand - row.reserved, 0),
        lowStockThreshold: row.low_stock_threshold,
        allowBackorder: row.allow_backorder,
      };
    }),
    media: (media as unknown as Record<string, never>[]).map((m) => {
      const row = m as unknown as {
        id: string;
        kind: MediaKind;
        url: string;
        poster_url: string | null;
        alt: string;
        sort_order: number;
      };
      return {
        id: row.id,
        kind: row.kind,
        url: row.url,
        posterUrl: row.poster_url,
        alt: row.alt,
        sortOrder: row.sort_order,
      };
    }),
  };
}

/** Everything the editor's select boxes need, in one round trip. */
export async function getProductEditorReferences() {
  const [brands, categories, collections, concerns] = await Promise.all([
    db.execute(sql`
      SELECT id, name FROM brands ORDER BY name
    `) as unknown as Promise<{ id: string; name: string }[]>,
    db.execute(sql`
      SELECT c.id, c.name, parent.name AS parent_name
        FROM categories c
        LEFT JOIN categories parent ON parent.id = c.parent_id
       ORDER BY COALESCE(parent.name, c.name), parent.name NULLS FIRST, c.name
    `) as unknown as Promise<
      { id: string; name: string; parent_name: string | null }[]
    >,
    db.execute(sql`
      SELECT id, name FROM collections ORDER BY name
    `) as unknown as Promise<{ id: string; name: string }[]>,
    db.execute(sql`
      SELECT id, name FROM concerns ORDER BY name
    `) as unknown as Promise<{ id: string; name: string }[]>,
  ]);

  return {
    brands,
    // The parent is carried into the label rather than nesting <optgroup>,
    // because a subcategory and its parent are the SAME field here — a product
    // sits at exactly one node of the tree.
    categories: categories.map((c) => ({
      id: c.id,
      name: c.parent_name ? `${c.parent_name} → ${c.name}` : c.name,
    })),
    collections,
    concerns,
  };
}
