import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { TrackForm } from '@/components/checkout/track-form';

export const metadata: Metadata = {
  title: 'Track your order — Nordic Lux',
  description:
    'Look up an order with its reference and the email address it was placed with.',
  alternates: { canonical: '/track' },
};

export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.reference)
    ? params.reference[0]
    : params.reference;

  return (
    <>
      <PageHeader
        eyebrow="Support"
        title="Track your order"
        description="Enter your reference and the email address you ordered with, and we will send you a link to it."
        align="center"
        trail={[{ label: 'Track', href: '/track' }]}
      />

      <div className="page-x mx-auto max-w-md pb-28">
        <TrackForm defaultReference={raw?.toUpperCase()} />

        <p className="text-fg-subtle mt-12 text-center text-xs">
          Have an account?{' '}
          <Link href="/account/orders" className="text-fg-muted link-underline">
            Your orders are listed there
          </Link>{' '}
          without a lookup.
        </p>
      </div>
    </>
  );
}
