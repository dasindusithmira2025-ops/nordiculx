import { NextResponse, type NextRequest } from 'next/server';

/**
 * Redirects unauthenticated requests for private routes to the sign-in form,
 * carrying the requested path so the visitor lands back where they meant to go.
 *
 * This is what Next.js called Middleware before 16; the file convention is now
 * `proxy.ts`. It exists because a layout cannot see the pathname:
 * `requireUser()` in `/account/(dashboard)/layout.tsx` knows the visitor is
 * signed out but not what they asked for, so on its own it could only ever send
 * everybody to `/account`.
 *
 * It is an OPTIMISTIC CHECK, not the authorisation boundary — which is also what
 * the Next documentation says this file is for. It only checks that a session
 * cookie is present; there is no database access here, so it cannot tell a valid
 * session from a forged or expired one. Every private route still calls
 * `requireUser()`/`requireStaff()`, and every query still filters on the
 * session's user id. Deleting this file would degrade the redirect, not open
 * anything up.
 */

const SESSION_COOKIE = 'nl_session';
const STAFF_COOKIE = 'nl_staff_session';

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isStaffArea = pathname.startsWith('/admin');
  const cookie = isStaffArea ? STAFF_COOKIE : SESSION_COOKIE;

  if (request.cookies.has(cookie)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = isStaffArea ? '/admin/login' : '/account/login';
  url.search = '';
  // Only the path and query, never an absolute URL — and `safeNext` in
  // src/app/actions/auth.ts re-validates this on submit regardless, so a
  // crafted `next` cannot become an open redirect.
  url.searchParams.set('next', `${pathname}${search}`);

  return NextResponse.redirect(url);
}

export const config = {
  /**
   * The login and registration forms are excluded, or a signed-out visitor
   * would be redirected from the login page to the login page forever.
   */
  matcher: [
    '/account((?!/login|/register).*)',
    '/admin((?!/login).*)',
    // `/checkout` is deliberately absent: guests must be able to buy without an
    // account, so requiring a session cookie there would block every guest.
  ],
};
