import 'server-only';
import { cookies, headers } from 'next/headers';
import { and, eq, gt, isNull, lt, ne, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sessions, users, type StaffRole } from '@/lib/db/schema';
import { env, isProduction } from '@/lib/env';
import { generateToken, hashToken } from '@/lib/tokens';

/**
 * Server-side session management.
 *
 * The cookie holds an opaque random token; the database holds only its hash.
 * Sessions are therefore revocable (logout, password change, staff role change)
 * and a stolen database gives an attacker nothing to replay.
 *
 * Cookie flags: httpOnly (no JS access, so XSS cannot exfiltrate it), sameSite
 * lax (blocks cross-site POST replay while keeping normal navigation working),
 * secure in production, and host-scoped path.
 */

const SESSION_COOKIE = 'nl_session';
/** A separate name from the customer session keeps the two surfaces distinct. */
const STAFF_COOKIE = 'nl_staff_session';

export type SessionUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  staffRole: StaffRole | null;
  emailVerifiedAt: Date | null;
  mfaEnabledAt: Date | null;
};

export type ActiveSession = {
  sessionId: string;
  user: SessionUser;
  isStaff: boolean;
};

function cookieName(isStaff: boolean) {
  return isStaff ? STAFF_COOKIE : SESSION_COOKIE;
}

function ttlHours(isStaff: boolean) {
  return isStaff ? env.STAFF_SESSION_TTL_HOURS : env.SESSION_TTL_HOURS;
}

/**
 * Creates a session and sets its cookie.
 *
 * Returns the raw token only so callers can test it; nothing in the app should
 * persist or log it.
 */
export async function createSession(
  userId: string,
  options: { isStaff?: boolean } = {},
): Promise<string> {
  const isStaff = options.isStaff ?? false;
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlHours(isStaff) * 60 * 60 * 1000);

  const headerList = await headers();

  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    isStaff,
    // Recorded for the "active sessions" list customers can review and revoke.
    ipAddress: clientIp(headerList),
    userAgent: headerList.get('user-agent')?.slice(0, 400) ?? null,
    expiresAt,
  });

  const store = await cookies();
  store.set(cookieName(isStaff), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    expires: expiresAt,
  });

  return token;
}

/**
 * Resolves the active session from cookies, or null.
 *
 * The user row is joined in the same query so authorisation always reads the
 * CURRENT role. A staff member demoted mid-session loses access on their next
 * request rather than when their session eventually expires.
 */
export async function getSession(
  options: { staff?: boolean } = {},
): Promise<ActiveSession | null> {
  const isStaff = options.staff ?? false;
  const store = await cookies();
  const token = store.get(cookieName(isStaff))?.value;
  if (!token) return null;

  const rows = await db
    .select({
      sessionId: sessions.id,
      isStaff: sessions.isStaff,
      userId: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      staffRole: users.staffRole,
      emailVerifiedAt: users.emailVerifiedAt,
      mfaEnabledAt: users.mfaEnabledAt,
      deletedAt: users.deletedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  // A soft-deleted account must not be able to keep using a live session.
  if (row.deletedAt) return null;
  // A staff cookie that belongs to an account which is no longer staff is not
  // a staff session, whatever the session row says.
  if (isStaff && !row.staffRole) return null;

  return {
    sessionId: row.sessionId,
    isStaff: row.isStaff,
    user: {
      id: row.userId,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      staffRole: row.staffRole,
      emailVerifiedAt: row.emailVerifiedAt,
      mfaEnabledAt: row.mfaEnabledAt,
    },
  };
}

/** Revokes the current session and clears its cookie. */
export async function destroySession(options: { staff?: boolean } = {}) {
  const isStaff = options.staff ?? false;
  const store = await cookies();
  const token = store.get(cookieName(isStaff))?.value;

  if (token) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, hashToken(token)));
  }

  store.delete(cookieName(isStaff));
}

/**
 * Revokes every session for a user. Called on password change and on any staff
 * role change, so a stolen cookie cannot outlive the credential it came from.
 */
export async function revokeAllSessions(
  userId: string,
  options: { exceptSessionId?: string } = {},
) {
  const conditions = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
  // `ne`, not `eq` — the caller is keeping their own session alive while
  // signing every other device out.
  if (options.exceptSessionId) {
    conditions.push(ne(sessions.id, options.exceptSessionId));
  }
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(...conditions));
}

/** Deletes expired and long-revoked rows. Called by the maintenance script. */
export async function pruneSessions() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return db
    .delete(sessions)
    .where(
      or(lt(sessions.expiresAt, new Date()), lt(sessions.createdAt, cutoff)),
    );
}

/**
 * Best-effort client IP.
 *
 * `x-forwarded-for` is attacker-controlled unless a trusted reverse proxy
 * rewrites it, so this value is only ever used for display and rate-limit
 * bucketing — never for authorisation. See docs/DEPLOYMENT.md § Reverse proxy.
 */
export function clientIp(headerList: Headers): string | null {
  const forwarded = headerList.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null;
  return headerList.get('x-real-ip');
}
