import type { Metadata } from 'next';
import { passwordResetTokenIsValid } from '@/lib/auth/password-reset';
import { PageHeader } from '@/components/layout/page-header';
import { ButtonLink } from '@/components/ui/button';
import { ResetPasswordForm } from '@/components/account/auth-forms';

export const metadata: Metadata = {
  title: 'Choose a new password — Nordic Lux',
  robots: { index: false, follow: false },
  // The token is in this page's URL; keep it out of any outbound Referer.
  referrer: 'no-referrer',
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const valid =
    typeof token === 'string' && (await passwordResetTokenIsValid(token));

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Choose a new password"
        align="center"
        trail={[{ label: 'Reset password', href: '/account/forgot-password' }]}
      />
      <div className="page-x mx-auto max-w-md pb-28">
        {valid ? (
          <ResetPasswordForm token={token} />
        ) : (
          <div className="text-center">
            <p className="text-fg-muted text-base">
              This link has expired or was already used. Reset links work once,
              for one hour.
            </p>
            <ButtonLink href="/account/forgot-password" className="mt-10">
              Send a new link
            </ButtonLink>
          </div>
        )}
      </div>
    </>
  );
}
