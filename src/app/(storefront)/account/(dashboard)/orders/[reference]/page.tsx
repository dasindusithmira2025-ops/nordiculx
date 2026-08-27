import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getOrderForUser } from '@/lib/account';
import { OrderDetailView } from '@/components/commerce/order-detail';
import { ReturnRequest } from '@/components/account/return-request';
import { listReturnsForOrder, returnEligibility } from '@/lib/returns';

export const metadata: Metadata = {
  title: 'Order — Nordic Lux',
  robots: { index: false, follow: false },
};

/**
 * One order.
 *
 * `getOrderForUser` filters by user id as well as reference, so another
 * customer's order reference produces an ordinary 404 rather than a 403 — which
 * would confirm the reference exists. Knowing a reference is not authorisation.
 */
export default async function OrderPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const user = await requireUser(`/account/orders/${reference}`);

  const order = await getOrderForUser(user.id, reference.toUpperCase());
  if (!order) notFound();

  // Reached only after the ownership check above, so both reads are already
  // scoped to an order this customer is allowed to see.
  const [eligibility, existingReturns] = await Promise.all([
    returnEligibility(order.id),
    listReturnsForOrder(order.id),
  ]);

  return (
    <div>
      <header className="border-line border-b pb-8">
        <Link
          href="/account/orders"
          className="eyebrow text-fg-subtle hover:text-fg link-underline"
        >
          All orders
        </Link>
        <h1 className="font-display text-display-md text-fg mt-5">Order</h1>
      </header>

      <div className="mt-10">
        <OrderDetailView order={order} />
        <ReturnRequest
          orderReference={order.reference}
          eligibility={eligibility}
          existing={existingReturns}
        />
      </div>
    </div>
  );
}
