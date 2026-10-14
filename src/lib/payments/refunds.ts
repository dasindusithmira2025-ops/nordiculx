import 'server-only';
import { eq } from 'drizzle-orm';
import { type Transaction } from '@/lib/db';
import { orders, payments } from '@/lib/db/schema';

/** Expected business-rule failure while recording a provider-completed refund. */
export class RefundAccountingError extends Error {}

/**
 * Records money that staff have already returned through the payment provider.
 *
 * This helper deliberately does not call a provider API: neither configured
 * provider implements a verified refund protocol. It serialises the local
 * accounting update under order then payment locks so a second staff action
 * cannot over-refund the captured payment.
 */
export async function recordCompletedRefund(
  tx: Transaction,
  input: { orderId: string; amount: number },
) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new RefundAccountingError('Enter a refund amount greater than zero.');
  }

  const orderRows = await tx
    .select({
      id: orders.id,
      reference: orders.reference,
      paymentStatus: orders.paymentStatus,
    })
    .from(orders)
    .where(eq(orders.id, input.orderId))
    .for('update')
    .limit(1);
  const order = orderRows[0];
  if (!order) throw new RefundAccountingError('Order not found.');

  const paymentRows = await tx
    .select({
      id: payments.id,
      amount: payments.amount,
      status: payments.status,
      refundedAmount: payments.refundedAmount,
    })
    .from(payments)
    .where(eq(payments.orderId, order.id))
    .for('update')
    .limit(1);
  const payment = paymentRows[0];
  if (!payment) throw new RefundAccountingError('Payment record not found.');
  if (payment.status !== 'paid' && payment.status !== 'partially_refunded') {
    throw new RefundAccountingError('Only a captured payment can be refunded.');
  }

  const nextRefundedAmount = payment.refundedAmount + input.amount;
  if (nextRefundedAmount > payment.amount) {
    throw new RefundAccountingError(
      'This refund exceeds the remaining captured payment amount.',
    );
  }

  const paymentStatus =
    nextRefundedAmount === payment.amount ? 'refunded' : 'partially_refunded';
  const now = new Date();

  await tx
    .update(payments)
    .set({
      refundedAmount: nextRefundedAmount,
      refundedAt: now,
      status: paymentStatus,
      updatedAt: now,
    })
    .where(eq(payments.id, payment.id));
  await tx
    .update(orders)
    .set({ paymentStatus, updatedAt: now })
    .where(eq(orders.id, order.id));

  return {
    orderId: order.id,
    reference: order.reference,
    paymentStatus,
    previousRefundedAmount: payment.refundedAmount,
    refundedAmount: nextRefundedAmount,
  };
}
