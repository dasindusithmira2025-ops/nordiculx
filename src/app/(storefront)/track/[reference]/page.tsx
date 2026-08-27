import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOrderForGuest } from '@/lib/orders';
import { PageHeader } from '@/components/layout/page-header';
import { OrderDetailView } from '@/components/commerce/order-detail';

export const metadata: Metadata = {
  title: 'Your order — Nordic Lux',
  // A tokenised order link must never be indexed.
  robots: { index: false, follow: false },
};

/**
 * Guest order view, reached from the emailed link.
 *
 * The token in the query string is the only credential. It is compared against
 * its stored hash in constant time, and a wrong or missing one produces an
 * ordinary 404 — not a "wrong token" message, which would confirm the reference
 * is real and invite guessing at the token.
 */
export default async function GuestOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const [{ reference }, query] = await Promise.all([params, searchParams]);
  const token = Array.isArray(query.token) ? query.token[0] : query.token;

  if (!token) notFound();

  const order = await getOrderForGuest(reference.toUpperCase(), token);
  if (!order) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Your order"
        title={order.reference}
        trail={[
          { label: 'Track', href: '/track' },
          { label: order.reference, href: `/track/${order.reference}` },
        ]}
      />

      <div className="page-x mx-auto max-w-3xl pb-28">
        <OrderDetailView order={order} />

        <p className="text-fg-subtle mt-12 text-xs">
          Keep this link private — anyone with it can see this order.{' '}
          <Link
            href="/account/register"
            className="text-fg-muted link-underline"
          >
            Creating an account
          </Link>{' '}
          means you will not need one next time.
        </p>
      </div>
    </>
  );
}
