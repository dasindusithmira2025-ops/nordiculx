import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { PasswordForm } from '@/components/account/password-form';

export const metadata: Metadata = {
  title: 'Account settings — Nordic Lux',
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const user = await requireUser('/account/settings');

  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');

  return (
    <div>
      <header className="border-line border-b pb-8">
        <p className="eyebrow text-fg-subtle">Account</p>
        <h1 className="font-display text-display-md text-fg mt-4">Settings</h1>
      </header>

      <section className="mt-12">
        <h2 className="eyebrow text-fg-subtle mb-6">Your details</h2>
        <dl className="border-line divide-line divide-y border-y text-sm">
          <div className="flex flex-wrap gap-x-8 gap-y-1 py-4">
            <dt className="text-fg-muted w-32">Name</dt>
            <dd className="text-fg">{name || '—'}</dd>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-1 py-4">
            <dt className="text-fg-muted w-32">Email</dt>
            <dd className="text-fg">
              {user.email}
              {user.emailVerifiedAt ? null : (
                <span className="text-fg-subtle ml-3 text-xs">
                  (not yet verified)
                </span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section className="border-line mt-14 border-t pt-12">
        <h2 className="eyebrow text-fg-subtle mb-6">Password</h2>
        <PasswordForm />
      </section>

      <section className="border-line mt-14 border-t pt-12">
        <h2 className="eyebrow text-fg-subtle mb-4">Your data</h2>
        <p className="text-fg-muted max-w-prose text-sm">
          To export or delete your account, message us from{' '}
          <Link href="/contact" className="text-fg link-underline">
            the contact page
          </Link>
          . Orders are kept after an account is closed because we are required
          to retain them for accounting, but the personal details attached to
          them are scrubbed. This is set out in the{' '}
          <Link href="/privacy" className="text-fg link-underline">
            privacy policy
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
