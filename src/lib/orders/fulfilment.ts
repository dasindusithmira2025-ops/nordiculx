import type { OrderStatus, PaymentStatus } from '@/lib/db/schema';

/**
 * Whether an order may be moved to `next` given what has been paid.
 *
 * An order exists from the moment "Place order" is clicked — before the
 * customer has paid — so an abandoned payment leaves a real-looking order in
 * the admin. Until the provider confirms payment it may only wait or be
 * cancelled; every fulfilment status would ship goods nobody paid for.
 */
const UNPAID_ALLOWED: readonly OrderStatus[] = ['pending_payment', 'cancelled'];
const MONEY_RECEIVED: readonly PaymentStatus[] = [
  'paid',
  'partially_refunded',
  'refunded',
];

export function canMoveOrderTo(
  next: OrderStatus,
  paymentStatus: PaymentStatus,
): boolean {
  return (
    UNPAID_ALLOWED.includes(next) || MONEY_RECEIVED.includes(paymentStatus)
  );
}
