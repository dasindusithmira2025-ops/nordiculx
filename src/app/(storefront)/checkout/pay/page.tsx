import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getOrderForVisitor } from '@/lib/orders';
import { createPaymentIntent, paymentProvider } from '@/lib/payments';
import { publicEnv } from '@/lib/env';
import { StatusMessage } from '@/components/layout/status-message';
import { ProviderRedirectForm } from '@/components/checkout/provider-redirect-form';

export const metadata: Metadata = {
  title: 'Secure payment — Nordic Lux',
  robots: { index: false, follow: false },
};

/**
 * Hand-off to a form-based payment provider (PayHere).
 *
 * The signed fields are rebuilt here from the stored order, never carried from
 * the browser, so the amount the provider is asked for is always the order's
 * own server-computed total. Also the "complete payment" path for a customer
 * who left the provider's page before paying.
 */
export default async function PayPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string | string[] }>;
}) {
  const { reference } = await searchParams;
  if (typeof reference !== 'string') notFound();

  const order = await getOrderForVisitor(reference);
  if (!order) notFound();

  const orderUrl = `/order/${order.reference}`;
  if (
    paymentProvider !== 'payhere' ||
    order.status !== 'pending_payment' ||
    order.paymentStatus === 'paid'
  ) {
    redirect(orderUrl);
  }

  const [firstName = '', ...rest] =
    order.shippingAddress.recipientName.split(' ');
  const intent = await createPaymentIntent({
    orderId: order.id,
    reference: order.reference,
    amount: order.grandTotal,
    currency: order.currency,
    customerEmail: order.email,
    customerPhone: order.phone,
    customerFirstName: firstName,
    customerLastName: rest.join(' ') || '-',
    returnUrl: `${publicEnv.appUrl}${orderUrl}`,
    cancelUrl: `${publicEnv.appUrl}${orderUrl}?payment=cancelled`,
    notifyUrl: `${publicEnv.appUrl}/api/payments/notify`,
  });
  if (!intent.redirectUrl || !intent.fields) redirect(orderUrl);

  return (
    <StatusMessage
      eyebrow={`Order ${order.reference}`}
      title="Taking you to secure payment"
      actions={
        <ProviderRedirectForm
          action={intent.redirectUrl}
          fields={intent.fields}
        />
      }
    >
      You will pay on PayHere&rsquo;s secure page and come straight back here.
      Nordic Lux never sees your card details.
    </StatusMessage>
  );
}
