import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import type {
  OrderStatus,
  PaymentStatus,
  PublishStatus,
  ReviewStatus,
} from '@/lib/db/schema';

/**
 * Admin read models.
 *
 * Staff see more than customers do, so these are separate from the storefront
 * queries rather than a widened version of them — that keeps an internal note or
 * a cost price from ever reaching a customer-facing payload by accident.
 *
 * Authorisation is NOT performed here. Every caller has already been through
 * `requireStaff(permission)`; these functions assume that and only fetch.
 */

export type AdminOrderRow = {
  id: string;
  reference: string;
  email: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  grandTotal: number;
  itemCount: number;
  placedAt: Date;
};

export async function listOrders(
  options: {
    status?: OrderStatus | 'open';
    limit?: number;
  } = {},
): Promise<AdminOrderRow[]> {
  const limit = options.limit ?? 50;

  const statusFilter =
    options.status === 'open'
      ? sql`AND o.status NOT IN ('delivered','cancelled','returned')`
      : options.status
        ? sql`AND o.status = ${options.status}`
        : sql``;

  const rows = (await db.execute(sql`
    SELECT o.id, o.reference, o.email, o.status, o.payment_status,
           o.grand_total, o.created_at,
           (SELECT COALESCE(SUM(oi.quantity),0)::int FROM order_items oi
             WHERE oi.order_id = o.id) AS item_count
      FROM orders o
     WHERE TRUE ${statusFilter}
     ORDER BY o.created_at DESC
     LIMIT ${limit}
  `)) as unknown as {
    id: string;
    reference: string;
    email: string;
    status: OrderStatus;
    payment_status: PaymentStatus;
    grand_total: number;
    created_at: string | Date;
    item_count: number;
  }[];

  return rows.map((r) => ({
    id: r.id,
    reference: r.reference,
    email: r.email,
    status: r.status,
    paymentStatus: r.payment_status,
    grandTotal: r.grand_total,
    itemCount: r.item_count,
    // Raw SQL bypasses Drizzle's decoders, so timestamps arrive as strings.
    placedAt: new Date(r.created_at),
  }));
}

