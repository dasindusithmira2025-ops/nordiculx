import { describe, expect, it } from 'vitest';
import { canMoveOrderTo } from '@/lib/orders/fulfilment';

describe('canMoveOrderTo', () => {
  it('never lets an unpaid order enter fulfilment', () => {
    for (const payment of ['pending', 'authorised', 'failed'] as const) {
      expect(canMoveOrderTo('pending_payment', 'confirmed', payment)).toBe(
        false,
      );
      expect(canMoveOrderTo('confirmed', 'dispatched', payment)).toBe(false);
    }
  });

  it('lets an unpaid order be cancelled but not rewound from fulfilment', () => {
    expect(canMoveOrderTo('pending_payment', 'cancelled', 'pending')).toBe(
      true,
    );
    expect(canMoveOrderTo('dispatched', 'cancelled', 'paid')).toBe(false);
  });

  it('permits only forward paid fulfilment transitions', () => {
    expect(canMoveOrderTo('confirmed', 'dispatched', 'paid')).toBe(true);
    expect(canMoveOrderTo('dispatched', 'in_transit', 'paid')).toBe(true);
    expect(canMoveOrderTo('delivered', 'returned', 'paid')).toBe(true);
    expect(canMoveOrderTo('dispatched', 'confirmed', 'paid')).toBe(false);
  });
});
