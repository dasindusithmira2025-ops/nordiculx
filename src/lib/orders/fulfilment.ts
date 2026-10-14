import type { OrderStatus, PaymentStatus } from '@/lib/db/schema';

/**
 * A paid order may take only the next physical fulfilment step. The limited
 * shortcuts to dispatch keep the single-step warehouse workflow practical
 * without permitting a shipped order to re-enter the dispatch transition.
 */
const PAID_NEXT: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pending_payment: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'packed', 'dispatched', 'cancelled'],
  preparing: ['packed', 'dispatched', 'cancelled'],
  packed: ['dispatched', 'cancelled'],
  dispatched: ['in_transit', 'out_for_delivery', 'delivered'],
  in_transit: ['out_for_delivery', 'delivered'],
  out_for_delivery: ['delivered'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
};

/**
 * Legal next statuses excluding the current status. Keeping the graph here
 * lets the admin UI and the action enforce exactly the same state contract.
 */
export function nextOrderStatuses(
  current: OrderStatus,
  paymentStatus: PaymentStatus,
): readonly OrderStatus[] {
  if (paymentStatus === 'paid' || paymentStatus === 'partially_refunded') {
    return PAID_NEXT[current];
  }
  return current === 'pending_payment' ? ['cancelled'] : [];
}

/** Whether an order may move from its current state to the requested state. */
export function canMoveOrderTo(
  current: OrderStatus,
  next: OrderStatus,
  paymentStatus: PaymentStatus,
): boolean {
  return (
    current === next || nextOrderStatuses(current, paymentStatus).includes(next)
  );
}
