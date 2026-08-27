'use server';

import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { orders } from '@/lib/db/schema';
import { generateToken, hashToken } from '@/lib/tokens';
import { sendMail } from '@/lib/mail';
import {
  accountOrderLookupEmail,
  guestOrderAccessEmail,
} from '@/lib/mail/templates';
import { rateLimit } from '@/lib/rate-limit';
import {
  actionError,
  actionOk,
  emailSchema,
  type ActionResult,
} from '@/lib/validation';

/**
 * Guest order lookup.
 *
 * The reference plus the email address is NOT treated as a credential that
 * unlocks the order on the spot — both appear on a receipt, a forwarded email or
 * a shared screen. Instead a fresh single-purpose link is emailed to the address
 * already on the order, so only somebody who controls that inbox can read it.
 *
 * The response is identical whether or not anything matched. Any difference —
 * in wording, in status, or in how long it takes — would turn this form into an
 * oracle for which references exist and which address placed them.
 */
export async function requestOrderLink(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const limit = await rateLimit('order-lookup', {
    limit: 5,
    windowSeconds: 900,
  });
  if (!limit.allowed) {
    return actionError('Too many lookups. Please try again shortly.');
  }

  const referenceRaw = formData.get('reference');
  const reference =
    typeof referenceRaw === 'string' ? referenceRaw.trim().toUpperCase() : '';
  const parsedEmail = emailSchema.safeParse(formData.get('email'));

  if (!reference || !parsedEmail.success) {
    return actionError('Please check the form.', {
      ...(reference ? {} : { reference: 'Enter your order reference' }),
      ...(parsedEmail.success ? {} : { email: 'Enter a valid email address' }),
    });
  }

  const rows = await db
    .select({
      id: orders.id,
      reference: orders.reference,
      email: orders.email,
      userId: orders.userId,
      hasGuestToken: isNotNull(orders.guestAccessTokenHash),
    })
    .from(orders)
    .where(
      and(
        eq(orders.reference, reference),
        // Emails are stored lowercased, and the schema lowercases the input.
        eq(orders.email, parsedEmail.data),
      ),
    )
    .limit(1);

  const order = rows[0];

  if (order) {
    if (order.userId) {
      await sendMail(
        accountOrderLookupEmail({
          email: order.email,
          reference: order.reference,
        }),
      );
    } else {
      // A fresh token each time, replacing any previous one. An old link stops
      // working, which is what somebody re-requesting access usually wants.
      const token = generateToken();
      await db
        .update(orders)
        .set({ guestAccessTokenHash: hashToken(token), updatedAt: sql`NOW()` })
        .where(eq(orders.id, order.id));

      await sendMail(
        guestOrderAccessEmail({
          email: order.email,
          reference: order.reference,
          token,
        }),
      );
    }
  }

  // Same result either way. See the note at the top of this file.
  return actionOk();
}
