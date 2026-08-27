'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { wishlistItems } from '@/lib/db/schema';
import { currentUser } from '@/lib/auth';
import {
  uuidSchema,
  actionError,
  actionOk,
  type ActionResult,
} from '@/lib/validation';

/**
 * Wishlist mutations.
 *
 * Always scoped to the signed-in user's own id from the session — never to a
 * user id supplied by the caller, which would be a textbook IDOR.
 */

export async function toggleWishlist(
  productId: string,
): Promise<ActionResult<{ wishlisted: boolean }>> {
  if (!uuidSchema.safeParse(productId).success) {
    return actionError('That product could not be saved.');
  }

  const user = await currentUser();
  if (!user) {
    return actionError('Sign in to save products to your wishlist.');
  }

  const existing = await db
    .select({ id: wishlistItems.id })
    .from(wishlistItems)
    .where(
      and(
        eq(wishlistItems.userId, user.id),
        eq(wishlistItems.productId, productId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db.delete(wishlistItems).where(eq(wishlistItems.id, existing[0].id));
    revalidatePath('/account/wishlist');
    return actionOk({ wishlisted: false });
  }

  await db
    .insert(wishlistItems)
    .values({ userId: user.id, productId })
    // A double-click must not throw on the unique index.
    .onConflictDoNothing();

  revalidatePath('/account/wishlist');
  return actionOk({ wishlisted: true });
}

export async function removeFromWishlist(
  productId: string,
): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return actionError('Sign in to manage your wishlist.');

  await db
    .delete(wishlistItems)
    .where(
      and(
        eq(wishlistItems.userId, user.id),
        eq(wishlistItems.productId, productId),
      ),
    );

  revalidatePath('/account/wishlist');
  return actionOk();
}
