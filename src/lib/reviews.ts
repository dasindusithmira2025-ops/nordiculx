import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { orderItems, orders, products, reviews } from '@/lib/db/schema';
import type { ReviewStatus } from '@/lib/db/schema';

/**
 * Review eligibility and the published rating aggregate.
 *
 * Two rules the storefront copy already promises and the schema was built for:
 * a review requires a delivered order containing the product, and the verified
 * badge is derived from that order line — never from anything the client sends.
 */

export type ReviewEligibility =
  | { canReview: false; reason: 'signed_out' | 'not_delivered' }
  | {
      canReview: true;
      /** The delivered line this review is attached to. */
      verifiedOrderItemId: string;
      /** Their existing review, if they have already written one. */
      existing: {
        id: string;
        rating: number;
        title: string | null;
        body: string;
        status: ReviewStatus;
      } | null;
    };

/**
 * A delivered order containing this product, for this customer.
 *
 * `delivered` rather than `paid`: somebody can review what arrived, not what
 * they have merely been charged for.
 */
export async function reviewEligibility(
  userId: string | null,
  productId: string,
): Promise<ReviewEligibility> {
  if (!userId) return { canReview: false, reason: 'signed_out' };

  const delivered = await db
    .select({ orderItemId: orderItems.id })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orderItems.productId, productId),
        eq(orders.userId, userId),
        eq(orders.status, 'delivered'),
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(1);

  if (!delivered[0]) return { canReview: false, reason: 'not_delivered' };

  const existing = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      title: reviews.title,
      body: reviews.body,
      status: reviews.status,
    })
    .from(reviews)
    .where(and(eq(reviews.productId, productId), eq(reviews.userId, userId)))
    .limit(1);

  return {
    canReview: true,
    verifiedOrderItemId: delivered[0].orderItemId,
    existing: existing[0] ?? null,
  };
}

/**
 * Recomputes `products.rating_average` / `rating_count` from published reviews.
 *
 * The denormalised columns are what the listing sorts and the PDP's JSON-LD
 * advertises, and nothing kept them in step — a moderator could publish a
 * review and the product would still read "No reviews yet". Both write paths
 * (submission and moderation) end here.
 */
export async function refreshProductRating(
  productId: string,
  executor: Pick<typeof db, 'execute'> = db,
): Promise<void> {
  await executor.execute(sql`
    UPDATE ${products} p SET
      rating_average = COALESCE(agg.average, 0),
      rating_count   = COALESCE(agg.total, 0),
      updated_at     = NOW()
    FROM (
      SELECT
        AVG(r.rating)::real AS average,
        COUNT(*)::int       AS total
      FROM ${reviews} r
      WHERE r.product_id = ${productId} AND r.status = 'approved'
    ) agg
    WHERE p.id = ${productId}
  `);
}
