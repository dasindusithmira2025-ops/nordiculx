'use server';

import { revalidatePath } from 'next/cache';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { addresses } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth';
import {
  actionError,
  actionOk,
  addressSchema,
  toFieldErrors,
  uuidSchema,
  type ActionResult,
} from '@/lib/validation';

/**
 * Saved address book.
 *
 * Every statement is scoped by `userId` from the session as well as by the row
 * id, so a guessed or stolen address id belonging to another customer matches
 * nothing. Checking ownership in a separate SELECT first would leave a window
 * between the check and the write; putting the owner in the WHERE clause of the
 * write itself cannot race.
 */

function parse(formData: FormData) {
  return addressSchema.safeParse({
    recipientName: formData.get('recipientName'),
    phone: formData.get('phone'),
    line1: formData.get('line1'),
    line2: formData.get('line2') ?? '',
    city: formData.get('city'),
    district: formData.get('district') ?? '',
    postalCode: formData.get('postalCode') ?? '',
    country: formData.get('country') || 'LK',
  });
}

/** Clears the default flag on every other address for this user. */
async function clearOtherDefaults(userId: string, keepId?: string) {
  await db
    .update(addresses)
    .set({ isDefault: false })
    .where(
      keepId
        ? and(eq(addresses.userId, userId), ne(addresses.id, keepId))
        : eq(addresses.userId, userId),
    );
}

export async function saveAddress(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser('/account/addresses');

  const parsed = parse(formData);
  if (!parsed.success) {
    return actionError('Please check the form.', toFieldErrors(parsed.error));
  }

  const idRaw = formData.get('id');
  const label = (formData.get('label') as string | null)?.trim() || null;
  const makeDefault = formData.get('isDefault') !== null;

  const values = {
    recipientName: parsed.data.recipientName,
    phone: parsed.data.phone,
    line1: parsed.data.line1,
    line2: parsed.data.line2 || null,
    city: parsed.data.city,
    district: parsed.data.district || null,
    postalCode: parsed.data.postalCode || null,
    country: parsed.data.country,
    label,
  };

  if (typeof idRaw === 'string' && idRaw) {
    if (!uuidSchema.safeParse(idRaw).success) {
      return actionError('That address could not be saved.');
    }

    const updated = await db
      .update(addresses)
      .set({ ...values, isDefault: makeDefault, updatedAt: new Date() })
      // Ownership is part of the WHERE clause, not a prior check.
      .where(and(eq(addresses.id, idRaw), eq(addresses.userId, user.id)))
      .returning({ id: addresses.id });

    if (!updated[0]) return actionError('That address could not be saved.');
    if (makeDefault) await clearOtherDefaults(user.id, updated[0].id);
  } else {
    const existing = await db
      .select({ id: addresses.id })
      .from(addresses)
      // Live addresses only: somebody who deleted all of theirs and adds a new
      // one has no default, so this must be treated as their first.
      .where(and(eq(addresses.userId, user.id), isNull(addresses.deletedAt)))
      .limit(1);

    // The first address a customer saves becomes the default automatically;
    // otherwise checkout would have nothing preselected.
    const isDefault = makeDefault || existing.length === 0;

    const inserted = await db
      .insert(addresses)
      .values({ ...values, userId: user.id, isDefault })
      .returning({ id: addresses.id });

    if (isDefault && inserted[0]) {
      await clearOtherDefaults(user.id, inserted[0].id);
    }
  }

  revalidatePath('/account/addresses');
  revalidatePath('/checkout');
  return actionOk();
}

export async function setDefaultAddress(id: string): Promise<ActionResult> {
  const user = await requireUser('/account/addresses');
  if (!uuidSchema.safeParse(id).success) {
    return actionError('That address could not be updated.');
  }

  const updated = await db
    .update(addresses)
    .set({ isDefault: true, updatedAt: new Date() })
    .where(and(eq(addresses.id, id), eq(addresses.userId, user.id)))
    .returning({ id: addresses.id });

  if (!updated[0]) return actionError('That address could not be updated.');

  await clearOtherDefaults(user.id, id);

  revalidatePath('/account/addresses');
  revalidatePath('/checkout');
  return actionOk();
}

/**
 * Soft delete.
 *
 * The row is kept because past orders copied their address at purchase time but
 * a hard delete would still break any report joining back to it. If the deleted
 * address was the default, the most recent survivor is promoted so checkout is
 * never left with no default at all.
 */
export async function deleteAddress(id: string): Promise<ActionResult> {
  const user = await requireUser('/account/addresses');
  if (!uuidSchema.safeParse(id).success) {
    return actionError('That address could not be removed.');
  }

  const deleted = await db
    .update(addresses)
    .set({ deletedAt: new Date(), isDefault: false })
    .where(
      and(
        eq(addresses.id, id),
        eq(addresses.userId, user.id),
        // Deleting twice must not resurrect and re-stamp an already-deleted row.
        isNull(addresses.deletedAt),
      ),
    )
    .returning({ id: addresses.id });

  if (!deleted[0]) return actionError('That address could not be removed.');

  // Only live addresses are candidates for promotion — without the deletedAt
  // filter a previously deleted address could be made the default.
  const live = await db
    .select({ id: addresses.id, isDefault: addresses.isDefault })
    .from(addresses)
    .where(and(eq(addresses.userId, user.id), isNull(addresses.deletedAt)))
    .orderBy(desc(addresses.createdAt));

  if (live.length > 0 && !live.some((a) => a.isDefault)) {
    await db
      .update(addresses)
      .set({ isDefault: true })
      .where(and(eq(addresses.id, live[0]!.id), eq(addresses.userId, user.id)));
  }

  revalidatePath('/account/addresses');
  revalidatePath('/checkout');
  return actionOk();
}
