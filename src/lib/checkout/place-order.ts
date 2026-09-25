import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  carts,
  inventoryItems,
  inventoryMovements,
  orderItems,
  orders,
  payments,
  promotions,
  trackingEvents,
} from '@/lib/db/schema';
import type { CartView } from '@/lib/cart';
import { priceOrder, STANDARD_SHIPPING } from '@/lib/cart/pricing';
import type { PromotionLike } from '@/lib/cart/pricing';
import { generateReference, generateToken, hashToken } from '@/lib/tokens';
import type { AddressInput } from '@/lib/validation';
import { DEFAULT_CURRENCY } from '@/lib/money';

/**
 * Order placement.
 *
 * This is the one function in the application where being wrong costs money, so
 * the rules are strict:
 *
 * 1. **Totals are recomputed here.** Nothing the browser submits contributes to
 *    a price. The cart's stored lines are re-priced with the same pure engine the
 *    cart drawer uses, and that result is what gets written.
 *
 * 2. **Everything happens in one transaction.** Reserving stock, the order, its
 *    lines, the ledger movements and the payment row either all land or none do.
 *    A crash halfway must not leave stock reserved against an order that does not
 *    exist.
 *
 * 3. **Stock is reserved with a conditional UPDATE, never read-then-write.**
 *    `WHERE on_hand - reserved >= qty` makes the database arbitrate, so two
 *    people buying the last unit at the same instant cannot both succeed. A prior
 *    SELECT to "check availability" would be a race, not a check.
 *
 * 4. **The cart row is locked and marked converted.** A converted cart can never
 *    be re-priced or re-submitted, so a double-submit cannot create two orders.
 */

export type PlaceOrderInput = {
  cart: CartView;
  email: string;
  phone: string | null;
  whatsappOptIn: boolean;
  shippingAddress: AddressInput;
  /** Omitted when billing is the same as shipping. */
  billingAddress?: AddressInput | null;
  userId: string | null;
  customerNote?: string | null;
};

export type PlaceOrderResult =
  | {
      ok: true;
      orderId: string;
      reference: string;
      /** Raw token for a guest lookup link. Null for a signed-in customer. */
      guestToken: string | null;
      grandTotal: number;
      /** Distinct lines, for analytics. Not a unit count. */
      itemCount: number;
      promotionCode: string | null;
    }
  | {
      ok: false;
      reason: 'empty_cart' | 'out_of_stock' | 'already_converted';
      /** Product names that could not be reserved, for `out_of_stock`. */
      unavailable?: string[];
    };

/**
 * Aborts the transaction while carrying the reason out.
 *
 * Drizzle's `tx.rollback()` throws, so the value after it is unreachable and the
 * failure cannot be returned normally. Throwing a typed error instead rolls the
 * transaction back the same way and lets the caller turn it into a result.
 */
class OutOfStockError extends Error {
  constructor(readonly unavailable: string[]) {
    super('Insufficient stock');
    this.name = 'OutOfStockError';
  }
}

function normaliseAddress(address: AddressInput) {
  return {
    recipientName: address.recipientName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2 || null,
    city: address.city,
    district: address.district || null,
    postalCode: address.postalCode || null,
    country: address.country || 'LK',
  };
}

