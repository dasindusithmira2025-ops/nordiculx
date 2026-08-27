import 'server-only';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  backInStockSubscriptions,
  brands,
  inventoryItems,
  productVariants,
  products,
} from '@/lib/db/schema';
import { sendMail } from '@/lib/mail';
import { backInStockEmail } from '@/lib/mail/templates';
import { generateToken, hashToken } from '@/lib/tokens';

/**
 * Back-in-stock notifications.
 *
 * Subscribing is idempotent per (variant, email) — the unique index enforces
 * it, and a repeat request re-arms an already-notified row rather than adding
 * a second. `notifiedAt` is what stops a restock from mailing the same person
 * twice: it is stamped in the same statement that selects the recipients, so
 * two concurrent restocks cannot both claim the same subscriber.
 *
 * Unsubscribing goes through a hashed token. The mailed link cannot be
 * reconstructed from a database dump, and it identifies exactly one row, so no
 * signed-in session is needed to act on it.
 */

export type SubscribeResult =
  | { ok: true; alreadyInStock: boolean }
  | { ok: false; reason: 'unknown_variant' };

export async function subscribeToRestock(input: {
  variantId: string;
  email: string;
  userId: string | null;
}): Promise<SubscribeResult> {
  const rows = await db
    .select({
      variantId: productVariants.id,
      available: sql<number>`COALESCE(${inventoryItems.onHand} - ${inventoryItems.reserved}, 0)`,
    })
    .from(productVariants)
    .leftJoin(inventoryItems, eq(inventoryItems.variantId, productVariants.id))
    .where(eq(productVariants.id, input.variantId))
    .limit(1);

  const variant = rows[0];
  if (!variant) return { ok: false, reason: 'unknown_variant' };

  // Already sellable: no subscription is written, so the list never fills up
  // with requests that will never fire.
  if (variant.available > 0) return { ok: true, alreadyInStock: true };

  const token = generateToken();
  await db
    .insert(backInStockSubscriptions)
    .values({
      variantId: input.variantId,
      email: input.email,
      userId: input.userId,
      unsubscribeTokenHash: hashToken(token),
    })
    .onConflictDoUpdate({
      target: [
        backInStockSubscriptions.variantId,
        backInStockSubscriptions.email,
      ],
      // Re-arming: a customer who asked again after being notified, or after
      // unsubscribing, is waiting again.
      set: {
        notifiedAt: null,
        unsubscribedAt: null,
        userId: input.userId,
      },
    });

  return { ok: true, alreadyInStock: false };
}

/**
 * Notifies everyone waiting on a variant that is now sellable.
 *
 * Called from every path that raises stock. Safe to call when nothing changed:
 * it does nothing when the variant is still out of stock or nobody is waiting.
 *
 * Returns how many messages were sent, which is what the admin surfaces.
 */
export async function notifyRestock(variantId: string): Promise<number> {
  const rows = await db
    .select({
      available: sql<number>`COALESCE(${inventoryItems.onHand} - ${inventoryItems.reserved}, 0)`,
      productName: products.name,
      productSlug: products.slug,
      brandName: brands.name,
      variantName: productVariants.name,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(brands, eq(brands.id, products.brandId))
    .leftJoin(inventoryItems, eq(inventoryItems.variantId, productVariants.id))
    .where(eq(productVariants.id, variantId))
    .limit(1);

  const variant = rows[0];
  if (!variant || variant.available <= 0) return 0;

  // Claim-then-send: stamping `notified_at` in the UPDATE that returns the
  // recipients means a second concurrent restock selects nobody, so the same
  // restock event cannot mail one person twice.
  const claimed = await db
    .update(backInStockSubscriptions)
    .set({ notifiedAt: new Date() })
    .where(
      and(
        eq(backInStockSubscriptions.variantId, variantId),
        isNull(backInStockSubscriptions.notifiedAt),
        isNull(backInStockSubscriptions.unsubscribedAt),
      ),
    )
    .returning({
      id: backInStockSubscriptions.id,
      email: backInStockSubscriptions.email,
    });

  if (claimed.length === 0) return 0;

  // A fresh token per notification: the one from sign-up was never stored in
  // plaintext, so it cannot be put in this email.
  await Promise.all(
    claimed.map(async (subscription) => {
      const token = generateToken();
      await db
        .update(backInStockSubscriptions)
        .set({ unsubscribeTokenHash: hashToken(token) })
        .where(eq(backInStockSubscriptions.id, subscription.id));

      await sendMail(
        backInStockEmail({
          to: subscription.email,
          productName: variant.productName,
          brandName: variant.brandName,
          variantName: variant.variantName,
          productSlug: variant.productSlug,
          unsubscribeToken: token,
        }),
      );
    }),
  );

  return claimed.length;
}

/** Marks a subscription as unsubscribed. Returns false for an unknown token. */
export async function unsubscribeFromRestock(token: string): Promise<boolean> {
  const updated = await db
    .update(backInStockSubscriptions)
    .set({ unsubscribedAt: new Date() })
    .where(eq(backInStockSubscriptions.unsubscribeTokenHash, hashToken(token)))
    .returning({ id: backInStockSubscriptions.id });

  return updated.length > 0;
}

/** How many people are waiting on a variant. Shown on the admin product list. */
export async function waitingCount(variantId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(backInStockSubscriptions)
    .where(
      and(
        eq(backInStockSubscriptions.variantId, variantId),
        isNull(backInStockSubscriptions.notifiedAt),
        isNull(backInStockSubscriptions.unsubscribedAt),
      ),
    );
  return rows[0]?.count ?? 0;
}
