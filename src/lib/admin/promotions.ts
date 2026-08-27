import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  brands,
  categories,
  collections,
  orders,
  products,
  promotions,
} from '@/lib/db/schema';
import type { PromotionScope, PromotionType } from '@/lib/db/schema';

/**
 * Promotion read models for the admin.
 *
 * Usage is read from `orders`, not only from `promotions.usage_count`: the
 * counter is what the checkout enforces limits against, while the orders are
 * what actually happened. Showing both makes a drift between them visible
 * rather than silent.
 *
 * Authorisation happens in the caller — see `src/lib/admin/queries.ts`.
 */

export type PromotionRow = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  type: PromotionType;
  scope: PromotionScope;
  value: number;
  minimumSubtotal: number;
  maximumDiscount: number | null;
  targetIds: string[];
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  usageLimitPerCustomer: number | null;
  usageCount: number;
  enabled: boolean;
  /** Orders that recorded this promotion, and what it actually cost. */
  ordersUsed: number;
  discountGiven: number;
};

/** Live / scheduled / expired / off, derived the same way checkout derives it. */
export type PromotionState =
  'live' | 'scheduled' | 'expired' | 'exhausted' | 'off';

export function promotionState(
  promotion: Pick<
    PromotionRow,
    'enabled' | 'startsAt' | 'endsAt' | 'usageLimit' | 'usageCount'
  >,
  now = new Date(),
): PromotionState {
  if (!promotion.enabled) return 'off';
  if (promotion.endsAt && promotion.endsAt <= now) return 'expired';
  if (promotion.startsAt && promotion.startsAt > now) return 'scheduled';
  if (
    promotion.usageLimit !== null &&
    promotion.usageCount >= promotion.usageLimit
  ) {
    return 'exhausted';
  }
  return 'live';
}

const usage = db
  .select({
    promotionId: orders.promotionId,
    ordersUsed: sql<number>`COUNT(*)::int`.as('orders_used'),
    discountGiven:
      sql<number>`COALESCE(SUM(${orders.discountTotal}), 0)::int`.as(
        'discount_given',
      ),
  })
  .from(orders)
  .where(
    sql`${orders.promotionId} IS NOT NULL AND ${orders.status} <> 'cancelled'`,
  )
  .groupBy(orders.promotionId)
  .as('usage');

export async function listPromotions(): Promise<PromotionRow[]> {
  const rows = await db
    .select({
      id: promotions.id,
      code: promotions.code,
      name: promotions.name,
      description: promotions.description,
      type: promotions.type,
      scope: promotions.scope,
      value: promotions.value,
      minimumSubtotal: promotions.minimumSubtotal,
      maximumDiscount: promotions.maximumDiscount,
      targetIds: promotions.targetIds,
      startsAt: promotions.startsAt,
      endsAt: promotions.endsAt,
      usageLimit: promotions.usageLimit,
      usageLimitPerCustomer: promotions.usageLimitPerCustomer,
      usageCount: promotions.usageCount,
      enabled: promotions.enabled,
      ordersUsed: sql<number>`COALESCE(${usage.ordersUsed}, 0)`,
      discountGiven: sql<number>`COALESCE(${usage.discountGiven}, 0)`,
    })
    .from(promotions)
    .leftJoin(usage, eq(usage.promotionId, promotions.id))
    .orderBy(desc(promotions.enabled), desc(promotions.createdAt));

  return rows;
}

export async function getPromotion(id: string): Promise<PromotionRow | null> {
  const rows = await listPromotions();
  return rows.find((row) => row.id === id) ?? null;
}

/** The entities a scoped promotion can target, for the picker. */
export type PromotionTargets = {
  product: { id: string; label: string }[];
  brand: { id: string; label: string }[];
  category: { id: string; label: string }[];
  collection: { id: string; label: string }[];
};

export async function getPromotionTargets(): Promise<PromotionTargets> {
  const [productRows, brandRows, categoryRows, collectionRows] =
    await Promise.all([
      db
        .select({ id: products.id, label: products.name })
        .from(products)
        .where(
          and(
            eq(products.status, 'published'),
            sql`${products.deletedAt} IS NULL`,
          ),
        )
        .orderBy(products.name),
      db
        .select({ id: brands.id, label: brands.name })
        .from(brands)
        .orderBy(brands.name),
      db
        .select({ id: categories.id, label: categories.name })
        .from(categories)
        .orderBy(categories.name),
      db
        .select({ id: collections.id, label: collections.name })
        .from(collections)
        .orderBy(collections.name),
    ]);

  return {
    product: productRows,
    brand: brandRows,
    category: categoryRows,
    collection: collectionRows,
  };
}

/** Recent orders that used a promotion, for the detail screen. */
export async function listPromotionOrders(promotionId: string, limit = 20) {
  return db
    .select({
      reference: orders.reference,
      email: orders.email,
      discountTotal: orders.discountTotal,
      grandTotal: orders.grandTotal,
      status: orders.status,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.promotionId, promotionId))
    .orderBy(desc(orders.createdAt))
    .limit(limit);
}
