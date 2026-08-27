'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { products, reviews } from '@/lib/db/schema';
import { currentUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { refreshProductRating, reviewEligibility } from '@/lib/reviews';
import {
  actionError,
  actionOk,
  reviewSchema,
  toFieldErrors,
  type ActionResult,
} from '@/lib/validation';

/**
 * Customer review submission.
 *
 * Everything that decides whether a review is allowed, and whether it carries
 * the verified badge, is resolved on the server from the customer's own
 * delivered orders. The form supplies a rating, a title and a body; it cannot
 * supply an author, a status or a verification.
 *
 * Abuse controls, in the order they bite:
 *   · sign-in required          — no anonymous submissions at all
 *   · delivered order required  — no review without a purchase that arrived
 *   · one row per product/user  — the unique index; a resubmit edits, never adds
 *   · resubmission re-queues    — an approved review cannot be swapped for
 *                                 different text after moderation
 *   · rate limited              — a compromised account cannot flood the queue
 */
export async function submitReview(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) {
    return actionError('Sign in to write a review.');
  }

  const limit = await rateLimit('review', {
    limit: 5,
    windowSeconds: 3600,
    key: user.id,
  });
  if (!limit.allowed) {
    return actionError('Too many reviews just now. Please try again later.');
  }

  const parsed = reviewSchema.safeParse({
    productId: formData.get('productId'),
    rating: formData.get('rating'),
    title: formData.get('title') ?? '',
    body: formData.get('body') ?? '',
  });
  if (!parsed.success) {
    return actionError(
      'Check the highlighted fields.',
      toFieldErrors(parsed.error),
    );
  }

  const eligibility = await reviewEligibility(user.id, parsed.data.productId);
  if (!eligibility.canReview) {
    // Deliberately the same message for "no such product" and "never
    // delivered": neither tells an attacker anything about the catalogue or
    // about somebody else's order history.
    return actionError(
      'Reviews are only accepted from customers who have received the product.',
    );
  }

  const row = {
    productId: parsed.data.productId,
    userId: user.id,
    rating: parsed.data.rating,
    title: parsed.data.title?.trim() || null,
    body: parsed.data.body,
    verifiedPurchase: true,
    verifiedOrderItemId: eligibility.verifiedOrderItemId,
    // Every submission enters moderation, including an edit of an already
    // published one — otherwise an approved review is a slot to publish
    // arbitrary text into later.
    status: 'pending' as const,
    moderatedBy: null,
    moderatedAt: null,
    moderationNote: null,
    updatedAt: new Date(),
  };

  const product = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.id, parsed.data.productId))
    .limit(1);
  if (!product[0]) {
    return actionError(
      'Reviews are only accepted from customers who have received the product.',
    );
  }

  await db.transaction(async (tx) => {
    if (eligibility.existing) {
      await tx
        .update(reviews)
        .set(row)
        .where(eq(reviews.id, eligibility.existing.id));
    } else {
      // `onConflictDoUpdate` on the product/user unique index, so two
      // simultaneous submissions produce one review rather than a constraint
      // error shown to the customer.
      await tx
        .insert(reviews)
        .values(row)
        .onConflictDoUpdate({
          target: [reviews.productId, reviews.userId],
          set: row,
        });
    }

    // Pulling an approved review back into moderation lowers the published
    // count, so the aggregate has to move with it.
    await refreshProductRating(parsed.data.productId, tx);
  });

  revalidatePath(`/product/${product[0].slug}`);
  revalidatePath('/admin/reviews');
  return actionOk();
}

/** Withdraws a customer's own review. */
export async function deleteOwnReview(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return actionError('Sign in first.');

  const productId = String(formData.get('productId') ?? '');
  const product = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product[0]) return actionError('That review could not be removed.');

  await db.transaction(async (tx) => {
    // Scoped to their own user id, so a crafted product id can only ever
    // delete the caller's own row.
    await tx
      .delete(reviews)
      .where(
        and(eq(reviews.productId, productId), eq(reviews.userId, user.id)),
      );
    await refreshProductRating(productId, tx);
  });

  revalidatePath(`/product/${product[0].slug}`);
  revalidatePath('/admin/reviews');
  return actionOk();
}
