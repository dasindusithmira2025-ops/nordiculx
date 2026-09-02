import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { orders, payments, trackingEvents } from '@/lib/db/schema';

/**
 * Marks an order paid (or failed) from an authoritative payment result.
 *
 * "Authoritative" means the mock driver, which is only permitted outside
 * production, or a signature-verified provider notification. Nothing that
 * arrives on a browser redirect reaches this function — anybody can request a
 * return URL with any query string, so treating one as proof of payment would
 * hand out free orders.
 *
 * Idempotent by design. Providers retry notifications, sometimes for hours, and
 * a retry must not append a second tracking event or double-count a promotion.
 * The status transition is guarded in the WHERE clause, so a repeat updates zero
 * rows and does nothing else.
 */

export type ConfirmPaymentInput = {
  orderId?: string;
  reference: string;
  status: 'paid' | 'failed' | 'pending';
  provider: string;
  providerReference: string | null;
  method?: string | null;
  /** Cents, as the provider reported it. Compared against the order total. */
  amount?: number | null;
  currency?: string | null;
  checkoutReference?: string | null;
  eventId?: string | null;
};

export type ConfirmPaymentResult =
  | { ok: true; orderId: string; changed: boolean }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'order_mismatch'
        | 'amount_mismatch'
        | 'currency_mismatch'
        | 'provider_mismatch'
        | 'checkout_mismatch';
    };

export async function confirmPayment(
  input: ConfirmPaymentInput,
): Promise<ConfirmPaymentResult> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: orders.id,
        grandTotal: orders.grandTotal,
        paymentStatus: orders.paymentStatus,
        currency: orders.currency,
        provider: payments.provider,
        providerPayload: payments.providerPayload,
      })
      .from(orders)
      .innerJoin(payments, eq(payments.orderId, orders.id))
      .where(eq(orders.reference, input.reference))
      .for('update')
      .limit(1);

    const order = rows[0];
    if (!order) return { ok: false as const, reason: 'not_found' as const };
    if (input.orderId && input.orderId !== order.id) {
      return { ok: false as const, reason: 'order_mismatch' as const };
    }
    if (
      input.currency &&
      input.currency.toUpperCase() !== order.currency.toUpperCase()
    ) {
      return { ok: false as const, reason: 'currency_mismatch' as const };
    }
    if (order.provider !== 'pending' && order.provider !== input.provider) {
      return { ok: false as const, reason: 'provider_mismatch' as const };
    }
    const payload = order.providerPayload ?? {};
    if (
      input.checkoutReference &&
      payload.checkoutSessionId &&
      input.checkoutReference !== payload.checkoutSessionId
    ) {
      return { ok: false as const, reason: 'checkout_mismatch' as const };
    }
    if (input.eventId && payload.lastEventId === input.eventId) {
      return { ok: true as const, orderId: order.id, changed: false };
    }

    // An underpaid order must never be marked paid. Providers can be told the
    // wrong amount by a tampered checkout form, so the order's own total — which
    // was computed server-side — is the number that counts.
    if (
      input.status === 'paid' &&
      input.amount != null &&
      input.amount !== order.grandTotal
    ) {
      return { ok: false as const, reason: 'amount_mismatch' as const };
    }

    // Already settled: a retry, so there is nothing to do and nothing to log.
    if (
      order.paymentStatus === 'paid' ||
      order.paymentStatus === 'refunded' ||
      (order.paymentStatus === 'failed' && input.status === 'failed')
    ) {
      return { ok: true as const, orderId: order.id, changed: false };
    }

    await tx
      .update(payments)
      .set({
        provider: input.provider,
        providerReference: input.providerReference,
        status:
          input.status === 'paid'
            ? 'paid'
            : input.status === 'failed'
              ? 'failed'
              : 'pending',
        method: input.method ?? null,
        providerPayload: input.eventId
          ? { ...payload, lastEventId: input.eventId }
          : payload,
        // Authorised and captured together: this provider settles in one step,
        // so there is no window where money is held but not taken.
        authorisedAt: input.status === 'paid' ? new Date() : null,
        capturedAt: input.status === 'paid' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(payments.orderId, order.id));

    if (input.status === 'pending') {
      return { ok: true as const, orderId: order.id, changed: false };
    }

    if (input.status === 'failed') {
      await tx
        .update(orders)
        .set({ paymentStatus: 'failed', updatedAt: new Date() })
        .where(eq(orders.id, order.id));

      await tx.insert(trackingEvents).values({
        orderId: order.id,
        status: 'pending_payment',
        message: 'Payment was not completed.',
        source: 'system',
      });

      return { ok: true as const, orderId: order.id, changed: true };
    }

    // Paid. The status guard in the WHERE clause is what makes a concurrent
    // duplicate notification a no-op rather than a second confirmation.
    const updated = await tx
      .update(orders)
      .set({
        paymentStatus: 'paid',
        status: 'confirmed',
        placedAt: sql`COALESCE(${orders.placedAt}, NOW())`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(orders.id, order.id),
          sql`${orders.paymentStatus} IN ('pending', 'failed')`,
        ),
      )
      .returning({ id: orders.id });

    if (!updated[0]) {
      return { ok: true as const, orderId: order.id, changed: false };
    }

    await tx.insert(trackingEvents).values({
      orderId: order.id,
      status: 'confirmed',
      message: 'Order confirmed and payment received.',
      source: 'system',
    });

    return { ok: true as const, orderId: order.id, changed: true };
  });
}
