import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  inventoryItems,
  inventoryMovements,
  orderItems,
  orders,
  payments,
  trackingEvents,
} from '@/lib/db/schema';

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

    const lines = await tx
      .select({
        variantId: orderItems.variantId,
        quantity: sql<number>`SUM(${orderItems.quantity})::int`,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
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
          `Reservation invariant failed while cancelling ${input.reference}`,
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
        referenceId: order.id,
        note: `Released after payment session expired for ${input.reference}`,
      });
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
