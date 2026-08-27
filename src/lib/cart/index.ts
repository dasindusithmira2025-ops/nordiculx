import 'server-only';
import { cookies } from 'next/headers';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { carts, cartItems, promotions } from '@/lib/db/schema';
import { generateToken, hashToken } from '@/lib/tokens';
import { isProduction } from '@/lib/env';
import { currentUser } from '@/lib/auth';
import {
  priceOrder,
  STANDARD_SHIPPING,
  type PricedLine,
  type PricingResult,
  type PromotionLike,
} from './pricing';

/**
 * Cart persistence.
 *
 * The cart lives in the database, identified by an opaque cookie token whose
 * hash is stored — the same discipline as sessions. Nothing about price or
 * quantity is trusted from the browser: the cookie identifies WHICH cart, and
 * every number is read from the database and re-priced on the server.
 *
 * `getCart` is read-only and safe to call from a server component.
 * `ensureCart` writes a cookie and may only be called from a server action or
 * route handler, where Next permits cookie mutation.
 */

const CART_COOKIE = 'nl_cart';
const CART_TTL_DAYS = 30;

export type CartLineView = {
  id: string;
  variantId: string;
  productId: string;
  slug: string;
  /** The variant's real SKU, snapshotted onto an order line at checkout. */
  sku: string;
  productName: string;
  variantName: string;
  brandName: string;
  imageUrl: string | null;
  unitPrice: number;
  listPrice: number;
  onSale: boolean;
  quantity: number;
  lineTotal: number;
  /** Sellable units right now, for the quantity ceiling in the UI. */
  available: number;
  /** True when the line exceeds available stock and must be resolved. */
  exceedsStock: boolean;
  inStock: boolean;
};

export type CartView = {
  id: string;
  itemCount: number;
  lines: CartLineView[];
  /**
   * The exact inputs this cart was priced with, including the scope fields a
   * scoped promotion matches on. Exposed so checkout can re-price from the same
   * values instead of rebuilding them — a second derivation is a second chance
   * to disagree with what the customer was shown.
   */
  pricedLines: PricedLine[];
  pricing: PricingResult;
  promotionCode: string | null;
  /** Set when a stored code is no longer valid, so the UI can explain itself. */
  promotionWarning: string | null;
  hasStockIssues: boolean;
};

export const EMPTY_CART: CartView = {
  id: '',
  itemCount: 0,
  lines: [],
  pricedLines: [],
  pricing: {
    subtotal: 0,
    discountTotal: 0,
    shippingTotal: 0,
    taxTotal: 0,
    grandTotal: 0,
    appliedPromotion: null,
    lineDiscounts: {},
  },
  promotionCode: null,
  promotionWarning: null,
  hasStockIssues: false,
};

async function readCartToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(CART_COOKIE)?.value ?? null;
}

/**
 * Returns the current cart id, creating one if needed, and sets the cookie.
 * Only valid inside a server action or route handler.
 */
export async function ensureCart(): Promise<string> {
  const store = await cookies();
  const existingToken = store.get(CART_COOKIE)?.value;
  const user = await currentUser();
  const expiresAt = new Date(Date.now() + CART_TTL_DAYS * 86_400_000);

  if (existingToken) {
    const rows = await db
      .select({ id: carts.id, userId: carts.userId })
      .from(carts)
      .where(
        and(
          eq(carts.tokenHash, hashToken(existingToken)),
          sql`${carts.convertedOrderId} IS NULL`,
        ),
      )
      .limit(1);

    const cart = rows[0];
    if (cart) {
      // Claim a guest cart for the customer who just signed in, and extend it.
      await db
        .update(carts)
        .set({
          expiresAt,
          updatedAt: new Date(),
          ...(user && !cart.userId ? { userId: user.id } : {}),
        })
        .where(eq(carts.id, cart.id));
      return cart.id;
    }
  }

  const token = generateToken();
  const [created] = await db
    .insert(carts)
    .values({
      userId: user?.id ?? null,
      tokenHash: hashToken(token),
      expiresAt,
    })
    .returning({ id: carts.id });

  store.set(CART_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    expires: expiresAt,
  });

  return created!.id;
}

type LineRow = {
  id: string;
  variant_id: string;
  product_id: string;
  slug: string;
  sku: string;
  product_name: string;
  variant_name: string;
  brand_name: string;
  brand_id: string;
  category_id: string | null;
  image_url: string | null;
  price: number;
  sale_price: number | null;
  quantity: number;
  available: number;
  allow_backorder: boolean;
  collection_ids: string[] | null;
};

/**
 * Reads and prices the current cart. Returns an empty cart rather than null so
 * callers never branch on "no cart yet" versus "cart with nothing in it".
 */
