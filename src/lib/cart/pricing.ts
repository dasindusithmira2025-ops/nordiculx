import { capDiscount, percentOf } from '@/lib/money';
import type { PromotionScope, PromotionType } from '@/lib/db/schema';

/**
 * Order pricing.
 *
 * Pure functions with no database access, so the rules that decide what a
 * customer pays can be tested exhaustively and cannot be influenced by
 * anything a browser sends. The server computes totals with these functions at
 * checkout and stores the result on the order; a client-submitted total is
 * never read.
 *
 * All amounts are integer cents.
 */

export type PricedLine = {
  variantId: string;
  productId: string;
  /** Cents. `salePrice ?? price` for this variant. */
  unitPrice: number;
  quantity: number;
  /** unitPrice × quantity. */
  lineTotal: number;
  /** For scope matching. */
  brandId: string;
  categoryId: string | null;
  collectionIds: string[];
};

export type PromotionLike = {
  id: string;
  code: string | null;
  name: string;
  type: PromotionType;
  scope: PromotionScope;
  value: number;
  minimumSubtotal: number;
  maximumDiscount: number | null;
  targetIds: string[];
  startsAt: Date | null;
  endsAt: Date | null;
  enabled: boolean;
  usageLimit: number | null;
  usageCount: number;
};

export type ShippingRate = {
  method: string;
  label: string;
  /** Cents. */
  amount: number;
  /** Free above this subtotal, in cents. Null disables the threshold. */
  freeAboveSubtotal: number | null;
};

export type PricingResult = {
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  grandTotal: number;
  appliedPromotion: { id: string; code: string | null; name: string } | null;
  /** Discount apportioned per line, for partial refunds later. */
  lineDiscounts: Record<string, number>;
};

export type PromotionRejection =
  | 'not_found'
  | 'disabled'
  | 'not_started'
  | 'expired'
  | 'usage_limit_reached'
  | 'minimum_not_met'
  | 'no_eligible_items';

export type PromotionCheck =
  | { valid: true; promotion: PromotionLike; eligibleSubtotal: number }
  | { valid: false; reason: PromotionRejection };

/** Subtotal of all lines, before any discount. */
export function calculateSubtotal(lines: PricedLine[]): number {
  return lines.reduce((sum, line) => sum + line.lineTotal, 0);
}

/** The lines a scoped promotion actually applies to. */
export function eligibleLines(
  promotion: PromotionLike,
  lines: PricedLine[],
): PricedLine[] {
  switch (promotion.scope) {
    case 'order':
      return lines;
    case 'product':
      return lines.filter((l) => promotion.targetIds.includes(l.productId));
    case 'brand':
      return lines.filter((l) => promotion.targetIds.includes(l.brandId));
    case 'category':
      return lines.filter(
        (l) =>
          l.categoryId !== null && promotion.targetIds.includes(l.categoryId),
      );
    case 'collection':
      return lines.filter((l) =>
        l.collectionIds.some((id) => promotion.targetIds.includes(id)),
      );
    default:
      return [];
  }
}

/**
 * Whether a promotion may be applied to these lines, at this moment.
 *
 * Re-checked server-side on every price calculation, not just when the code is
 * entered — a code that expires while a cart sits open must stop applying.
 */
export function checkPromotion(
  promotion: PromotionLike | null,
  lines: PricedLine[],
  now: Date = new Date(),
): PromotionCheck {
  if (!promotion) return { valid: false, reason: 'not_found' };
  if (!promotion.enabled) return { valid: false, reason: 'disabled' };
  if (promotion.startsAt && promotion.startsAt > now) {
    return { valid: false, reason: 'not_started' };
  }
  if (promotion.endsAt && promotion.endsAt <= now) {
    return { valid: false, reason: 'expired' };
  }
  if (
    promotion.usageLimit !== null &&
    promotion.usageCount >= promotion.usageLimit
  ) {
    return { valid: false, reason: 'usage_limit_reached' };
  }

  const applicable = eligibleLines(promotion, lines);
  if (applicable.length === 0) {
    return { valid: false, reason: 'no_eligible_items' };
  }

  // The minimum is assessed against the WHOLE basket, which is what customers
  // expect from "spend over X", not against the discounted subset.
  const subtotal = calculateSubtotal(lines);
  if (subtotal < promotion.minimumSubtotal) {
    return { valid: false, reason: 'minimum_not_met' };
  }

  return {
    valid: true,
    promotion,
    eligibleSubtotal: calculateSubtotal(applicable),
  };
}

