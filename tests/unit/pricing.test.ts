import { describe, it, expect } from 'vitest';
import {
  apportionDiscount,
  calculateDiscount,
  calculateShipping,
  calculateSubtotal,
  checkPromotion,
  eligibleLines,
  priceOrder,
  STANDARD_SHIPPING,
  type PricedLine,
  type PromotionLike,
} from '@/lib/cart/pricing';

function line(overrides: Partial<PricedLine> = {}): PricedLine {
  const unitPrice = overrides.unitPrice ?? 100000;
  const quantity = overrides.quantity ?? 1;
  return {
    variantId: overrides.variantId ?? 'v1',
    productId: overrides.productId ?? 'p1',
    unitPrice,
    quantity,
    lineTotal: overrides.lineTotal ?? unitPrice * quantity,
    brandId: overrides.brandId ?? 'b1',
    categoryId: overrides.categoryId ?? 'c1',
    collectionIds: overrides.collectionIds ?? [],
  };
}

function promo(overrides: Partial<PromotionLike> = {}): PromotionLike {
  return {
    id: 'promo1',
    code: 'SAVE',
    name: 'Test promotion',
    type: 'percentage',
    scope: 'order',
    value: 10,
    minimumSubtotal: 0,
    maximumDiscount: null,
    targetIds: [],
    startsAt: null,
    endsAt: null,
    enabled: true,
    usageLimit: null,
    usageCount: 0,
    ...overrides,
  };
}

describe('calculateSubtotal', () => {
  it('sums line totals', () => {
    expect(
      calculateSubtotal([line({ lineTotal: 100 }), line({ lineTotal: 250 })]),
    ).toBe(350);
  });

  it('is zero for an empty basket', () => {
    expect(calculateSubtotal([])).toBe(0);
  });
});

describe('checkPromotion', () => {
  const lines = [line({ lineTotal: 500000 })];

  it('rejects a missing code', () => {
    expect(checkPromotion(null, lines)).toEqual({
      valid: false,
      reason: 'not_found',
    });
  });

  it('rejects a disabled promotion', () => {
    const result = checkPromotion(promo({ enabled: false }), lines);
    expect(result).toEqual({ valid: false, reason: 'disabled' });
  });

  it('rejects a promotion whose window has not opened', () => {
    const future = new Date(Date.now() + 86_400_000);
    expect(checkPromotion(promo({ startsAt: future }), lines)).toEqual({
      valid: false,
      reason: 'not_started',
    });
  });

  it('rejects an expired promotion even if it was valid when applied', () => {
    const past = new Date(Date.now() - 86_400_000);
    expect(checkPromotion(promo({ endsAt: past }), lines)).toEqual({
      valid: false,
      reason: 'expired',
    });
  });

  it('rejects a promotion at its usage limit', () => {
    expect(
      checkPromotion(promo({ usageLimit: 100, usageCount: 100 }), lines),
    ).toEqual({ valid: false, reason: 'usage_limit_reached' });
  });

  it('rejects when the basket is under the minimum spend', () => {
    expect(checkPromotion(promo({ minimumSubtotal: 600000 }), lines)).toEqual({
      valid: false,
      reason: 'minimum_not_met',
    });
  });

  it('rejects a scoped promotion with nothing eligible in the bag', () => {
    const scoped = promo({ scope: 'brand', targetIds: ['other-brand'] });
    expect(checkPromotion(scoped, lines)).toEqual({
      valid: false,
      reason: 'no_eligible_items',
    });
  });

  it('accepts a valid promotion and reports the eligible subtotal', () => {
    const result = checkPromotion(promo(), lines);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.eligibleSubtotal).toBe(500000);
  });
});

describe('eligibleLines', () => {
  const a = line({
    variantId: 'a',
    productId: 'pa',
    brandId: 'ba',
    categoryId: 'ca',
    collectionIds: ['col1'],
  });
  const b = line({
    variantId: 'b',
    productId: 'pb',
    brandId: 'bb',
    categoryId: 'cb',
    collectionIds: ['col2'],
  });

  it('matches the whole order for order scope', () => {
    expect(eligibleLines(promo({ scope: 'order' }), [a, b])).toHaveLength(2);
  });

  it('matches by product, brand, category and collection', () => {
    expect(
      eligibleLines(promo({ scope: 'product', targetIds: ['pa'] }), [a, b]),
    ).toEqual([a]);
    expect(
      eligibleLines(promo({ scope: 'brand', targetIds: ['bb'] }), [a, b]),
    ).toEqual([b]);
    expect(
      eligibleLines(promo({ scope: 'category', targetIds: ['ca'] }), [a, b]),
    ).toEqual([a]);
    expect(
      eligibleLines(promo({ scope: 'collection', targetIds: ['col2'] }), [
        a,
        b,
      ]),
    ).toEqual([b]);
  });

  it('does not match a line with no category against a category promotion', () => {
    const noCategory = line({ variantId: 'n', categoryId: null });
    expect(
      eligibleLines(promo({ scope: 'category', targetIds: ['ca'] }), [
        noCategory,
      ]),
    ).toEqual([]);
  });
});

