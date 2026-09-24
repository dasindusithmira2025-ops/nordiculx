/**
 * Money handling.
 *
 * Every monetary amount in Nordic Lux — database column, API payload, cart
 * line, order total — is an INTEGER number of minor units (cents). Floating
 * point never touches a price. `1999` is LKR 19.99.
 *
 * Rounding rule: half-up on the minor unit, applied once, at the point a
 * percentage is turned into an amount. Never round twice.
 */

export const DEFAULT_CURRENCY = 'LKR' as const;

export type Money = {
  /** Integer minor units. Negative values are legal (discounts, refunds). */
  amount: number;
  currency: string;
};

export function money(
  amount: number,
  currency: string = DEFAULT_CURRENCY,
): Money {
  if (!Number.isInteger(amount)) {
    throw new TypeError(
      `Money amount must be an integer in minor units, received ${amount}`,
    );
  }
  return { amount, currency };
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount + b.amount, currency: a.currency };
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount - b.amount, currency: a.currency };
}

export function multiplyMoney(a: Money, quantity: number): Money {
  if (!Number.isInteger(quantity)) {
    throw new TypeError(`Quantity must be an integer, received ${quantity}`);
  }
  return { amount: a.amount * quantity, currency: a.currency };
}

export function sumMoney(
  items: Money[],
  currency: string = DEFAULT_CURRENCY,
): Money {
  return items.reduce<Money>((acc, item) => addMoney(acc, item), {
    amount: 0,
    currency,
  });
}

function assertSameCurrency(a: Money, b: Money) {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

/**
 * Percentage of an amount, rounded half-up to the nearest minor unit.
 *
 * `Math.round` is half-up for positive values but half-*toward-zero* for
 * negatives, which would under-discount a refund. Rounding the magnitude and
 * reapplying the sign keeps the behaviour symmetric.
 */
export function percentOf(amount: number, percent: number): number {
  const sign = amount < 0 ? -1 : 1;
  return sign * Math.round((Math.abs(amount) * percent) / 100);
}

/** Clamps a discount so it can never exceed the amount it applies to. */
export function capDiscount(discount: number, subtotal: number): number {
  return Math.max(0, Math.min(discount, subtotal));
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string, withDecimals: boolean) {
  const key = `${currency}:${withDecimals}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: withDecimals ? 2 : 0,
      maximumFractionDigits: withDecimals ? 2 : 0,
    });
    formatters.set(key, f);
  }
  return f;
}

/**
 * Formats minor units for display.
 *
 * Whole amounts drop the decimals — "$39" reads better on a product card
 * than "$39.00". Cents are still shown when the price has them.
 */
export function formatMoney(
  amount: number,
  currency: string = DEFAULT_CURRENCY,
  options: { forceDecimals?: boolean } = {},
): string {
  const hasCents = amount % 100 !== 0;
  return formatterFor(currency, options.forceDecimals || hasCents).format(
    amount / 100,
  );
}

/** Parses user input ("1,299.50", "1299") into integer minor units. */
export function parseMoneyInput(input: string): number | null {
  const cleaned = input.replace(/[^\d.-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** Whole-number discount percentage, for the "-25%" badge on a product card. */
export function discountPercent(listPrice: number, salePrice: number): number {
  if (listPrice <= 0 || salePrice >= listPrice) return 0;
  return Math.round(((listPrice - salePrice) / listPrice) * 100);
}
