import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { listCustomers } from '@/lib/admin/customers';
import { formatMoney } from '@/lib/money';
import { Badge } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import {
  adminField,
  NoRows,
  PageHeader,
  Table,
  Td,
  Th,
} from '@/components/admin/admin-ui';

/**
 * Customers.
 *
 * Sorted by most recent activity, because the person support is being asked
 * about almost always ordered recently. One search box over email, name and
 * phone — the three things a caller can actually give you.
 */

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  await requireStaff('customers.view');

  const params = await searchParams;
  const query = (Array.isArray(params.q) ? params.q[0] : params.q) ?? '';
  const rows = await listCustomers(query);

  const spend = rows.reduce((total, row) => total + row.lifetimeValue, 0);
  const ordering = rows.filter((row) => row.orderCount > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="People"
        title={`${rows.length} customers`}
        description="Registered accounts. Guest orders are not accounts and appear under Orders only."
        stats={[
          { label: 'Ordered', value: ordering },
          { label: 'Spend', value: formatMoney(spend) },
        ]}
      />

      <form action="/admin/customers" className="flex max-w-md gap-3">
        <label className="flex-1">
          <span className="sr-only">Search customers</span>
          <input
            name="q"
            defaultValue={query}
            placeholder="Email, name or phone"
            className={adminField}
          />
        </label>
        <Button type="submit" size="sm">
          Search
        </Button>
      </form>

      {rows.length === 0 ? (
        <NoRows>
          {query ? 'Nobody matches that search.' : 'No customer accounts yet.'}
        </NoRows>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Customer</Th>
              <Th>Contact</Th>
              <Th className="text-right">Orders</Th>
              <Th className="text-right">Spend</Th>
              <Th>Last order</Th>
              <Th>Joined</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const name =
                [row.firstName, row.lastName].filter(Boolean).join(' ') || '—';
              return (
                <tr key={row.id}>
                  <Td>
                    <Link
                      href={`/admin/customers/${row.id}`}
                      className="link-underline text-fg"
                    >
                      {name}
                    </Link>
                  </Td>
                  <Td className="text-fg-muted text-xs">
                    {row.email}
                    {row.phone ? (
                      <span className="text-fg-subtle"> · {row.phone}</span>
                    ) : null}
                  </Td>
                  <Td className="text-right tabular-nums">{row.orderCount}</Td>
                  <Td className="text-right tabular-nums">
                    {formatMoney(row.lifetimeValue)}
                  </Td>
                  <Td className="text-fg-muted text-xs whitespace-nowrap">
                    {row.lastOrderAt ? dateFormat.format(row.lastOrderAt) : '—'}
                  </Td>
                  <Td className="text-fg-muted text-xs whitespace-nowrap">
                    {dateFormat.format(row.createdAt)}
                  </Td>
                  <Td>
                    {row.deletedAt ? (
                      <Badge tone="out">Closed</Badge>
                    ) : row.lockedUntil && row.lockedUntil > new Date() ? (
                      <Badge tone="low">Locked</Badge>
                    ) : row.emailVerifiedAt ? (
                      <Badge tone="success">Verified</Badge>
                    ) : (
                      <Badge tone="neutral">Unverified</Badge>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
