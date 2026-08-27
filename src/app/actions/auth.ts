'use server';

import { redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import {
  createSession,
  currentSession,
  destroySession,
  revokeAllSessions,
} from '@/lib/auth';
import { hashPassword, needsRehash, verifyPassword } from '@/lib/auth/password';
import { clearRateLimit, rateLimit } from '@/lib/rate-limit';
import {
  actionError,
  actionOk,
  loginSchema,
  passwordSchema,
  registerSchema,
  toFieldErrors,
  type ActionResult,
} from '@/lib/validation';

/**
 * Customer authentication.
 *
 * Rules that hold throughout, and are the reason several things here look
 * deliberately unhelpful:
 *
 *   - A failed sign-in says the same thing whether the address is unknown or
 *     the password is wrong. Distinguishing them turns the form into an
 *     account-existence oracle.
 *   - Registration with an existing address behaves like a success and sends
 *     nothing new, for the same reason.
 *   - Lockout is per account (`failed_login_count` / `locked_until`) AND per
 *     connection (rate limit). Either alone is bypassable: account-only lets one
 *     attacker spray many accounts, IP-only lets a botnet hammer one account.
 */

const MAX_FAILED_LOGINS = 8;
const LOCKOUT_MINUTES = 15;

/** The same message for every authentication failure. */
const GENERIC_FAILURE = 'That email address and password do not match.';

/**
 * Validates a post-login destination.
 *
 * Only same-site absolute paths are honoured. Without this, `?next=` is an open
 * redirect: an attacker sends a real Nordic Lux login link that bounces the
 * customer to a look-alike site immediately after they authenticate.
 */
function safeNext(raw: FormDataEntryValue | null): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value.startsWith('/')) return '/account';
  // `//evil.com` and `/\evil.com` are protocol-relative URLs, not local paths.
  if (value.startsWith('//') || value.startsWith('/\\')) return '/account';
  return value;
}

export async function signIn(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const emailRaw = formData.get('email');
  const email =
    typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';

  // Bucketed by email as well as IP, so one attacker cannot exhaust the shared
  // per-IP budget for everybody behind the same NAT.
  const limit = await rateLimit('signin', {
    limit: 10,
    windowSeconds: 300,
    key: email,
  });
  if (!limit.allowed) {
    return actionError(
      `Too many attempts. Please try again in ${Math.ceil(limit.resetIn / 60)} minutes.`,
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

  // A soft-deleted account behaves exactly like a non-existent one.
  if (!user || user.deletedAt) {
    // The password is still verified against a dummy hash so that a missing
    // account does not return measurably faster than a wrong password.
    await verifyPassword(parsed.data.password, 'scrypt$1$1$1$AA==$AA==');
    return actionError(GENERIC_FAILURE);
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return actionError(
      'This account is temporarily locked after too many failed attempts. Try again shortly.',
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

  // Successful authentication clears the throttling state and, if the stored
  // hash predates the current cost parameters, silently upgrades it.
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

  // Honest users reset their own window. Without this, somebody who mistyped a
  // few times and then signed in correctly stays throttled for the rest of the
  // window — and a shared NAT makes that far more common than it sounds.
  await clearRateLimit('signin', parsed.data.email);

  await createSession(user.id);

  redirect(safeNext(formData.get('next')));
}

export async function register(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const limit = await rateLimit('register', { limit: 5, windowSeconds: 900 });
  if (!limit.allowed) {
    return actionError('Too many attempts. Please try again shortly.');
  }

  const parsed = registerSchema.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    email: formData.get('email'),
    password: formData.get('password'),
    marketingOptIn: formData.get('marketingOptIn') ?? undefined,
  });
  if (!parsed.success) {
    return actionError('Please check the form.', toFieldErrors(parsed.error));
  }

  const { firstName, lastName, email, password, marketingOptIn } = parsed.data;

  const inserted = await db
    .insert(users)
    .values({
      email,
      passwordHash: await hashPassword(password),
      firstName,
      lastName,
      marketingOptInAt: marketingOptIn ? new Date() : null,
    })
    // The unique index on email is the real guard. Doing nothing on conflict
    // means a duplicate registration neither throws nor confirms that the
    // address is already registered.
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });

  const created = inserted[0];

  if (!created) {
    // The address already exists. Deliberately indistinguishable from success
    // from the client's point of view — no session is created, and the customer
    // is sent to sign in, which is where they need to be either way.
    redirect('/account/login?existing=1');
  }

  await createSession(created.id);
  redirect(safeNext(formData.get('next')));
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect('/');
}

/**
 * Password change for a signed-in customer.
 *
 * Requires the current password even though the session is already
 * authenticated: it makes a hijacked session unable to lock the real owner out.
 * Every OTHER session is revoked on success, which is how the owner evicts an
 * attacker.
 */
export async function changePassword(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await currentSession();
  if (!session) return actionError('Please sign in again.');

  const limit = await rateLimit('password-change', {
    limit: 5,
    windowSeconds: 900,
    key: session.user.id,
  });
  if (!limit.allowed) {
    return actionError('Too many attempts. Please try again shortly.');
  }

  const currentRaw = formData.get('currentPassword');
  const parsed = passwordSchema.safeParse(formData.get('newPassword'));
  if (!parsed.success) {
    return actionError('Please check the form.', {
      newPassword: parsed.error.issues[0]?.message ?? 'Invalid password',
    });
  }

  const rows = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  const stored = rows[0]?.passwordHash;
  if (!stored) return actionError('Please sign in again.');

  const ok =
    typeof currentRaw === 'string' &&
    (await verifyPassword(currentRaw, stored));
  if (!ok) {
    return actionError('Please check the form.', {
      currentPassword: 'That is not your current password.',
    });
  }

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(parsed.data),
      updatedAt: sql`now()`,
    })
    .where(eq(users.id, session.user.id));

  // Keeps the caller signed in on this device, signs every other one out.
  await revokeAllSessions(session.user.id, {
    exceptSessionId: session.sessionId,
  });

  return actionOk();
}
