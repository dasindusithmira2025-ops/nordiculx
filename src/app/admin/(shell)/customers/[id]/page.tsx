import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff } from '@/lib/auth';
import { getCustomer } from '@/lib/admin/customers';
import { formatMoney } from '@/lib/money';
import { Badge } from '@/components/ui/display';
import { NoRows, PageHeader, Table, Td, Th } from '@/components/admin/admin-ui';

/**
 * One customer.
 *
 * Read-only by design. Support answers questions here and acts on the order
 * itself — there is no edit form, because a staff member changing a customer's
 * own address or email is how a support session becomes an account takeover.
 */

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export default async function AdminCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff('customers.view');

  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) notFound();

  const name =
    [customer.firstName, customer.lastName].filter(Boolean).join(' ') ||
    customer.email;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Customer"
        title={name}
        description={customer.email}
        stats={[
          { label: 'Orders', value: customer.orderCount },
          { label: 'Spend', value: formatMoney(customer.lifetimeValue) },
          { label: 'Reviews', value: customer.reviewCount },
        ]}
      />

      <p className="flex flex-wrap items-center gap-3 text-xs">
        <Link href="/admin/customers" className="link-underline">
          All customers
        </Link>
        {customer.deletedAt ? <Badge tone="out">Account closed</Badge> : null}
        {customer.emailVerifiedAt ? (
          <Badge tone="success">Email verified</Badge>
        ) : (
          <Badge tone="neutral">Email unverified</Badge>
        )}
        {customer.marketingOptInAt ? (
          <Badge tone="neutral">Marketing opted in</Badge>
        ) : null}
        {customer.lockedUntil && customer.lockedUntil > new Date() ? (
          <Badge tone="low">
            Locked until {dateFormat.format(customer.lockedUntil)}
          </Badge>
        ) : null}
      </p>

      <section aria-label="Account" className="border-line border p-4">
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="eyebrow text-fg-subtle">Phone</dt>
            <dd className="text-fg mt-1">{customer.phone ?? '—'}</dd>
          </div>
          <div>
            <dt className="eyebrow text-fg-subtle">Joined</dt>
            <dd className="text-fg mt-1">
              {dateFormat.format(customer.createdAt)}
            </dd>
          </div>
          <div>
            <dt className="eyebrow text-fg-subtle">Last signed in</dt>
            <dd className="text-fg mt-1">
              {customer.lastLoginAt
                ? dateFormat.format(customer.lastLoginAt)
                : 'Never'}
            </dd>
          </div>
          <div>
            <dt className="eyebrow text-fg-subtle">Last order</dt>
            <dd className="text-fg mt-1">
              {customer.lastOrderAt
                ? dateFormat.format(customer.lastOrderAt)
                : '—'}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-label="Orders">
        <h2 className="eyebrow text-fg-subtle">Order history</h2>
        {customer.orders.length === 0 ? (
          <NoRows>No orders on this account.</NoRows>
        ) : (
          <Table className="mt-3">
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Placed</Th>
                <Th>Status</Th>
                <Th>Payment</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {customer.orders.map((order) => (
                <tr key={order.reference}>
                  <Td className="font-mono text-xs">
                    <Link
                      href={`/admin/orders/${order.reference}`}
                      className="link-underline"
                    >
                      {order.reference}
                    </Link>
                  </Td>
                  <Td className="text-fg-muted text-xs whitespace-nowrap">
                    {dateFormat.format(order.createdAt)}
                  </Td>
                  <Td className="text-fg-muted text-xs">{order.status}</Td>
                  <Td>
                    <Badge
                      tone={
                        order.paymentStatus === 'paid' ? 'success' : 'neutral'
                      }
                    >
                      {order.paymentStatus}
                    </Badge>
                  </Td>
                  <Td className="text-right tabular-nums">
                    {formatMoney(order.grandTotal)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section aria-label="Addresses">
        <h2 className="eyebrow text-fg-subtle">Saved addresses</h2>
        {customer.addresses.length === 0 ? (
          <NoRows>No saved addresses.</NoRows>
        ) : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {customer.addresses.map((address) => (
              <li
                key={address.id}
                className="border-line text-fg-muted border p-3 text-xs"
              >
                <p className="text-fg text-sm">{address.recipientName}</p>
                <p className="mt-1">{address.line1}</p>
                {address.line2 ? <p>{address.line2}</p> : null}
                <p>
                  {[address.city, address.district, address.postalCode]
                    .filter(Boolean)
                    .join(', ')}
                </p>
                {address.isDefault ? (
                  <p className="mt-2">
                    <Badge tone="neutral">Default</Badge>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
