import type { ReactNode } from 'react';
import { requireUser } from '@/lib/auth';
import { AccountNav } from '@/components/account/account-nav';

/**
 * Shell for the signed-in account area.
 *
 * `requireUser` runs here rather than in each page, so a new account route
 * cannot be added without protection by forgetting a guard. `/account/login`
 * and `/account/register` sit OUTSIDE this route group precisely because they
 * must stay reachable while signed out — bouncing somebody from a login form to
 * a login form is an infinite redirect.
 *
 * The guard is a layout, but authorisation is still enforced per request: every
 * query in here filters on the session's user id, so a rendered layout is never
 * the thing granting access to data.
 */
export default async function AccountLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireUser('/account');

  return (
    <div className="page-x mx-auto max-w-(--container-page) pt-8 pb-28 md:pt-12">
      <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[13rem_1fr]">
        <aside>
          <AccountNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