/** The discount a valid promotion produces, in cents. Never exceeds the basket. */
export function calculateDiscount(
  promotion: PromotionLike,
  lines: PricedLine[],
): number {
  const applicable = eligibleLines(promotion, lines);
  const eligibleSubtotal = calculateSubtotal(applicable);

  let discount: number;
  switch (promotion.type) {
    case 'percentage':
      discount = percentOf(eligibleSubtotal, promotion.value);
      break;
    case 'fixed_amount':
      discount = promotion.value;
      break;
    case 'free_shipping':
      // Applied to shipping, not to the goods.
      return 0;
    default:
      return 0;
  }

  if (promotion.maximumDiscount !== null) {
    discount = Math.min(discount, promotion.maximumDiscount);
  }
  return capDiscount(discount, eligibleSubtotal);
}

/**
 * Spreads an order-level discount across lines proportionally.
 *
 * Rounding is absorbed by the largest line so the parts always sum exactly to
 * the whole — otherwise a refund of every line would not equal the order total.
 */
export function apportionDiscount(
  discount: number,
  lines: PricedLine[],
): Record<string, number> {
  const result: Record<string, number> = {};
  if (discount <= 0 || lines.length === 0) {
    for (const line of lines) result[line.variantId] = 0;
    return result;
  }

  const total = calculateSubtotal(lines);
  if (total <= 0) {
    for (const line of lines) result[line.variantId] = 0;
    return result;
  }

  let allocated = 0;
  let largest = lines[0]!;
  for (const line of lines) {
    const share = Math.floor((discount * line.lineTotal) / total);
    result[line.variantId] = share;
    allocated += share;
    if (line.lineTotal > largest.lineTotal) largest = line;
  }

  // Hand the rounding remainder to the largest line.
  const remainder = discount - allocated;
  if (remainder !== 0) {
    result[largest.variantId] = (result[largest.variantId] ?? 0) + remainder;
  }

  return result;
}

/** Shipping charge after free-shipping thresholds and promotions. */
export function calculateShipping(
  rate: ShippingRate,
  subtotalAfterDiscount: number,
  promotion: PromotionLike | null,
): number {
  if (promotion?.type === 'free_shipping') return 0;
  if (
    rate.freeAboveSubtotal !== null &&
    subtotalAfterDiscount >= rate.freeAboveSubtotal
  ) {
    return 0;
  }
  return rate.amount;
}

/**
 * The single authoritative price calculation.
 *
 * Everything that needs a total — cart drawer, checkout summary, order
 * creation — calls this. There is deliberately no second implementation.
 */
export function priceOrder(options: {
  lines: PricedLine[];
  promotion?: PromotionLike | null;
  shippingRate?: ShippingRate | null;
  now?: Date;
}): PricingResult {
  const { lines } = options;
  const subtotal = calculateSubtotal(lines);

  const check = checkPromotion(options.promotion ?? null, lines, options.now);
  const promotion = check.valid ? check.promotion : null;

  const discountTotal = promotion ? calculateDiscount(promotion, lines) : 0;
  const lineDiscounts = apportionDiscount(discountTotal, lines);

  const subtotalAfterDiscount = subtotal - discountTotal;

  const shippingTotal = options.shippingRate
    ? calculateShipping(options.shippingRate, subtotalAfterDiscount, promotion)
    : 0;

  // Sri Lanka: prices are quoted inclusive, so no tax is added on top. The
  // field exists so a future jurisdiction does not require a schema change.
  const taxTotal = 0;

  return {
    subtotal,
    discountTotal,
    shippingTotal,
    taxTotal,
    grandTotal: Math.max(0, subtotalAfterDiscount + shippingTotal + taxTotal),
    appliedPromotion: promotion
      ? { id: promotion.id, code: promotion.code, name: promotion.name }
      : null,
    lineDiscounts,
  };
}

/** Human-readable reason a code was refused, for the cart and checkout UI. */
export function promotionRejectionMessage(reason: PromotionRejection): string {
  switch (reason) {
    case 'not_found':
      return 'That code was not recognised.';
    case 'disabled':
      return 'That code is no longer active.';
    case 'not_started':
      return 'That code is not active yet.';
    case 'expired':
      return 'That code has expired.';
    case 'usage_limit_reached':
      return 'That code has reached its usage limit.';
    case 'minimum_not_met':
      return 'Your bag does not meet the minimum spend for that code.';
    case 'no_eligible_items':
      return 'That code does not apply to anything in your bag.';
    default:
      return 'That code could not be applied.';
  }
}

/** The only shipping rate today. Configurable later without touching callers. */
export const STANDARD_SHIPPING: ShippingRate = {
  method: 'standard',
  label: 'Standard island-wide delivery',
  amount: 4500,
  freeAboveSubtotal: 10000,
};
