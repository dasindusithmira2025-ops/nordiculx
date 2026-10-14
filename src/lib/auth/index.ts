import 'server-only';
import { cache } from 'react';
import { forbidden, redirect } from 'next/navigation';
import { getSession, type ActiveSession, type SessionUser } from './session';
import { can, type Permission } from './permissions';

/**
 * Authorisation guards.
 *
 * Every server component, server action and route handler that touches
 * non-public data starts with one of these. They throw or redirect — they never
 * return a "maybe" that a caller could forget to check.
 *
 * `cache()` dedupes the session lookup within a single request, so a page that
 * checks auth in the layout, the page and three server components still issues
 * one query.
 */

export const currentSession = cache(async (): Promise<ActiveSession | null> =>
  getSession(),
);

export const currentStaffSession = cache(
  async (): Promise<ActiveSession | null> => getSession({ staff: true }),
);

/** The signed-in customer, or null. Safe on public pages. */
export async function currentUser(): Promise<SessionUser | null> {
  return (await currentSession())?.user ?? null;
}

/**
 * Requires a signed-in customer. Redirects to login with a return path so the
 * customer lands back where they were.
 */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const session = await currentSession();
  if (!session) {
    const target = returnTo ? `?next=${encodeURIComponent(returnTo)}` : '';
    redirect(`/account/login${target}`);
  }
  return session.user;
}

/**
 * Requires a staff session holding `permission`.
 *
 * This is THE authorisation check for the admin. Hiding a nav item or a button
 * is presentation only; if a mutation is reachable without a call to this
 * function, it is unprotected — see docs/SECURITY.md § Staff authorisation.
 */
export async function requireStaff(
  permission?: Permission,
): Promise<SessionUser> {
  const session = await currentStaffSession();

  if (!session?.user.staffRole) {
    redirect('/admin/login');
  }
  if (permission && !can(session.user.staffRole, permission)) {
    forbidden();
  }
  return session.user;
}

/** Non-throwing permission check, for conditionally rendering staff UI. */
export async function staffCan(permission: Permission): Promise<boolean> {
  const session = await currentStaffSession();
  return can(session?.user.staffRole, permission);
}

export {
  can,
  canAll,
  canAny,
  isStaff,
  permissionsFor,
  requiresMfa,
  ROLE_LABELS,
} from './permissions';
export type { Permission } from './permissions';
export type { ActiveSession, SessionUser } from './session';
export {
  createSession,
  destroySession,
  getSession,
  revokeAllSessions,
  pruneSessions,
} from './session';
