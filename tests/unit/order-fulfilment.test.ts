import { describe, expect, it } from 'vitest';
import { canMoveOrderTo } from '@/lib/orders/fulfilment';

describe('canMoveOrderTo', () => {
  it('never lets an unpaid order be fulfilled', () => {
    for (const payment of ['pending', 'authorised', 'failed'] as const) {
      expect(canMoveOrderTo('confirmed', payment)).toBe(false);
      expect(canMoveOrderTo('dispatched', payment)).toBe(false);
      expect(canMoveOrderTo('delivered', payment)).toBe(false);
    }
  });

  it('still lets an unpaid order wait or be cancelled', () => {
    expect(canMoveOrderTo('pending_payment', 'pending')).toBe(true);
    expect(canMoveOrderTo('cancelled', 'failed')).toBe(true);
  });

  it('allows fulfilment once money was received', () => {
    expect(canMoveOrderTo('dispatched', 'paid')).toBe(true);
    expect(canMoveOrderTo('returned', 'refunded')).toBe(true);
  });
});