export async function getCart(): Promise<CartView> {
  const token = await readCartToken();
  if (!token) return EMPTY_CART;

  const cartRows = await db
    .select({
      id: carts.id,
      promotionCode: carts.promotionCode,
    })
    .from(carts)
    .where(
      and(
        eq(carts.tokenHash, hashToken(token)),
        sql`${carts.convertedOrderId} IS NULL`,
        sql`${carts.expiresAt} > NOW()`,
      ),
    )
    .limit(1);

  const cart = cartRows[0];
  if (!cart) return EMPTY_CART;

  const rows = (await db.execute(sql`
    SELECT
      ci.id, ci.variant_id, ci.quantity,
      pv.name AS variant_name, pv.sku, pv.price, pv.sale_price, pv.image_url,
      p.id AS product_id, p.slug, p.name AS product_name,
      b.id AS brand_id, b.name AS brand_name, p.category_id,
      GREATEST(COALESCE(i.on_hand,0) - COALESCE(i.reserved,0), 0)::int AS available,
      COALESCE(i.allow_backorder, false) AS allow_backorder,
      ARRAY(
        SELECT pc.collection_id FROM product_collections pc WHERE pc.product_id = p.id
      ) AS collection_ids
    FROM cart_items ci
    JOIN product_variants pv ON pv.id = ci.variant_id
    JOIN products p ON p.id = pv.product_id
    JOIN brands b ON b.id = p.brand_id
    LEFT JOIN inventory_items i ON i.variant_id = pv.id
    WHERE ci.cart_id = ${cart.id}
      AND pv.deleted_at IS NULL AND p.deleted_at IS NULL
    ORDER BY ci.created_at ASC
  `)) as unknown as LineRow[];

  const lines: CartLineView[] = rows.map((r) => {
    const unitPrice = r.sale_price ?? r.price;
    const inStock = r.available > 0 || r.allow_backorder;
    return {
      id: r.id,
      variantId: r.variant_id,
      productId: r.product_id,
      slug: r.slug,
      sku: r.sku,
      productName: r.product_name,
      variantName: r.variant_name,
      brandName: r.brand_name,
      imageUrl: r.image_url,
      unitPrice,
      listPrice: r.price,
      onSale: r.sale_price !== null && r.sale_price < r.price,
      quantity: r.quantity,
      lineTotal: unitPrice * r.quantity,
      available: r.available,
      inStock,
      exceedsStock: !r.allow_backorder && r.quantity > r.available,
    };
  });

  const pricedLines: PricedLine[] = rows.map((r) => {
    const unitPrice = r.sale_price ?? r.price;
    return {
      variantId: r.variant_id,
      productId: r.product_id,
      unitPrice,
      quantity: r.quantity,
      lineTotal: unitPrice * r.quantity,
      brandId: r.brand_id,
      categoryId: r.category_id,
      collectionIds: r.collection_ids ?? [],
    };
  });

  // The stored code is revalidated on every read — a code that expired while
  // the cart sat open stops applying, and the customer is told why.
  let promotion: PromotionLike | null = null;
  let promotionWarning: string | null = null;

  if (cart.promotionCode) {
    const promoRows = await db
      .select()
      .from(promotions)
      .where(eq(promotions.code, cart.promotionCode))
      .limit(1);
    promotion = promoRows[0] ?? null;
  }

  const pricing = priceOrder({
    lines: pricedLines,
    promotion,
    shippingRate: STANDARD_SHIPPING,
  });

  if (cart.promotionCode && !pricing.appliedPromotion) {
    promotionWarning = `The code ${cart.promotionCode} no longer applies to your bag.`;
  }

  return {
    id: cart.id,
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    lines,
    pricedLines,
    pricing,
    promotionCode: cart.promotionCode,
    promotionWarning,
    hasStockIssues: lines.some((l) => l.exceedsStock || !l.inStock),
  };
}

/** Number of units in the bag. Cheap enough for the header on every request. */
export async function getCartCount(): Promise<number> {
  const token = await readCartToken();
  if (!token) return 0;

  const rows = await db
    .select({
      count: sql<number>`COALESCE(SUM(${cartItems.quantity}), 0)::int`,
    })
    .from(cartItems)
    .innerJoin(carts, eq(carts.id, cartItems.cartId))
    .where(
      and(
        eq(carts.tokenHash, hashToken(token)),
        sql`${carts.convertedOrderId} IS NULL`,
        sql`${carts.expiresAt} > NOW()`,
      ),
    );

  return rows[0]?.count ?? 0;
}

/** Marks a cart as converted so it can never be re-priced or reused. */
export async function markCartConverted(cartId: string, orderId: string) {
  await db
    .update(carts)
    .set({ convertedOrderId: orderId, updatedAt: new Date() })
    .where(eq(carts.id, cartId));
}

/** Clears the cart cookie — called after checkout completes. */
export async function clearCartCookie() {
  const store = await cookies();
  store.delete(CART_COOKIE);
}
