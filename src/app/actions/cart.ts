'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { cartItems, carts, promotions } from '@/lib/db/schema';
import { ensureCart, getCart } from '@/lib/cart';
import { checkPromotion, promotionRejectionMessage } from '@/lib/cart/pricing';
import {
  quantitySchema,
  uuidSchema,
  actionError,
  actionOk,
  type ActionResult,
} from '@/lib/validation';
import { rateLimit } from '@/lib/rate-limit';
import { trackEvent } from '@/lib/analytics';

/**
 * Cart mutations.
 *
 * Every action re-reads stock from the database before writing. Availability
 * checked here is advisory — it produces a good error message — and is checked
 * again authoritatively inside the order transaction, because between adding
 * to a bag and paying, somebody else may take the last unit.
 */

const addSchema = z.object({
  variantId: uuidSchema,
  quantity: quantitySchema.default(1),
});

/** Sellable units for a variant right now. */
async function availableFor(variantId: string): Promise<{
  available: number;
  allowBackorder: boolean;
  exists: boolean;
}> {
  const rows = (await db.execute(sql`
    SELECT
      GREATEST(COALESCE(i.on_hand,0) - COALESCE(i.reserved,0), 0)::int AS available,
      COALESCE(i.allow_backorder, false) AS allow_backorder
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN inventory_items i ON i.variant_id = pv.id
    WHERE pv.id = ${variantId}
      AND pv.status = 'published' AND pv.deleted_at IS NULL
      AND p.status = 'published' AND p.deleted_at IS NULL
    LIMIT 1
  `)) as unknown as { available: number; allow_backorder: boolean }[];

  const row = rows[0];
  if (!row) return { available: 0, allowBackorder: false, exists: false };
  return {
    available: row.available,
    allowBackorder: row.allow_backorder,
    exists: true,
  };
}

export async function addToCart(input: {
  variantId: string;
  quantity?: number;
}): Promise<ActionResult<{ itemCount: number }>> {
  const limit = await rateLimit('cart-add', { limit: 60, windowSeconds: 60 });
  if (!limit.allowed) {
    return actionError('Too many requests. Please slow down for a moment.');
  }

  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return actionError('That item could not be added.');
  const { variantId, quantity } = parsed.data;

  const stock = await availableFor(variantId);
  if (!stock.exists) {
    return actionError('That product is no longer available.');
  }

  const cartId = await ensureCart();

  // How many of this variant are already in the bag, so the check applies to
  // the resulting total rather than to this request in isolation.
  const existingRows = await db
    .select({ quantity: cartItems.quantity })
    .from(cartItems)
    .where(
      and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)),
    )
    .limit(1);

  const desired = (existingRows[0]?.quantity ?? 0) + quantity;

  if (!stock.allowBackorder && desired > stock.available) {
    return actionError(
      stock.available === 0
        ? 'That size is out of stock.'
        : `Only ${stock.available} left — your bag already has ${existingRows[0]?.quantity ?? 0}.`,
    );
  }

  await db
    .insert(cartItems)
    .values({ cartId, variantId, quantity })
    .onConflictDoUpdate({
      target: [cartItems.cartId, cartItems.variantId],
      set: {
        quantity: sql`${cartItems.quantity} + ${quantity}`,
        updatedAt: new Date(),
      },
    });

  await trackEvent('add_to_cart', { variantId, quantity });

  revalidatePath('/cart');
  const cart = await getCart();
  return actionOk({ itemCount: cart.itemCount });
}

export async function updateCartItemQuantity(input: {
  itemId: string;
  quantity: number;
}): Promise<ActionResult> {
  const parsed = z
    .object({
      itemId: uuidSchema,
      quantity: z.coerce.number().int().min(0).max(99),
    })
    .safeParse(input);
  if (!parsed.success) return actionError('That quantity is not valid.');

  const { itemId, quantity } = parsed.data;
  const cart = await getCart();
  // Ownership check: the line must belong to THIS visitor's cart. Without it,
  // knowing any cart item id would let anyone edit a stranger's bag.
  const line = cart.lines.find((l) => l.id === itemId);
  if (!line) return actionError('That item is no longer in your bag.');

  if (quantity === 0) {
    await db.delete(cartItems).where(eq(cartItems.id, itemId));
    revalidatePath('/cart');
    return actionOk();
  }

  const stock = await availableFor(line.variantId);
  if (!stock.allowBackorder && quantity > stock.available) {
    return actionError(
      stock.available === 0
        ? 'That size is now out of stock.'
        : `Only ${stock.available} available.`,
    );
  }

  await db
    .update(cartItems)
    .set({ quantity, updatedAt: new Date() })
    .where(eq(cartItems.id, itemId));

  revalidatePath('/cart');
  return actionOk();
}

export async function removeCartItem(itemId: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(itemId).success) {
    return actionError('That item could not be removed.');
  }

  const cart = await getCart();
  const line = cart.lines.find((l) => l.id === itemId);
  if (!line) return actionOk();

  await db.delete(cartItems).where(eq(cartItems.id, itemId));
  await trackEvent('remove_from_cart', { variantId: line.variantId });

  revalidatePath('/cart');
  return actionOk();
}

export async function applyPromotionCode(code: string): Promise<ActionResult> {
  const limit = await rateLimit('promo-code', {
    limit: 15,
    windowSeconds: 300,
  });
  if (!limit.allowed) {
    return actionError('Too many attempts. Please try again shortly.');
  }

  const normalised = code.trim().toUpperCase();
  if (!normalised) return actionError('Enter a code.');

  const cart = await getCart();
  if (cart.lines.length === 0) {
    return actionError('Add something to your bag before applying a code.');
  }

  const rows = await db
    .select()
    .from(promotions)
    .where(eq(promotions.code, normalised))
    .limit(1);

  const pricedLines = cart.lines.map((l) => ({
    variantId: l.variantId,
    productId: l.productId,
    unitPrice: l.unitPrice,
    quantity: l.quantity,
    lineTotal: l.lineTotal,
    // Scope matching needs brand/category/collection, which getCart does not
    // expose on the view; re-pricing on read applies the code correctly, so a
    // successful store here is confirmed by the next read.
    brandId: '',
    categoryId: null,
    collectionIds: [],
  }));

  const check = checkPromotion(rows[0] ?? null, pricedLines);
  if (!check.valid && check.reason !== 'no_eligible_items') {
    return actionError(promotionRejectionMessage(check.reason));
  }

  await db
    .update(carts)
    .set({ promotionCode: normalised, updatedAt: new Date() })
    .where(eq(carts.id, cart.id));

  // Re-read with full scope information to confirm it actually discounts.
  const updated = await getCart();
  if (!updated.pricing.appliedPromotion) {
    await db
      .update(carts)
      .set({ promotionCode: null })
      .where(eq(carts.id, cart.id));
    return actionError('That code does not apply to anything in your bag.');
  }

  revalidatePath('/cart');
  revalidatePath('/checkout');
  return actionOk();
}

export async function removePromotionCode(): Promise<ActionResult> {
  const cart = await getCart();
  if (!cart.id) return actionOk();

  await db
    .update(carts)
    .set({ promotionCode: null, updatedAt: new Date() })
    .where(eq(carts.id, cart.id));

  revalidatePath('/cart');
  revalidatePath('/checkout');
  return actionOk();
}
