import 'server-only';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { db, type Transaction } from '@/lib/db';
import {
  inventoryItems,
  inventoryMovements,
  orderItems,
  orders,
  payments,
  promotions,
  trackingEvents,
} from '@/lib/db/schema';

/**
 * Returns an order's reserved units to sale and writes the ledger rows, inside
 * the caller's transaction. Only call it for an order that still holds its
 * reservation (awaiting payment through packed) — dispatch has already taken
 * the units off the shelf.
 */
export async function releaseOrderReservation(
  tx: Transaction,
  orderId: string,
  note: string,
) {
  const lines = await tx
    .select({
      variantId: orderItems.variantId,
      quantity: sql<number>`SUM(${orderItems.quantity})::int`,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .groupBy(orderItems.variantId);

  for (const line of lines) {
    if (!line.variantId) continue;
    const released = await tx
      .update(inventoryItems)
      .set({
        reserved: sql`${inventoryItems.reserved} - ${line.quantity}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(inventoryItems.variantId, line.variantId),
          sql`${inventoryItems.reserved} >= ${line.quantity}`,
        ),
      )
      .returning({
        onHand: inventoryItems.onHand,
        reserved: inventoryItems.reserved,
      });
    const after = released[0];
    if (!after) {
      throw new Error(
        `Reservation invariant failed while releasing ${orderId}`,
      );
    }
    await tx.insert(inventoryMovements).values({
      variantId: line.variantId,
      reason: 'order_released',
      onHandDelta: 0,
      reservedDelta: -line.quantity,
      onHandAfter: after.onHand,
      reservedAfter: after.reserved,
      referenceType: 'order',
      referenceId: orderId,
      note,
    });
  }
}

/**
 * Cancels an expired provider checkout and releases its reservation once.
 * A browser cancel redirect never calls this: only a signed provider event can
 * prove that the hosted payment session can no longer complete.
 */
export async function cancelExpiredPayment(input: {
  reference: string;
  provider: string;
  providerReference: string | null;
  eventId: string;
}) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: orders.id,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        promotionId: orders.promotionId,
      })
      .from(orders)
      .where(eq(orders.reference, input.reference))
      .for('update')
      .limit(1);
    const order = rows[0];
    if (!order) return { ok: false as const, reason: 'not_found' as const };
    if (
      order.status === 'cancelled' ||
      order.paymentStatus === 'paid' ||
      order.paymentStatus === 'refunded'
    ) {
      return { ok: true as const, orderId: order.id, changed: false };
    }

    const changed = await tx
      .update(orders)
      .set({
        status: 'cancelled',
        paymentStatus: 'failed',
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(orders.id, order.id), eq(orders.status, 'pending_payment')))
      .returning({ id: orders.id });
    if (!changed[0]) {
      return { ok: true as const, orderId: order.id, changed: false };
    }

    await releaseOrderReservation(
      tx,
      order.id,
      `Released after payment session expired for ${input.reference}`,
    );

    // An order nobody paid for did not use the code; give the redemption back
    // so a limited code still works when the customer tries again.
    if (order.promotionId) {
      await tx
        .update(promotions)
        .set({ usageCount: sql`GREATEST(${promotions.usageCount} - 1, 0)` })
        .where(eq(promotions.id, order.promotionId));
    }

    const paymentRows = await tx
      .select({ payload: payments.providerPayload })
      .from(payments)
      .where(eq(payments.orderId, order.id))
      .limit(1);
    await tx
      .update(payments)
      .set({
        provider: input.provider,
        providerReference: input.providerReference,
        status: 'failed',
        failureReason: 'checkout_session_expired',
        providerPayload: {
          ...(paymentRows[0]?.payload ?? {}),
          lastEventId: input.eventId,
        },
        updatedAt: new Date(),
      })
      .where(eq(payments.orderId, order.id));

    await tx.insert(trackingEvents).values({
      orderId: order.id,
      status: 'cancelled',
      message: 'Payment window expired and the reserved items were released.',
      source: 'system',
    });
    return { ok: true as const, orderId: order.id, changed: true };
  });
}

/**
 * How long an unpaid order may hold stock when no provider event will ever
 * close it: PayHere sends nothing for an abandoned payment page, and an order
 * whose provider call failed never reached a provider at all. Stripe closes its
 * own sessions through `checkout.session.expired`, so it is left to that.
 */
export const UNPAID_ORDER_TTL_MINUTES = 120;

/** Cancels stale unpaid orders and releases their stock. Run from the cron. */
export async function expireStaleUnpaidOrders(limit = 50) {
  const cutoff = new Date(Date.now() - UNPAID_ORDER_TTL_MINUTES * 60 * 1000);
  const stale = await db
    .select({ reference: orders.reference, provider: payments.provider })
    .from(orders)
    .innerJoin(payments, eq(payments.orderId, orders.id))
    .where(
      and(
        eq(orders.status, 'pending_payment'),
        inArray(payments.provider, ['payhere', 'pending']),
        lt(orders.createdAt, cutoff),
      ),
    )
    .limit(limit);

  let cancelled = 0;
  for (const order of stale) {
    const result = await cancelExpiredPayment({
      reference: order.reference,
      provider: order.provider,
      providerReference: null,
      eventId: 'unpaid-order-expiry',
    });
    if (result.ok && result.changed) cancelled += 1;
  }
  return { cancelled };
}
