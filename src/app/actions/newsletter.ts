'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { newsletterSubscribers } from '@/lib/db/schema';
import { generateToken, hashToken } from '@/lib/tokens';
import {
  newsletterSchema,
  actionError,
  actionOk,
  toFieldErrors,
  type ActionResult,
} from '@/lib/validation';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Newsletter subscription.
 *
 * Deliberately idempotent and deliberately vague on success: re-subscribing an
 * existing address updates the same row and returns the same message as a new
 * subscription. Telling an anonymous visitor "that address is already
 * subscribed" would turn the form into an address-membership oracle.
 */
export async function subscribeToNewsletter(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const limit = await rateLimit('newsletter', { limit: 5, windowSeconds: 300 });
  if (!limit.allowed) {
    return actionError('Too many attempts. Please try again in a few minutes.');
  }

  const parsed = newsletterSchema.safeParse({
    email: formData.get('email'),
    source: formData.get('source') ?? 'footer',
    consent: formData.get('consent') ?? true,
  });

  if (!parsed.success) {
    return actionError('Please check the form.', toFieldErrors(parsed.error));
  }

  const { email, source } = parsed.data;
  const token = generateToken();

  await db
    .insert(newsletterSubscribers)
    .values({
      email,
      source,
      unsubscribeTokenHash: hashToken(token),
      consentedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: newsletterSubscribers.email,
      set: {
        // Re-subscribing clears a previous unsubscribe and re-records consent.
        unsubscribedAt: null,
        consentedAt: new Date(),
        source,
      },
    });

  return actionOk();
}

/** Unsubscribe by token. Idempotent, and safe to call on an unknown token. */
export async function unsubscribeFromNewsletter(
  token: string,
): Promise<ActionResult> {
  if (!token) return actionError('This unsubscribe link is not valid.');

  const result = await db
    .update(newsletterSubscribers)
    .set({ unsubscribedAt: new Date() })
    .where(eq(newsletterSubscribers.unsubscribeTokenHash, hashToken(token)))
    .returning({ id: newsletterSubscribers.id });

  if (result.length === 0) {
    return actionError('This unsubscribe link is not valid or has expired.');
  }
  return actionOk();
}
