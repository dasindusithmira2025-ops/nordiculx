import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { PageHeader } from '@/components/layout/page-header';
import { SignInForm } from '@/components/account/auth-forms';

export const metadata: Metadata = {
  title: 'Sign in — Nordic Lux',
  // A sign-in form has no business in a search index.
  robots: { index: false, follow: false },
};

/** Only same-site paths are worth carrying through the form. */
function safeNext(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value?.startsWith('/')) return undefined;
  if (value.startsWith('//') || value.startsWith('/\\')) return undefined;
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; existing?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);

  // Somebody already signed in has no use for this page.
  if (await currentUser()) redirect(next ?? '/account');

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Sign in"
        align="center"
        trail={[{ label: 'Sign in', href: '/account/login' }]}
      />

      <div className="page-x mx-auto max-w-md pb-28">
        {params.existing ? (
          // Shown after a registration attempt with an address that already
          // exists. Worded so it is equally true whether it does or not.
          <p
            role="status"
            className="border-line-strong text-fg-muted mb-10 border-l px-4 py-3 text-sm"
          >
            If that address already has an account, sign in below. Otherwise
            check the address and try creating one again.
          </p>
        ) : null}

        <SignInForm next={next} />
      </div>
    </>
  );
}
