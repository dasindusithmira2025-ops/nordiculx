import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { orders, payments } from '@/lib/db/schema';

type PaymentPayload = {
  checkoutSessionId?: string;
  lastEventId?: string;
};

export async function recordPaymentStarted(input: {
  orderId: string;
  provider: string;
  providerReference: string | null;
  checkoutSessionId?: string | null;
}) {
  await db
    .update(payments)
    .set({
      provider: input.provider,
      providerReference: input.providerReference,
      providerPayload: input.checkoutSessionId
        ? { checkoutSessionId: input.checkoutSessionId }
        : undefined,
      updatedAt: new Date(),
    })
    .where(eq(payments.orderId, input.orderId));
}

export async function getStripePaymentContext(reference: string) {
  const rows = await db
    .select({
      orderId: orders.id,
      reference: orders.reference,
      amount: orders.grandTotal,
      currency: orders.currency,
      provider: payments.provider,
      providerPayload: payments.providerPayload,
    })
    .from(orders)
    .innerJoin(payments, eq(payments.orderId, orders.id))
    .where(eq(orders.reference, reference))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  const payload = (row.providerPayload ?? {}) as PaymentPayload;
  return {
    ...row,
    checkoutSessionId: payload.checkoutSessionId ?? null,
    lastEventId: payload.lastEventId ?? null,
  };
}
