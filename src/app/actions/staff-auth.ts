'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { createSession, destroySession, currentStaffSession } from '@/lib/auth';
import { hashPassword, needsRehash, verifyPassword } from '@/lib/auth/password';
import { clearRateLimit, rateLimit } from '@/lib/rate-limit';
import { recordAudit } from '@/lib/admin/audit';
import {
  actionError,
  loginSchema,
  toFieldErrors,
  type ActionResult,
} from '@/lib/validation';

/**
 * Staff sign-in.
 *
 * A separate cookie and a separate session from the customer one, so somebody
 * signed in to shop is not thereby signed in to the admin, and revoking one does
 * not touch the other.
 *
 * The limits here are deliberately tighter than the storefront's: an admin
 * password is worth far more than a customer's, and there is no legitimate
 * reason for a staff member to fail five times a minute.
 */

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 30;
const GENERIC_FAILURE = 'Those credentials were not recognised.';

function safeNext(raw: FormDataEntryValue | null): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value.startsWith('/admin')) return '/admin';
  // Requiring the `/admin` prefix is itself the open-redirect guard: a
  // protocol-relative URL (`//evil.example`) cannot satisfy it.
  return value;
}

export async function staffSignIn(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const emailRaw = formData.get('email');
  const email =
    typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';

  const limit = await rateLimit('staff-signin', {
    limit: 5,
    windowSeconds: 300,
    key: email,
  });
  if (!limit.allowed) {
    return actionError(
      `Too many attempts. Try again in ${Math.ceil(limit.resetIn / 60)} minutes.`,
    );
  }

  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return actionError('Please check the form.', toFieldErrors(parsed.error));
  }

  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);
  const user = rows[0];

  // A customer account, a deleted account and a non-existent one are all
  // reported identically: the admin login must not confirm that an address
  // belongs to staff.
  if (!user || user.deletedAt || !user.staffRole) {
    await verifyPassword(parsed.data.password, 'scrypt$1$1$1$AA==$AA==');
    return actionError(GENERIC_FAILURE);
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return actionError(
      'This account is locked after too many failed attempts. Contact an owner.',
    );
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);

  if (!valid) {
    const failed = user.failedLoginCount + 1;
    await db
      .update(users)
      .set({
        failedLoginCount: failed,
        lockedUntil:
          failed >= MAX_FAILED_LOGINS
            ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
            : user.lockedUntil,
      })
      .where(eq(users.id, user.id));

    return actionError(GENERIC_FAILURE);
  }

  await db
    .update(users)
    .set({
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      ...(needsRehash(user.passwordHash)
        ? { passwordHash: await hashPassword(parsed.data.password) }
        : {}),
    })
    .where(eq(users.id, user.id));

  await clearRateLimit('staff-signin', parsed.data.email);
  await createSession(user.id, { isStaff: true });

  // Every staff sign-in is auditable — this is the event a breach investigation
  // starts from.
  await recordAudit({
    actor: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      staffRole: user.staffRole,
      emailVerifiedAt: user.emailVerifiedAt,
      mfaEnabledAt: user.mfaEnabledAt,
    },
    action: 'staff.signed_in',
    entityType: 'user',
    entityId: user.id,
  });

  redirect(safeNext(formData.get('next')));
}

export async function staffSignOut(): Promise<void> {
  const session = await currentStaffSession();
  if (session) {
    await recordAudit({
      actor: session.user,
      action: 'staff.signed_out',
      entityType: 'user',
      entityId: session.user.id,
    });
  }
  await destroySession({ staff: true });
  redirect('/admin/login');
}
