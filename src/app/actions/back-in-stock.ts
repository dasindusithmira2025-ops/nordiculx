'use server';

import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { subscribeToRestock } from '@/lib/back-in-stock';
import {
  actionError,
  actionOk,
  emailSchema,
  uuidSchema,
  type ActionResult,
} from '@/lib/validation';

/**
 * Asking to be told when something returns.
 *
 * Open to guests: requiring an account to be told about stock would lose most
 * of the requests. The email is the identity, and the unique index on
 * (variant, email) makes a repeat request idempotent rather than a duplicate.
 *
 * Rate limited by IP because it is unauthenticated and writes a row.
 */
const schema = z.object({
  variantId: uuidSchema,
  email: emailSchema,
});

export async function subscribeBackInStock(
  _previous: ActionResult<{ alreadyInStock: boolean } | undefined> | null,
  formData: FormData,
): Promise<ActionResult<{ alreadyInStock: boolean }>> {
  const limit = await rateLimit('back-in-stock', {
    limit: 20,
    windowSeconds: 3600,
  });
  if (!limit.allowed) {
    return actionError('Too many requests just now. Please try again later.');
  }

  const parsed = schema.safeParse({
    variantId: formData.get('variantId'),
    email: formData.get('email'),
  });
  if (!parsed.success) {
    return actionError('Enter a valid email address.');
  }

  const user = await currentUser();
  const result = await subscribeToRestock({
    variantId: parsed.data.variantId,
    email: parsed.data.email,
    userId: user?.id ?? null,
  });

  if (!result.ok) {
    // Same message either way: whether a variant id exists is not something an
    // unauthenticated form should confirm.
    return actionError('That product could not be found.');
  }

  return actionOk({ alreadyInStock: result.alreadyInStock });
}