describe('calculateDiscount', () => {
  it('applies a percentage to the eligible subtotal only', () => {
    const a = line({ variantId: 'a', productId: 'pa', lineTotal: 200000 });
    const b = line({ variantId: 'b', productId: 'pb', lineTotal: 300000 });
    const scoped = promo({ scope: 'product', targetIds: ['pa'], value: 25 });
    expect(calculateDiscount(scoped, [a, b])).toBe(50000);
  });

  it('respects a maximum discount cap', () => {
    const lines = [line({ lineTotal: 1000000 })];
    expect(
      calculateDiscount(promo({ value: 50, maximumDiscount: 300000 }), lines),
    ).toBe(300000);
  });

  it('never discounts more than the eligible subtotal', () => {
    const lines = [line({ lineTotal: 50000 })];
    const fixed = promo({ type: 'fixed_amount', value: 999999 });
    expect(calculateDiscount(fixed, lines)).toBe(50000);
  });

  it('returns zero for a free-shipping promotion, which acts on shipping', () => {
    expect(calculateDiscount(promo({ type: 'free_shipping' }), [line()])).toBe(
      0,
    );
  });
});

describe('apportionDiscount', () => {
  it('splits proportionally and sums exactly to the discount', () => {
    const lines = [
      line({ variantId: 'a', lineTotal: 100000 }),
      line({ variantId: 'b', lineTotal: 200000 }),
    ];
    const split = apportionDiscount(30000, lines);
    expect(split.a! + split.b!).toBe(30000);
    expect(split.b).toBeGreaterThan(split.a!);
  });

  it('absorbs rounding into the largest line so nothing is lost', () => {
    // Three equal lines and a discount that does not divide evenly.
    const lines = [
      line({ variantId: 'a', lineTotal: 10000 }),
      line({ variantId: 'b', lineTotal: 10000 }),
      line({ variantId: 'c', lineTotal: 10000 }),
    ];
    const split = apportionDiscount(1000, lines);
    expect(split.a! + split.b! + split.c!).toBe(1000);
  });

  it('returns zeros when there is no discount', () => {
    const split = apportionDiscount(0, [line({ variantId: 'a' })]);
    expect(split.a).toBe(0);
  });

  it('handles a zero-value basket without dividing by zero', () => {
    const split = apportionDiscount(500, [
      line({ variantId: 'a', lineTotal: 0 }),
    ]);
    expect(split.a).toBe(0);
  });
});

describe('calculateShipping', () => {
  it('charges the standard rate below the free threshold', () => {
    expect(calculateShipping(STANDARD_SHIPPING, 5000, null)).toBe(
      STANDARD_SHIPPING.amount,
    );
  });

  it('is free at or above the threshold', () => {
    expect(
      calculateShipping(
        STANDARD_SHIPPING,
        STANDARD_SHIPPING.freeAboveSubtotal!,
        null,
      ),
    ).toBe(0);
  });

  it('is free with a free-shipping promotion regardless of subtotal', () => {
    const free = promo({ type: 'free_shipping' });
    expect(calculateShipping(STANDARD_SHIPPING, 1000, free)).toBe(0);
  });

  it('uses the discounted subtotal for the threshold, not the original', () => {
    // A discount that drops the basket below the threshold reinstates shipping.
    expect(
      calculateShipping(
        STANDARD_SHIPPING,
        STANDARD_SHIPPING.freeAboveSubtotal! - 1,
        null,
      ),
    ).toBe(STANDARD_SHIPPING.amount);
  });
});

describe('priceOrder', () => {
  it('produces a coherent total for a plain basket', () => {
    const result = priceOrder({
      lines: [line({ lineTotal: 5000 })],
      shippingRate: STANDARD_SHIPPING,
    });
    expect(result.subtotal).toBe(5000);
    expect(result.discountTotal).toBe(0);
    expect(result.shippingTotal).toBe(STANDARD_SHIPPING.amount);
    expect(result.grandTotal).toBe(5000 + STANDARD_SHIPPING.amount);
  });

  it('ignores an expired promotion rather than applying it', () => {
    const result = priceOrder({
      lines: [line({ lineTotal: 5000 })],
      promotion: promo({ endsAt: new Date(Date.now() - 1000) }),
      shippingRate: STANDARD_SHIPPING,
    });
    expect(result.discountTotal).toBe(0);
    expect(result.appliedPromotion).toBeNull();
  });

  it('applies a valid promotion and reports it', () => {
    const result = priceOrder({
      lines: [line({ lineTotal: 5000 })],
      promotion: promo({ value: 10 }),
      shippingRate: STANDARD_SHIPPING,
    });
    expect(result.discountTotal).toBe(500);
    expect(result.grandTotal).toBe(5000 - 500 + STANDARD_SHIPPING.amount);
    expect(result.appliedPromotion?.code).toBe('SAVE');
  });

  it('never produces a negative grand total', () => {
    const result = priceOrder({
      lines: [line({ lineTotal: 10000 })],
      promotion: promo({ type: 'fixed_amount', value: 999999 }),
      shippingRate: null,
    });
    expect(result.grandTotal).toBe(0);
  });

  it('line discounts always sum to the order discount', () => {
    const lines = [
      line({ variantId: 'a', lineTotal: 123456 }),
      line({ variantId: 'b', lineTotal: 654321 }),
      line({ variantId: 'c', lineTotal: 7777 }),
    ];
    const result = priceOrder({ lines, promotion: promo({ value: 17 }) });
    const sum = Object.values(result.lineDiscounts).reduce((a, b) => a + b, 0);
    expect(sum).toBe(result.discountTotal);
  });

  it('prices an empty basket as zero rather than NaN', () => {
    const result = priceOrder({ lines: [], shippingRate: STANDARD_SHIPPING });
    expect(result.subtotal).toBe(0);
    expect(result.grandTotal).toBe(STANDARD_SHIPPING.amount);
  });
});
