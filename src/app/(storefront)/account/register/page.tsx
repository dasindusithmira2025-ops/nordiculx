import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { PageHeader } from '@/components/layout/page-header';
import { RegisterForm } from '@/components/account/auth-forms';

export const metadata: Metadata = {
  title: 'Create an account — Nordic Lux',
  robots: { index: false, follow: false },
};

function safeNext(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value?.startsWith('/')) return undefined;
  if (value.startsWith('//') || value.startsWith('/\\')) return undefined;
  return value;
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);

  if (await currentUser()) redirect(next ?? '/account');

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Create an account"
        description="Order history, saved addresses and a wishlist that follows you between devices."
        align="center"
        trail={[{ label: 'Create an account', href: '/account/register' }]}
      />

      <div className="page-x mx-auto max-w-md pb-28">
        <RegisterForm next={next} />

        <p className="text-fg-subtle mt-10 text-center text-xs">
          By creating an account you accept our{' '}
          <Link href="/terms" className="text-fg-muted link-underline">
            terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="text-fg-muted link-underline">
            privacy policy
          </Link>
          .
        </p>
      </div>
    </>
  );
}
