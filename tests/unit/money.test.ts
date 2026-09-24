import { describe, it, expect } from 'vitest';
import {
  money,
  addMoney,
  subtractMoney,
  multiplyMoney,
  sumMoney,
  percentOf,
  capDiscount,
  formatMoney,
  parseMoneyInput,
  discountPercent,
} from '@/lib/money';

describe('money construction', () => {
  it('rejects non-integer amounts so floats never enter a price', () => {
    expect(() => money(19.99)).toThrow(/integer/i);
  });

  it('accepts negative amounts for discounts and refunds', () => {
    expect(money(-500).amount).toBe(-500);
  });
});

describe('arithmetic', () => {
  it('refuses to mix currencies', () => {
    expect(() => addMoney(money(100, 'LKR'), money(100, 'USD'))).toThrow(
      /currency mismatch/i,
    );
  });

  it('adds, subtracts and multiplies in minor units', () => {
    expect(addMoney(money(1999), money(1)).amount).toBe(2000);
    expect(subtractMoney(money(2000), money(1)).amount).toBe(1999);
    expect(multiplyMoney(money(1999), 3).amount).toBe(5997);
  });

  it('rejects fractional quantities', () => {
    expect(() => multiplyMoney(money(100), 1.5)).toThrow(/integer/i);
  });

  it('sums an empty basket to zero rather than NaN', () => {
    expect(sumMoney([]).amount).toBe(0);
  });

  it('sums a basket without floating point drift', () => {
    // 0.1 + 0.2 in floats is 0.30000000000000004; in minor units it is exact.
    expect(sumMoney([money(10), money(20)]).amount).toBe(30);
  });
});

describe('percentOf', () => {
  it('rounds half-up', () => {
    // 15% of 1010 = 151.5 -> 152
    expect(percentOf(1010, 15)).toBe(152);
  });

  it('rounds symmetrically for negative amounts', () => {
    // Math.round(-151.5) would give -151 (toward zero) and under-refund.
    expect(percentOf(-1010, 15)).toBe(-152);
  });

  it('handles whole percentages exactly', () => {
    expect(percentOf(10000, 25)).toBe(2500);
  });
});

describe('capDiscount', () => {
  it('never lets a discount exceed the subtotal', () => {
    expect(capDiscount(9999, 5000)).toBe(5000);
  });

  it('never returns a negative discount', () => {
    expect(capDiscount(-100, 5000)).toBe(0);
  });
});

describe('formatMoney', () => {
  it('drops decimals for whole amounts', () => {
    expect(formatMoney(890000)).not.toContain('.00');
  });

  it('formats catalogue prices as Sri Lankan rupees by default', () => {
    expect(formatMoney(1999)).toBe('LKR 19.99');
  });

  it('keeps decimals when the amount has cents', () => {
    expect(formatMoney(199950)).toContain('.50');
  });

  it('can be forced to show decimals for invoice-style output', () => {
    expect(formatMoney(890000, 'LKR', { forceDecimals: true })).toContain(
      '.00',
    );
  });
});

describe('parseMoneyInput', () => {
  it('parses grouped and decimal input to minor units', () => {
    expect(parseMoneyInput('1,299.50')).toBe(129950);
    expect(parseMoneyInput('1299')).toBe(129900);
  });

  it('returns null for input with no number in it', () => {
    expect(parseMoneyInput('')).toBeNull();
    expect(parseMoneyInput('abc')).toBeNull();
    expect(parseMoneyInput('.')).toBeNull();
  });

  it('rounds sub-cent input rather than storing a float', () => {
    expect(parseMoneyInput('10.999')).toBe(1100);
  });
});

describe('discountPercent', () => {
  it('computes the badge percentage', () => {
    expect(discountPercent(10000, 7500)).toBe(25);
  });

  it('returns 0 when there is no genuine reduction', () => {
    expect(discountPercent(10000, 10000)).toBe(0);
    expect(discountPercent(10000, 12000)).toBe(0);
    expect(discountPercent(0, 0)).toBe(0);
  });
});
