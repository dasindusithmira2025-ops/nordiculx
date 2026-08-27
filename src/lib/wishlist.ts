import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { wishlistItems } from '@/lib/db/schema';

/**
 * Wishlist.
 *
 * Requires an account. A guest "wishlist" that lives in localStorage would be
 * lost on any device change and cannot drive back-in-stock notifications, so
 * the storefront invites guests to sign in instead of pretending to save
 * something it cannot keep.
 */

export type WishlistEntry = {
  id: string;
  productId: string;
  slug: string;
  name: string;
  brandName: string;
  imageUrl: string | null;
  price: number;
  salePrice: number | null;
  inStock: boolean;
  defaultVariantId: string | null;
};

export async function getWishlistCount(userId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(wishlistItems)
    .where(eq(wishlistItems.userId, userId));
  return rows[0]?.count ?? 0;
}

export async function getWishlist(userId: string): Promise<WishlistEntry[]> {
  const rows = (await db.execute(sql`
    SELECT
      w.id, p.id AS product_id, p.slug, p.name, b.name AS brand_name,
      (SELECT m.url FROM product_media m
        WHERE m.product_id = p.id ORDER BY m.sort_order LIMIT 1) AS image_url,
      v.min_price::int AS price,
      v.min_sale_price::int AS sale_price,
      (v.available > 0 OR v.allow_backorder) AS in_stock,
      v.default_variant_id
    FROM wishlist_items w
    JOIN products p ON p.id = w.product_id
    JOIN brands b ON b.id = p.brand_id
    LEFT JOIN LATERAL (
      SELECT MIN(pv.price) AS min_price,
             MIN(pv.sale_price) AS min_sale_price,
             COALESCE(SUM(GREATEST(COALESCE(i.on_hand,0) - COALESCE(i.reserved,0),0)),0) AS available,
             BOOL_OR(COALESCE(i.allow_backorder,false)) AS allow_backorder,
             (ARRAY_AGG(pv.id ORDER BY pv.is_default DESC, pv.sort_order))[1] AS default_variant_id
        FROM product_variants pv
        LEFT JOIN inventory_items i ON i.variant_id = pv.id
       WHERE pv.product_id = p.id AND pv.status='published' AND pv.deleted_at IS NULL
    ) v ON TRUE
    WHERE w.user_id = ${userId}
      AND p.status = 'published' AND p.deleted_at IS NULL
    ORDER BY w.created_at DESC
  `)) as unknown as {
    id: string;
    product_id: string;
    slug: string;
    name: string;
    brand_name: string;
    image_url: string | null;
    price: number | null;
    sale_price: number | null;
    in_stock: boolean;
    default_variant_id: string | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    slug: r.slug,
    name: r.name,
    brandName: r.brand_name,
    imageUrl: r.image_url,
    price: r.price ?? 0,
    salePrice: r.sale_price,
    inStock: r.in_stock,
    defaultVariantId: r.default_variant_id,
  }));
}

/** The product ids a customer has saved, for marking hearts on a grid. */
export async function getWishlistProductIds(
  userId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ productId: wishlistItems.productId })
    .from(wishlistItems)
    .where(eq(wishlistItems.userId, userId));
  return new Set(rows.map((r) => r.productId));
}

export async function isWishlisted(userId: string, productId: string) {
  const rows = await db
    .select({ id: wishlistItems.id })
    .from(wishlistItems)
    .where(
      and(
        eq(wishlistItems.userId, userId),
        eq(wishlistItems.productId, productId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