export async function placeOrder(
  input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
  const { cart } = input;
  if (cart.lines.length === 0) return { ok: false, reason: 'empty_cart' };

  try {
    return await db.transaction(async (tx) => {
      // `FOR UPDATE` serialises two concurrent submissions of the same cart:
      // the second waits here, then sees `convertedOrderId` already set.
      const cartRows = await tx
        .select({
          id: carts.id,
          convertedOrderId: carts.convertedOrderId,
          promotionCode: carts.promotionCode,
        })
        .from(carts)
        .where(eq(carts.id, cart.id))
        .for('update')
        .limit(1);

      const cartRow = cartRows[0];
      if (!cartRow || cartRow.convertedOrderId) {
        return { ok: false as const, reason: 'already_converted' as const };
      }

      /* --- re-price from stored state, never from the request ------------- */

      // The cart's own priced lines, carrying the brand/category/collection
      // ids a scoped promotion matches on. Rebuilding them here with empty
      // scope fields would make a brand- or category-scoped code silently stop
      // applying at checkout, charging more than the bag displayed.
      const pricedLines = cart.pricedLines;

      let promotion: PromotionLike | null = null;
      if (cartRow.promotionCode) {
        const rows = await tx
          .select()
          .from(promotions)
          .where(eq(promotions.code, cartRow.promotionCode))
          .limit(1);
        const row = rows[0];
        if (row) {
          promotion = {
            id: row.id,
            code: row.code,
            name: row.name,
            type: row.type,
            scope: row.scope,
            value: row.value,
            minimumSubtotal: row.minimumSubtotal,
            maximumDiscount: row.maximumDiscount,
            targetIds: row.targetIds ?? [],
            startsAt: row.startsAt,
            endsAt: row.endsAt,
            enabled: row.enabled,
            usageLimit: row.usageLimit,
            usageCount: row.usageCount,
          };
        }
      }

      // `priceOrder` re-checks the promotion's window and usage limit, so a code
      // that expired while the cart sat open stops applying now rather than
      // still applying because it was valid when it was typed.
      const pricing = priceOrder({
        lines: pricedLines,
        promotion,
        shippingRate: STANDARD_SHIPPING,
      });

      /* --- reserve stock -------------------------------------------------- */

      const unavailable: string[] = [];
      const movements: {
        variantId: string;
        quantity: number;
        onHandAfter: number;
        reservedAfter: number;
      }[] = [];

      for (const line of cart.lines) {
        const reserved = await tx
          .update(inventoryItems)
          .set({
            reserved: sql`${inventoryItems.reserved} + ${line.quantity}`,
            updatedAt: new Date(),
          })
          .where(
            sql`${inventoryItems.variantId} = ${line.variantId}
                AND (
                  ${inventoryItems.allowBackorder} = true
                  OR ${inventoryItems.onHand} - ${inventoryItems.reserved} >= ${line.quantity}
                )`,
          )
          .returning({
            onHand: inventoryItems.onHand,
            reserved: inventoryItems.reserved,
          });

        const row = reserved[0];
        if (!row) {
          // Nothing matched: the units are gone. Every failing line is collected
          // rather than stopping at the first, so the customer is told once.
          unavailable.push(line.productName);
          continue;
        }

        movements.push({
          variantId: line.variantId,
          quantity: line.quantity,
          onHandAfter: row.onHand,
          reservedAfter: row.reserved,
        });
      }

      if (unavailable.length > 0) {
        // Rolls back every reservation above, including the ones that succeeded.
        throw new OutOfStockError(unavailable);
      }

      /* --- create the order ----------------------------------------------- */

      const reference = generateReference();
      const guestToken = input.userId ? null : generateToken();

      const inserted = await tx
        .insert(orders)
        .values({
          reference,
          userId: input.userId,
          guestAccessTokenHash: guestToken ? hashToken(guestToken) : null,
          email: input.email,
          phone: input.phone,
          whatsappOptIn: input.whatsappOptIn,
          status: 'pending_payment',
          paymentStatus: 'pending',
          currency: DEFAULT_CURRENCY,
          subtotal: pricing.subtotal,
          discountTotal: pricing.discountTotal,
          shippingTotal: pricing.shippingTotal,
          taxTotal: pricing.taxTotal,
          grandTotal: pricing.grandTotal,
          promotionId: pricing.appliedPromotion?.id ?? null,
          promotionCode: pricing.appliedPromotion?.code ?? null,
          // Copied, not referenced: editing a saved address later must not
          // rewrite where this order was sent.
          shippingAddress: normaliseAddress(input.shippingAddress),
          billingAddress: normaliseAddress(
            input.billingAddress ?? input.shippingAddress,
          ),
          shippingMethod: STANDARD_SHIPPING.method,
          customerNote: input.customerNote || null,
        })
        .returning({ id: orders.id });

      const orderId = inserted[0]!.id;

      await tx.insert(orderItems).values(
        cart.lines.map((line) => ({
          orderId,
          productId: line.productId,
          variantId: line.variantId,
          // Purchase-time snapshot: these must not change if the catalogue does.
          productName: line.productName,
          variantName: line.variantName,
          brandName: line.brandName,
          sku: line.sku,
          imageUrl: line.imageUrl,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
          lineTotal: line.lineTotal,
          lineDiscount: pricing.lineDiscounts[line.variantId] ?? 0,
        })),
      );

      // Written after the order so each movement carries its real order id — the
      // ledger has to be explainable, and a null reference is not.
      await tx.insert(inventoryMovements).values(
        movements.map((movement) => ({
          variantId: movement.variantId,
          reason: 'order_reserved' as const,
          onHandDelta: 0,
          reservedDelta: movement.quantity,
          onHandAfter: movement.onHandAfter,
          reservedAfter: movement.reservedAfter,
          referenceType: 'order',
          referenceId: orderId,
          note: `Reserved for order ${reference}`,
        })),
      );

      await tx.insert(payments).values({
        orderId,
        // The real provider is recorded when an intent is created; until then
        // this row only records that money is expected.
        provider: 'pending',
        status: 'pending',
        amount: pricing.grandTotal,
        currency: DEFAULT_CURRENCY,
      });

      await tx.insert(trackingEvents).values({
        orderId,
        status: 'pending_payment',
        message: 'Order received, awaiting payment.',
        source: 'system',
      });

      if (pricing.appliedPromotion) {
        await tx
          .update(promotions)
          .set({ usageCount: sql`${promotions.usageCount} + 1` })
          .where(eq(promotions.id, pricing.appliedPromotion.id));
      }

      await tx
        .update(carts)
        .set({ convertedOrderId: orderId, updatedAt: new Date() })
        .where(eq(carts.id, cart.id));

      return {
        ok: true as const,
        orderId,
        reference,
        guestToken,
        grandTotal: pricing.grandTotal,
        itemCount: cart.lines.length,
        promotionCode: pricing.appliedPromotion?.code ?? null,
      };
    });
  } catch (error) {
    if (error instanceof OutOfStockError) {
      return {
        ok: false,
        reason: 'out_of_stock',
        unavailable: error.unavailable,
      };
    }
    // Anything else is a genuine fault. It must not be swallowed into a
    // "checkout failed" message that hides a bug.
    throw error;
  }
}
