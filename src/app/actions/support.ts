'use server';

import { db } from '@/lib/db';
import { supportTickets } from '@/lib/db/schema';
import { currentUser } from '@/lib/auth';
import { generateReference } from '@/lib/tokens';
import { rateLimit } from '@/lib/rate-limit';
import {
  actionError,
  actionOk,
  contactSchema,
  toFieldErrors,
  type ActionResult,
} from '@/lib/validation';

/**
 * Contact form → support ticket.
 *
 * The reference is returned so the customer has something to quote, and it is
 * generated rather than sequential: `NL-A3F2-9KQP` tells an observer nothing
 * about how many tickets exist, and cannot be decremented to read somebody
 * else's. Knowing a reference is not authorisation on its own — staff routes
 * still check permissions.
 *
 * `userId` is taken from the session, never from the form, so a signed-in
 * customer's ticket is linked to them and an anonymous submission cannot claim
 * to belong to another account.
 */
export async function submitContactForm(
  _prev: ActionResult<{ reference: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ reference: string }>> {
  // Buckets by IP, so an office or a mobile carrier's NAT shares one budget.
  // Ten messages in fifteen minutes is already well beyond genuine use, while
  // five was low enough that a handful of colleagues could lock each other out.
  const limit = await rateLimit('contact', { limit: 10, windowSeconds: 900 });
  if (!limit.allowed) {
    return actionError(
      'Too many messages from this connection. Please try again shortly.',
    );
  }

  const parsed = contactSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone') ?? '',
    subject: formData.get('subject'),
    orderReference: formData.get('orderReference') ?? '',
    message: formData.get('message'),
  });

  if (!parsed.success) {
    return actionError('Please check the form.', toFieldErrors(parsed.error));
  }

  const user = await currentUser();
  const reference = generateReference('NLS');

  await db.insert(supportTickets).values({
    reference,
    userId: user?.id ?? null,
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone ?? null,
    subject: parsed.data.subject,
    message: parsed.data.message,
    orderReference: parsed.data.orderReference ?? null,
  });

  return actionOk({ reference });
}
