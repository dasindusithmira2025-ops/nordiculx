import 'server-only';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  addresses,
  type OrderStatus,
  type PaymentStatus,
} from '@/lib/db/schema';

/**
 * Account data access.
 *
 * Every function here takes the user id from the CALLER's session, never from a
 * URL or form field, and every query filters on it. That is what stops the
 * classic IDOR: `/account/orders/NL-XXXX-XXXX` must 404 for somebody else's
 * order rather than render it, and the reference alone is never authorisation.
 */

// The order-detail loader and its type live in src/lib/orders, which the
// confirmation page, guest tracking and email also use. Re-exported here so
// account callers keep a single import.
export {
  getOrderByReference,
  getOrderForGuest,
  getOrderForUser,
} from '@/lib/orders';
export type { OrderDetail } from '@/lib/orders';

export type OrderSummary = {
  id: string;
  reference: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  grandTotal: number;
  currency: string;
  placedAt: Date;
  itemCount: number;
  /** First few images, for a visual summary in the list. */
  thumbnails: (string | null)[];
};

/**
 * A customer's orders, newest first.
 *
 * Item count and thumbnails come from correlated subqueries rather than a
 * second round trip per order — an order list is the page most likely to become
 * an N+1.
 */
export async function getOrdersForUser(
  userId: string,
): Promise<OrderSummary[]> {
  const rows = (await db.execute(sql`
    SELECT
      o.id, o.reference, o.status, o.payment_status, o.grand_total, o.currency,
      o.created_at,
      (SELECT COALESCE(SUM(oi.quantity), 0)::int FROM order_items oi
        WHERE oi.order_id = o.id) AS item_count,
      (SELECT ARRAY_AGG(t.image_url) FROM (
         SELECT oi.image_url FROM order_items oi
          WHERE oi.order_id = o.id
          ORDER BY oi.created_at
          LIMIT 4
       ) t) AS thumbnails
    FROM orders o
    WHERE o.user_id = ${userId}
    ORDER BY o.created_at DESC
  `)) as unknown as {
    id: string;
    reference: string;
    status: OrderStatus;
    payment_status: PaymentStatus;
    grand_total: number;
    currency: string;
    // A raw `db.execute` does not run Drizzle's column decoders, so a timestamp
    // arrives as a string here rather than a Date. Passing that straight to
    // Intl throws "Invalid time value", so it is coerced below — the same thing
    // src/lib/catalogue/products.ts does for `new_until` and `created_at`.
    created_at: string | Date;
    item_count: number;
    thumbnails: (string | null)[] | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    reference: r.reference,
    status: r.status,
    paymentStatus: r.payment_status,
    grandTotal: r.grand_total,
    currency: r.currency,
    placedAt: new Date(r.created_at),
    itemCount: r.item_count,
    thumbnails: r.thumbnails ?? [],
  }));
}

/** Saved addresses, default first. Soft-deleted rows are excluded. */
export async function getAddressesForUser(userId: string) {
  return db
    .select()
    .from(addresses)
    .where(and(eq(addresses.userId, userId), isNull(addresses.deletedAt)))
    .orderBy(desc(addresses.isDefault), desc(addresses.createdAt));
}

/** Counts for the dashboard, in one round trip. */
export async function getAccountSummary(userId: string) {
  const rows = (await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM orders WHERE user_id = ${userId}) AS order_count,
      (SELECT COUNT(*)::int FROM orders
        WHERE user_id = ${userId}
          AND status NOT IN ('delivered','cancelled','returned')) AS open_order_count,
      (SELECT COUNT(*)::int FROM wishlist_items WHERE user_id = ${userId}) AS wishlist_count,
      (SELECT COUNT(*)::int FROM addresses
        WHERE user_id = ${userId} AND deleted_at IS NULL) AS address_count
  `)) as unknown as {
    order_count: number;
    open_order_count: number;
    wishlist_count: number;
    address_count: number;
  }[];

  const row = rows[0];
  return {
    orderCount: row?.order_count ?? 0,
    openOrderCount: row?.open_order_count ?? 0,
    wishlistCount: row?.wishlist_count ?? 0,
    addressCount: row?.address_count ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Presentation helpers                                                       */
/* -------------------------------------------------------------------------- */

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Awaiting payment',
  confirmed: 'Confirmed',
  preparing: 'Being prepared',
  packed: 'Packed',
  dispatched: 'Dispatched',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

/** Which statuses still represent an order in motion. */
export function isOpenOrder(status: OrderStatus): boolean {
  return !['delivered', 'cancelled', 'returned'].includes(status);
}
