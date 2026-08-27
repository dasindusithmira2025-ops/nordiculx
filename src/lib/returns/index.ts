import 'server-only';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  orderItems,
  orders,
  returnItems,
  returnRequests,
  users,
} from '@/lib/db/schema';
import type { ReturnStatus } from '@/lib/db/schema';
import {
  RETURN_WINDOW_DAYS,
  type AdminReturnRow,
  type ReturnEligibility,
  type ReturnSummary,
} from './model';

export * from './model';

/**
 * Returns.
 *
 * A return is only possible against a delivered order, within the window, for
 * quantities that were actually bought and not already claimed. All four of
 * those are decided here from the order itself — the form supplies a reason
 * and quantities, never an eligibility.
 *
 * `return_requests.order_id` is the ownership anchor: every read below is
 * reached through an order the caller has already been authorised for, so
 * there is no path where a return id alone opens somebody else's request.
 */

/** Statuses that still hold a claim on the quantity they were raised for. */
const CLAIMING: ReturnStatus[] = [
  'requested',
  'approved',
  'in_transit',
  'received',
  'refunded',
];

export async function returnEligibility(
  orderId: string,
): Promise<ReturnEligibility> {
  const rows = await db
    .select({
      status: orders.status,
      deliveredAt: orders.deliveredAt,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  const order = rows[0];
  if (!order || order.status !== 'delivered') {
    return { eligible: false, reason: 'not_delivered' };
  }

  const from = order.deliveredAt ?? order.createdAt;
  const closesOn = new Date(from.getTime() + RETURN_WINDOW_DAYS * 86_400_000);
  if (closesOn <= new Date()) {
    return { eligible: false, reason: 'window_closed' };
  }

  const items = await db
    .select({
      orderItemId: orderItems.id,
      productName: orderItems.productName,
      variantName: orderItems.variantName,
      sku: orderItems.sku,
      imageUrl: orderItems.imageUrl,
      unitPrice: orderItems.unitPrice,
      purchased: orderItems.quantity,
      // Quantities already spoken for by a return that has not been rejected
      // or cancelled — so a customer cannot claim the same unit twice. The
      // outer column is written out in full: drizzle renders it unqualified,
      // and `return_items` has an `id` too, which makes it ambiguous here.
      claimed: sql<number>`COALESCE((
        SELECT SUM(ri.quantity)::int
          FROM return_items ri
          JOIN return_requests rr ON rr.id = ri.return_request_id
         WHERE ri.order_item_id = "order_items"."id"
           AND rr.status IN (${sql.join(
             CLAIMING.map((status) => sql`${status}`),
             sql`, `,
           )})
      ), 0)`,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(orderItems.createdAt);

  const returnable = items
    .map((item) => ({
      orderItemId: item.orderItemId,
      productName: item.productName,
      variantName: item.variantName,
      sku: item.sku,
      imageUrl: item.imageUrl,
      unitPrice: item.unitPrice,
      purchased: item.purchased,
      returnable: Math.max(0, item.purchased - item.claimed),
    }))
    .filter((item) => item.returnable > 0);

  if (returnable.length === 0) {
    return { eligible: false, reason: 'nothing_left' };
  }

  return { eligible: true, items: returnable, closesOn };
}

/** Returns raised against one order. Callers have already proved ownership. */
export async function listReturnsForOrder(
  orderId: string,
): Promise<ReturnSummary[]> {
  const requests = await db
    .select({
      id: returnRequests.id,
      reference: returnRequests.reference,
      status: returnRequests.status,
      reason: returnRequests.reason,
      customerNote: returnRequests.customerNote,
      staffNote: returnRequests.staffNote,
      refundAmount: returnRequests.refundAmount,
      createdAt: returnRequests.createdAt,
    })
    .from(returnRequests)
    .where(eq(returnRequests.orderId, orderId))
    .orderBy(desc(returnRequests.createdAt));

  if (requests.length === 0) return [];

  const lines = await db
    .select({
      returnRequestId: returnItems.returnRequestId,
      quantity: returnItems.quantity,
      productName: orderItems.productName,
      variantName: orderItems.variantName,
      unitPrice: orderItems.unitPrice,
    })
    .from(returnItems)
    .innerJoin(orderItems, eq(orderItems.id, returnItems.orderItemId))
    .where(
      inArray(
        returnItems.returnRequestId,
        requests.map((request) => request.id),
      ),
    );

  return requests.map((request) => ({
    ...request,
    items: lines
      .filter((line) => line.returnRequestId === request.id)
      .map(({ productName, variantName, quantity, unitPrice }) => ({
        productName,
        variantName,
        quantity,
        lineValue: unitPrice * quantity,
      })),
  }));
}

/* --- admin ---------------------------------------------------------------- */

export async function listReturns(
  status?: ReturnStatus,
): Promise<AdminReturnRow[]> {
  const requests = await db
    .select({
      id: returnRequests.id,
      reference: returnRequests.reference,
      status: returnRequests.status,
      reason: returnRequests.reason,
      customerNote: returnRequests.customerNote,
      staffNote: returnRequests.staffNote,
      refundAmount: returnRequests.refundAmount,
      createdAt: returnRequests.createdAt,
      orderReference: orders.reference,
      orderTotal: orders.grandTotal,
      customerEmail: orders.email,
      customerName: users.firstName,
    })
    .from(returnRequests)
    .innerJoin(orders, eq(orders.id, returnRequests.orderId))
    .leftJoin(users, eq(users.id, returnRequests.userId))
    .where(status ? eq(returnRequests.status, status) : undefined)
    .orderBy(desc(returnRequests.createdAt))
    .limit(200);

  if (requests.length === 0) return [];

  const lines = await db
    .select({
      returnRequestId: returnItems.returnRequestId,
      quantity: returnItems.quantity,
      productName: orderItems.productName,
      variantName: orderItems.variantName,
      unitPrice: orderItems.unitPrice,
    })
    .from(returnItems)
    .innerJoin(orderItems, eq(orderItems.id, returnItems.orderItemId))
    .where(
      inArray(
        returnItems.returnRequestId,
        requests.map((request) => request.id),
      ),
    );

  return requests.map((request) => ({
    ...request,
    items: lines
      .filter((line) => line.returnRequestId === request.id)
      .map(({ productName, variantName, quantity, unitPrice }) => ({
        productName,
        variantName,
        quantity,
        lineValue: unitPrice * quantity,
      })),
  }));
}

/** Counts per status, for the admin filter bar. */
export async function returnCounts(): Promise<Record<string, number>> {
  const rows = await db
    .select({
      status: returnRequests.status,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(returnRequests)
    .groupBy(returnRequests.status);
  return Object.fromEntries(rows.map((row) => [row.status, row.count]));
}
