import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCart } from '@/lib/cart';
import { requireUser } from '@/lib/auth';
import { getAddressesForUser } from '@/lib/account';
import { paymentsAreMocked } from '@/lib/payments';
import { trackEvent } from '@/lib/analytics';
import { PageHeader } from '@/components/layout/page-header';
import { CheckoutForm } from '@/components/checkout/checkout-form';
import { CheckoutSummary } from '@/components/checkout/order-summary';

export const metadata: Metadata = {
  title: 'Checkout — Nordic Lux',
  robots: { index: false, follow: false },
};

/**
 * Checkout.
 *
 * Signed-in customers only. Guests are sent to sign-in and returned here; the
 * bag lives in its own cookie, so it survives the round trip. `submitCheckout`
 * enforces the same rule — this redirect is only the friendly half.
 *
 * An empty bag redirects rather than rendering a form that cannot be submitted.
 */
export default async function CheckoutPage() {
  const cart = await getCart();
  if (cart.lines.length === 0) redirect('/shop');

  const user = await requireUser('/checkout');
  const savedAddresses = await getAddressesForUser(user.id);

  // Counts and totals only. No line contents, no address, no email.
  await trackEvent(
    'begin_checkout',
    { items: cart.lines.length, value: cart.pricing.grandTotal },
    { path: '/checkout' },
  );

  return (
    <>
      <PageHeader
        eyebrow="Checkout"
        title="Complete your order"
        trail={[{ label: 'Checkout', href: '/checkout' }]}
      />

      <div className="page-x mx-auto max-w-(--container-page) pb-28">
        {paymentsAreMocked ? (
          <p
            role="status"
            className="border-signal-warning text-fg-muted mb-10 border-l px-4 py-3 text-sm"
          >
            <strong className="text-fg font-medium">Test mode.</strong> Payments
            are simulated — no card is charged and no money moves.
          </p>
        ) : null}

        <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[1fr_22rem]">
          <div className="min-w-0">
            <CheckoutForm
              savedAddresses={savedAddresses}
              defaultEmail={user.email}
            />
          </div>
          <CheckoutSummary cart={cart} />
        </div>
      </div>
    </>
  );
}
