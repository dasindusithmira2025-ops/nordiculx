import type { Metadata } from 'next';
import { PageHeader } from '@/components/layout/page-header';
import { ForgotPasswordForm } from '@/components/account/auth-forms';

export const metadata: Metadata = {
  title: 'Reset your password — Nordic Lux',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Reset your password"
        align="center"
        trail={[
          { label: 'Sign in', href: '/account/login' },
          { label: 'Reset password', href: '/account/forgot-password' },
        ]}
      />
      <div className="page-x mx-auto max-w-md pb-28">
        <ForgotPasswordForm />
      </div>
    </>
  );
}
