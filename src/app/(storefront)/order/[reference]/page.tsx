import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { getOrderForVisitor } from '@/lib/orders';
import { paymentProvider } from '@/lib/payments';
import { ButtonLink } from '@/components/ui/button';
import { OrderDetailView } from '@/components/commerce/order-detail';
import { CheckIcon } from '@/components/ui/icons';

export const metadata: Metadata = {
  title: 'Your order — Nordic Lux',
  robots: { index: false, follow: false },
};

/**
 * Post-checkout confirmation.
 *
 * Reachable two ways, and only two: the signed-in owner, or a guest holding the
 * token that checkout set as a cookie (and emailed). The reference on its own is
 * never enough — order references appear in emails and support chats, so
 * treating one as a credential would make every order readable by anyone who
 * saw it quoted.
 */
export default async function OrderConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ payment?: string }>;
}) {
  const { reference } = await params;
  const returnedFromCancellation = (await searchParams).payment === 'cancelled';
  const user = await currentUser();
  const order = await getOrderForVisitor(reference);
  if (!order) notFound();

  // Form-based providers can be re-entered for the same order until it is
  // paid or its reservation lapses. Stripe sessions cannot, so it is omitted.
  const canRetryPayment =
    paymentProvider === 'payhere' &&
    order.status === 'pending_payment' &&
    order.paymentStatus !== 'paid';

  return (
    <div className="page-x mx-auto max-w-3xl pt-12 pb-28">
      <div className="text-center">
        <span
          aria-hidden
          className="border-line-strong text-fg mx-auto flex size-14 items-center justify-center rounded-full border"
        >
          <CheckIcon width={22} height={22} />
        </span>
        <h1 className="font-display text-display-lg text-fg mt-8">
          {order.paymentStatus === 'paid'
            ? 'Thank you'
            : order.status === 'cancelled'
              ? 'Payment window expired'
              : returnedFromCancellation
                ? 'Payment cancelled'
                : order.paymentStatus === 'failed'
                  ? 'Payment not completed'
                  : 'Payment processing'}
        </h1>
        <p className="text-fg-muted mx-auto mt-5 max-w-prose text-base">
          {order.paymentStatus === 'paid' ? (
            <>
              Your order is confirmed. We have emailed a copy to{' '}
              <span className="text-fg">{order.email}</span>, and we will write
              again the moment it is dispatched.
            </>
          ) : order.status === 'cancelled' ? (
            'The payment session expired, so this order was cancelled and its reserved items were released.'
          ) : returnedFromCancellation ? (
            'No payment was taken. The items stay reserved for a short while, then the unpaid order is released automatically.'
          ) : order.paymentStatus === 'failed' ? (
            'The payment did not go through and the order has not been confirmed. No money was taken for it.'
          ) : (
            'We are waiting for the payment provider to confirm your payment. This usually takes a few seconds — refresh this page shortly.'
          )}
        </p>
      </div>

      <div className="border-line mt-16 border-t pt-12">
        <OrderDetailView order={order} />
      </div>

      <div className="mt-16 flex flex-wrap justify-center gap-4">
        {canRetryPayment ? (
          <ButtonLink href={`/checkout/pay?reference=${order.reference}`}>
            Complete payment
          </ButtonLink>
        ) : null}
        <ButtonLink href="/shop" variant="secondary">
          Continue shopping
        </ButtonLink>
        {user ? (
          <ButtonLink href="/account/orders">View your orders</ButtonLink>
        ) : (
          <ButtonLink href="/account/register">Create an account</ButtonLink>
        )}
      </div>

      {user ? null : (
        <p className="text-fg-subtle mt-10 text-center text-xs">
          Ordering as a guest — keep the link in your email to check on this
          order later, or{' '}
          <Link href="/track" className="text-fg-muted link-underline">
            track it with your reference
          </Link>
          .
        </p>
      )}
    </div>
  );
}
