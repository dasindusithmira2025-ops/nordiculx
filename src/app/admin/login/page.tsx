import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentStaffSession } from '@/lib/auth';
import { StaffLoginForm } from '@/components/admin/staff-login-form';

export const metadata: Metadata = {
  title: 'Staff sign in — Nordic Lux',
  robots: { index: false, follow: false, nocache: true },
};

function safeNext(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  // Only in-admin destinations, which also rules out protocol-relative URLs.
  return value?.startsWith('/admin') ? value : undefined;
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);

  if (await currentStaffSession()) redirect(next ?? '/admin');

  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <p className="eyebrow text-fg-subtle text-center">Nordic Lux</p>
        <h1 className="font-display text-display-sm text-fg mt-3 mb-10 text-center">
          Staff sign in
        </h1>

        <StaffLoginForm next={next} />

        <p className="text-fg-subtle mt-10 text-center text-xs">
          This area is for Nordic Lux staff. Customer accounts sign in at{' '}
          <Link href="/account/login" className="link-underline">
            /account
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
