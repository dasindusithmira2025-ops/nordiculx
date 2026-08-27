import type { Metadata } from 'next';
import Link from 'next/link';
import { unsubscribeFromRestock } from '@/lib/back-in-stock';
import { PageHeader } from '@/components/layout/page-header';

export const metadata: Metadata = {
  title: 'Unsubscribed — Nordic Lux',
  robots: { index: false, follow: false },
};

/**
 * Back-in-stock unsubscribe.
 *
 * The token is the whole credential — it is single-purpose, random, and stored
 * only as a hash, so a link cannot be reconstructed from the database and
 * cannot be used to read anything. Acting on GET is deliberate: an email client
 * that prefetches the link unsubscribes the reader, which is the outcome they
 * asked for anyway, and requiring a form here loses people who then mark the
 * next message as spam.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.token) ? params.token[0] : params.token;
  const done = raw ? await unsubscribeFromRestock(raw) : false;

  return (
    <>
      <PageHeader
        eyebrow="Notifications"
        title={done ? 'Unsubscribed' : 'Link not recognised'}
        trail={[{ label: 'Notifications', href: '/back-in-stock/unsubscribe' }]}
      />

      <div className="page-x mx-auto max-w-(--container-page) pb-28">
        <p className="text-fg-muted max-w-prose text-sm">
          {done
            ? 'You will not hear from us about this product again. Any other notifications you asked for are unaffected.'
            : 'That link has already been used or has expired. Nothing has changed.'}
        </p>
        <p className="mt-8 text-sm">
          <Link href="/shop" className="link-underline">
            Back to the shop
          </Link>
        </p>
      </div>
    </>
  );
}
