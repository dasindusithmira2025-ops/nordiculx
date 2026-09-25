import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { orders, trackingEvents } from '@/lib/db/schema';
import type { OrderStatus, PaymentStatus } from '@/lib/db/schema';
import { hashToken, tokensMatch } from '@/lib/tokens';

/**
 * Order reads, shared by the account area, the confirmation page, guest
 * tracking and transactional email.
 *
 * There is deliberately ONE loader. Each caller decides who is allowed to see an
 * order, then loads it the same way — that is what keeps the confirmation page,
 * the order history and the email from disagreeing about what an order contains.
 *
 * `loadOrderDetail` performs no authorisation of its own. Every exported
 * accessor below applies one, and nothing else should call the loader directly.
 */

export type OrderSummary = {
  id: string;
  reference: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  grandTotal: number;
  currency: string;
  placedAt: Date;
  itemCount: number;
  thumbnails: (string | null)[];
};

export type OrderDetail = OrderSummary & {
  email: string;
  phone: string | null;
  whatsappOptIn: boolean;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  promotionCode: string | null;
  shippingAddress: typeof orders.$inferSelect.shippingAddress;
  billingAddress: typeof orders.$inferSelect.billingAddress;
  items: {
    id: string;
    productName: string;
    variantName: string;
    brandName: string;
    sku: string;
    imageUrl: string | null;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    productSlug: string | null;
  }[];
  tracking: {
    id: string;
    status: OrderStatus;
    message: string | null;
    location: string | null;
    occurredAt: Date;
  }[];
};

type OrderRow = typeof orders.$inferSelect;

async function loadOrderDetail(order: OrderRow): Promise<OrderDetail> {
  const [items, tracking] = await Promise.all([
    db.execute(sql`
      SELECT oi.id, oi.product_name, oi.variant_name, oi.brand_name, oi.sku,
             oi.image_url, oi.unit_price, oi.quantity, oi.line_total,
             p.slug AS product_slug
        FROM order_items oi
        LEFT JOIN products p
          ON p.id = oi.product_id
         AND p.status = 'published' AND p.deleted_at IS NULL
       WHERE oi.order_id = ${order.id}
       ORDER BY oi.created_at
    `) as unknown as Promise<
      {
        id: string;
        product_name: string;
        variant_name: string;
        brand_name: string;
        sku: string;
        image_url: string | null;
        unit_price: number;
        quantity: number;
        line_total: number;
        product_slug: string | null;
      }[]
    >,
    db
      .select({
        id: trackingEvents.id,
        status: trackingEvents.status,
        message: trackingEvents.message,
        location: trackingEvents.location,
        occurredAt: trackingEvents.occurredAt,
      })
      .from(trackingEvents)
      .where(eq(trackingEvents.orderId, order.id))
      .orderBy(desc(trackingEvents.occurredAt)),
  ]);

  return {
    id: order.id,
    reference: order.reference,
    status: order.status,
    paymentStatus: order.paymentStatus,
    grandTotal: order.grandTotal,
    currency: order.currency,
    // `placedAt` is only stamped once payment lands, so an order awaiting
    // payment falls back to when it was created rather than showing nothing.
    placedAt: order.placedAt ?? order.createdAt,
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    thumbnails: items.slice(0, 4).map((i) => i.image_url),
    email: order.email,
    phone: order.phone,
    whatsappOptIn: order.whatsappOptIn,
    subtotal: order.subtotal,
    discountTotal: order.discountTotal,
    shippingTotal: order.shippingTotal,
    taxTotal: order.taxTotal,
    promotionCode: order.promotionCode,
    shippingAddress: order.shippingAddress,
    billingAddress: order.billingAddress,
    items: items.map((i) => ({
      id: i.id,
      productName: i.product_name,
      variantName: i.variant_name,
      brandName: i.brand_name,
      sku: i.sku,
      imageUrl: i.image_url,
      unitPrice: i.unit_price,
      quantity: i.quantity,
      lineTotal: i.line_total,
      productSlug: i.product_slug,
    })),
    tracking,
  };
}

async function findByReference(reference: string): Promise<OrderRow | null> {
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.reference, reference))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Unauthenticated read, for transactional email and staff tooling.
 *
 * NEVER call this from a customer-facing route without an ownership check of
 * your own — it will happily return anybody's order.
 */
export async function getOrderByReference(
  reference: string,
): Promise<OrderDetail | null> {
  const order = await findByReference(reference);
  return order ? loadOrderDetail(order) : null;
}

/** One order, scoped to its owner. Null when it belongs to somebody else. */
export async function getOrderForUser(
  userId: string,
  reference: string,
): Promise<OrderDetail | null> {
  const rows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.reference, reference), eq(orders.userId, userId)))
    .limit(1);

  const order = rows[0];
  return order ? loadOrderDetail(order) : null;
}

/**
 * One order, for a guest holding the emailed token.
 *
 * The token is compared against its stored hash in constant time, so a
 * near-miss cannot be narrowed down by timing. An order that belongs to a real
 * account is not reachable this way at all, even with a token: those customers
 * sign in.
 */
export async function getOrderForGuest(
  reference: string,
  token: string,
): Promise<OrderDetail | null> {
  const order = await findByReference(reference);
  if (!order?.guestAccessTokenHash) return null;
  if (!tokensMatch(order.guestAccessTokenHash, hashToken(token))) return null;
  return loadOrderDetail(order);
}
