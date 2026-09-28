import 'server-only';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, verificationTokens } from '@/lib/db/schema';
import { generateToken, hashToken } from '@/lib/tokens';

/**
 * Single-use password-reset links. Same discipline as every other token: the
 * raw value is emailed once and only its hash is stored. A newer link revokes
 * any older one still outstanding, so only the latest email works.
 */

const RESET_TTL_MINUTES = 60;

/** Issues a reset token for an address, or null when no live account has it. */
export async function issuePasswordResetToken(email: string) {
  const rows = await db
    .select({ id: users.id, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  const user = rows[0];
  if (!user || user.deletedAt) return null;

  const token = generateToken();
  await db.transaction(async (tx) => {
    await tx
      .update(verificationTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(verificationTokens.userId, user.id),
          eq(verificationTokens.purpose, 'password_reset'),
          isNull(verificationTokens.consumedAt),
        ),
      );
    await tx.insert(verificationTokens).values({
      userId: user.id,
      purpose: 'password_reset',
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
    });
  });
  return token;
}

function liveToken(token: string) {
  return and(
    eq(verificationTokens.tokenHash, hashToken(token)),
    eq(verificationTokens.purpose, 'password_reset'),
    isNull(verificationTokens.consumedAt),
    gt(verificationTokens.expiresAt, new Date()),
  );
}

/** Whether a link is still usable — lets the page say so before any typing. */
export async function passwordResetTokenIsValid(token: string) {
  const rows = await db
    .select({ id: verificationTokens.id })
    .from(verificationTokens)
    .where(liveToken(token))
    .limit(1);
  return rows.length > 0;
}

/**
 * Spends a token and sets the new password hash, atomically. Returns the user
 * id, or null when the link is expired, used, or unknown. The conditional
 * UPDATE is what makes a double-submit spend the token only once.
 */
export async function consumePasswordResetToken(
  token: string,
  passwordHash: string,
): Promise<string | null> {
  return db.transaction(async (tx) => {
    const spent = await tx
      .update(verificationTokens)
      .set({ consumedAt: new Date() })
      .where(liveToken(token))
      .returning({ userId: verificationTokens.userId });
    const userId = spent[0]?.userId;
    if (!userId) return null;

    await tx
      .update(users)
      .set({
        passwordHash,
        // The reset proves control of the inbox, and ends any lockout.
        emailVerifiedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    return userId;
  });
}