/** Headline numbers for the dashboard, in one round trip. */
export async function getAdminOverview() {
  const rows = (await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM orders
        WHERE status NOT IN ('delivered','cancelled','returned')) AS open_orders,
      (SELECT COUNT(*)::int FROM orders
        WHERE created_at >= NOW() - INTERVAL '7 days') AS orders_7d,
      (SELECT COALESCE(SUM(grand_total),0)::bigint FROM orders
        WHERE payment_status = 'paid'
          AND created_at >= NOW() - INTERVAL '7 days') AS revenue_7d,
      (SELECT COUNT(*)::int FROM reviews WHERE status = 'pending') AS pending_reviews,
      (SELECT COUNT(*)::int FROM support_tickets WHERE status = 'open') AS open_tickets,
      (SELECT COUNT(*)::int FROM inventory_items i
         JOIN product_variants pv ON pv.id = i.variant_id
        WHERE pv.deleted_at IS NULL
          AND (i.on_hand - i.reserved) <= i.low_stock_threshold) AS low_stock
  `)) as unknown as {
    open_orders: number;
    orders_7d: number;
    revenue_7d: string | number;
    pending_reviews: number;
    open_tickets: number;
    low_stock: number;
  }[];

  const row = rows[0];
  return {
    openOrders: row?.open_orders ?? 0,
    orders7d: row?.orders_7d ?? 0,
    // bigint comes back as a string; Number is safe at these magnitudes.
    revenue7d: Number(row?.revenue_7d ?? 0),
    pendingReviews: row?.pending_reviews ?? 0,
    openTickets: row?.open_tickets ?? 0,
    lowStock: row?.low_stock ?? 0,
  };
}

export type AdminProductRow = {
  id: string;
  variantId: string;
  slug: string;
  name: string;
  sku: string;
  brandName: string;
  brandSlug: string;
  categoryName: string | null;
  categorySlug: string | null;
  status: PublishStatus;
  variantStatus: PublishStatus;
  variantCount: number;
  price: number;
  salePrice: number | null;
  onSale: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
  onHand: number;
  reserved: number;
  available: number;
  lowStock: boolean;
  /** Customers waiting to be told this variant is back. */
  waiting: number;
  updatedAt: Date;
};

export type AdminProductFilters = {
  query?: string;
  brand?: string;
  category?: string;
  status?: PublishStatus;
  stock?: 'in' | 'low' | 'out';
  promotion?: 'on';
};

function adminProductWhere(filters: AdminProductFilters) {
  const parts = [sql`p.deleted_at IS NULL`];
  if (filters.query?.trim()) {
    const q = `%${filters.query.trim()}%`;
    parts.push(
      sql`(p.name ILIKE ${q} OR pv.sku ILIKE ${q} OR b.name ILIKE ${q})`,
    );
  }
  if (filters.brand) parts.push(sql`b.slug = ${filters.brand}`);
  if (filters.category) parts.push(sql`c.slug = ${filters.category}`);
  if (filters.status) parts.push(sql`p.status = ${filters.status}`);
  if (filters.promotion === 'on') parts.push(sql`pv.sale_price IS NOT NULL`);
  if (filters.stock === 'in') {
    parts.push(
      sql`GREATEST(COALESCE(i.on_hand,0) - COALESCE(i.reserved,0), 0) > 0`,
    );
  }
  if (filters.stock === 'low') {
    parts.push(
      sql`GREATEST(COALESCE(i.on_hand,0) - COALESCE(i.reserved,0), 0) > 0`,
    );
    parts.push(
      sql`GREATEST(COALESCE(i.on_hand,0) - COALESCE(i.reserved,0), 0) <= COALESCE(i.low_stock_threshold, 5)`,
    );
  }
  if (filters.stock === 'out') {
    parts.push(
      sql`GREATEST(COALESCE(i.on_hand,0) - COALESCE(i.reserved,0), 0) = 0`,
    );
  }
  return sql.join(parts, sql` AND `);
}

export async function listProductsForAdmin(
  filters: AdminProductFilters = {},
): Promise<AdminProductRow[]> {
  const where = adminProductWhere(filters);
  const rows = (await db.execute(sql`
    SELECT p.id, p.slug, p.name, p.status, p.updated_at,
           b.name AS brand_name, b.slug AS brand_slug,
           c.name AS category_name, c.slug AS category_slug,
           pv.id AS variant_id, pv.sku, pv.status AS variant_status,
           pv.price, pv.sale_price,
           COALESCE(i.on_hand, 0)::int AS on_hand,
           COALESCE(i.reserved, 0)::int AS reserved,
           COALESCE(i.low_stock_threshold, 5)::int AS low_stock_threshold,
           GREATEST(COALESCE(i.on_hand,0) - COALESCE(i.reserved,0), 0)::int AS available,
           img.url AS image_url, img.alt AS image_alt,
           COUNT(*) OVER (PARTITION BY p.id)::int AS variant_count,
           -- People waiting on this variant returning. Staff restock what is
           -- asked for first, so the number belongs next to the stock figure.
           COALESCE((
             SELECT COUNT(*)::int
               FROM back_in_stock_subscriptions bis
              WHERE bis.variant_id = pv.id
                AND bis.notified_at IS NULL
                AND bis.unsubscribed_at IS NULL
           ), 0) AS waiting
      FROM products p
      JOIN brands b ON b.id = p.brand_id
      LEFT JOIN categories c ON c.id = p.category_id
      JOIN product_variants pv
        ON pv.product_id = p.id AND pv.deleted_at IS NULL
      LEFT JOIN inventory_items i ON i.variant_id = pv.id
      LEFT JOIN LATERAL (
        SELECT url, alt
          FROM product_media pm
         WHERE pm.product_id = p.id AND pm.kind = 'image'
         ORDER BY pm.sort_order
         LIMIT 1
      ) img ON TRUE
     WHERE ${where}
     ORDER BY p.name, pv.sort_order, pv.price
     LIMIT 500
  `)) as unknown as {
    id: string;
    variant_id: string;
    slug: string;
    name: string;
    status: PublishStatus;
    updated_at: string | Date;
    brand_name: string;
    brand_slug: string;
    category_name: string | null;
    category_slug: string | null;
    sku: string;
    variant_status: PublishStatus;
    variant_count: number;
    price: number;
    sale_price: number | null;
    image_url: string | null;
    image_alt: string | null;
    on_hand: number;
    reserved: number;
    low_stock_threshold: number;
    available: number;
    waiting: number;
  }[];

  return rows.map((r) => ({
    id: r.id,
    variantId: r.variant_id,
    slug: r.slug,
    name: r.name,
    sku: r.sku,
    brandName: r.brand_name,
    brandSlug: r.brand_slug,
    categoryName: r.category_name,
    categorySlug: r.category_slug,
    status: r.status,
    variantStatus: r.variant_status,
    variantCount: r.variant_count,
    price: r.price,
    salePrice: r.sale_price,
    onSale: r.sale_price !== null && r.sale_price < r.price,
    imageUrl: r.image_url,
    imageAlt: r.image_alt,
    onHand: r.on_hand,
    reserved: r.reserved,
    available: r.available,
    lowStock: r.available > 0 && r.available <= r.low_stock_threshold,
    waiting: r.waiting,
    updatedAt: new Date(r.updated_at),
  }));
}

export async function getAdminProductFacets() {
  const [brandRows, categoryRows] = await Promise.all([
    db.execute(sql`
      SELECT b.slug, b.name, COUNT(p.id)::int AS count
        FROM brands b
        JOIN products p ON p.brand_id = b.id AND p.deleted_at IS NULL
       GROUP BY b.slug, b.name
       ORDER BY b.name
    `) as unknown as Promise<{ slug: string; name: string; count: number }[]>,
    db.execute(sql`
      SELECT c.slug, c.name, COUNT(p.id)::int AS count
        FROM categories c
        JOIN products p ON p.category_id = c.id AND p.deleted_at IS NULL
       GROUP BY c.slug, c.name
       ORDER BY c.name
    `) as unknown as Promise<{ slug: string; name: string; count: number }[]>,
  ]);
  return { brands: brandRows, categories: categoryRows };
}

export async function getRecentInventoryMovements(limit = 20) {
  const rows = (await db.execute(sql`
    SELECT im.id, im.variant_id, im.reason, im.on_hand_delta, im.reserved_delta,
           im.on_hand_after, im.reserved_after, im.note, im.created_at,
           pv.sku, p.name AS product_name
      FROM inventory_movements im
      JOIN product_variants pv ON pv.id = im.variant_id
      JOIN products p ON p.id = pv.product_id
     ORDER BY im.created_at DESC
     LIMIT ${limit}
  `)) as unknown as {
    id: string;
    variant_id: string;
    reason: string;
    on_hand_delta: number;
    reserved_delta: number;
    on_hand_after: number;
    reserved_after: number;
    note: string | null;
    created_at: string | Date;
    sku: string;
    product_name: string;
  }[];

  return rows.map((r) => ({ ...r, createdAt: new Date(r.created_at) }));
}

export async function getAdminProductReferences() {
  const [brandRows, categoryRows] = await Promise.all([
    db.execute(sql`
      SELECT id, name
        FROM brands
       ORDER BY name
    `) as unknown as Promise<{ id: string; name: string }[]>,
    db.execute(sql`
      SELECT id, name
        FROM categories
       ORDER BY name
    `) as unknown as Promise<{ id: string; name: string }[]>,
  ]);
  return { brands: brandRows, categories: categoryRows };
}

export type AdminReviewRow = {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  status: ReviewStatus;
  verifiedPurchase: boolean;
  productName: string;
  productSlug: string;
  authorEmail: string;
  createdAt: Date;
};

export async function listReviews(
  status: ReviewStatus = 'pending',
): Promise<AdminReviewRow[]> {
  const rows = (await db.execute(sql`
    SELECT r.id, r.rating, r.title, r.body, r.status, r.verified_purchase,
           r.created_at, p.name AS product_name, p.slug AS product_slug,
           u.email AS author_email
      FROM reviews r
      JOIN products p ON p.id = r.product_id
      JOIN users u ON u.id = r.user_id
     WHERE r.status = ${status}
     ORDER BY r.created_at DESC
     LIMIT 100
  `)) as unknown as {
    id: string;
    rating: number;
    title: string | null;
    body: string;
    status: ReviewStatus;
    verified_purchase: boolean;
    created_at: string | Date;
    product_name: string;
    product_slug: string;
    author_email: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    title: r.title,
    body: r.body,
    status: r.status,
    verifiedPurchase: r.verified_purchase,
    productName: r.product_name,
    productSlug: r.product_slug,
    authorEmail: r.author_email,
    createdAt: new Date(r.created_at),
  }));
}

export async function listSupportTickets() {
  const rows = (await db.execute(sql`
    SELECT id, reference, name, email, subject, status, created_at
      FROM support_tickets
     ORDER BY (status = 'open') DESC, created_at DESC
     LIMIT 100
  `)) as unknown as {
    id: string;
    reference: string;
    name: string;
    email: string;
    subject: string;
    status: string;
    created_at: string | Date;
  }[];

  return rows.map((r) => ({ ...r, createdAt: new Date(r.created_at) }));
}
