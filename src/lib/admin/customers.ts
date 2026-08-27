import 'server-only';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { addresses, orders, reviews, users } from '@/lib/db/schema';
import type { OrderStatus, PaymentStatus } from '@/lib/db/schema';

/**
 * Customer read models for the admin.
 *
 * Only what support actually needs to answer a question about an order:
 * identity, contact, and the shape of their trading history. Password hashes,
 * MFA secrets and session tokens are never selected — not filtered out later,
 * never read in the first place, so a widened SELECT cannot leak one.
 *
 * `users` also holds staff. These queries exclude them: staff accounts belong
 * to /admin/staff, and listing an owner among the customers invites editing
 * the wrong row.
 */

export type CustomerRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  emailVerifiedAt: Date | null;
  marketingOptInAt: Date | null;
  lockedUntil: Date | null;
  deletedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  orderCount: number;
  /** Paid, non-cancelled spend, in cents. */
  lifetimeValue: number;
  lastOrderAt: Date | null;
};

/** Only orders that represent money actually taken count towards spend. */
const spend = db
  .select({
    userId: orders.userId,
    orderCount: sql<number>`COUNT(*)::int`.as('order_count'),
    lifetimeValue:
      sql<number>`COALESCE(SUM(${orders.grandTotal}) FILTER (WHERE ${orders.paymentStatus} = 'paid'), 0)::int`.as(
        'lifetime_value',
      ),
    lastOrderAt: sql<Date | null>`MAX(${orders.createdAt})`.as('last_order_at'),
  })
  .from(orders)
  .where(sql`${orders.userId} IS NOT NULL AND ${orders.status} <> 'cancelled'`)
  .groupBy(orders.userId)
  .as('spend');

export async function listCustomers(query?: string): Promise<CustomerRow[]> {
  const term = query?.trim();
  const like = term ? `%${term.toLowerCase()}%` : null;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      phone: users.phone,
      emailVerifiedAt: users.emailVerifiedAt,
      marketingOptInAt: users.marketingOptInAt,
      lockedUntil: users.lockedUntil,
      deletedAt: users.deletedAt,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      orderCount: sql<number>`COALESCE(${spend.orderCount}, 0)`,
      lifetimeValue: sql<number>`COALESCE(${spend.lifetimeValue}, 0)`,
      lastOrderAt: spend.lastOrderAt,
    })
    .from(users)
    .leftJoin(spend, eq(spend.userId, users.id))
    .where(
      and(
        isNull(users.staffRole),
        like
          ? or(
              sql`LOWER(${users.email}) LIKE ${like}`,
              sql`LOWER(COALESCE(${users.firstName}, '') || ' ' || COALESCE(${users.lastName}, '')) LIKE ${like}`,
              sql`COALESCE(${users.phone}, '') LIKE ${like}`,
            )
          : undefined,
      ),
    )
    .orderBy(desc(sql`COALESCE(${spend.lastOrderAt}, ${users.createdAt})`))
    .limit(200);

  // `MAX(created_at)` comes back through a raw `sql` fragment, which carries no
  // column type for the driver to parse against — so it arrives as a string
  // while the real timestamp columns arrive as Dates.
  return rows.map((row) => ({
    ...row,
    lastOrderAt: row.lastOrderAt ? new Date(row.lastOrderAt) : null,
  }));
}

export type CustomerDetail = CustomerRow & {
  addresses: {
    id: string;
    recipientName: string;
    line1: string;
    line2: string | null;
    city: string;
    district: string | null;
    postalCode: string | null;
    isDefault: boolean;
  }[];
  orders: {
    reference: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    grandTotal: number;
    createdAt: Date;
  }[];
  reviewCount: number;
};

export async function getCustomer(id: string): Promise<CustomerDetail | null> {
  const rows = await listCustomers();
  let customer = rows.find((row) => row.id === id);

  // A customer outside the 200-row window is still reachable by id.
  if (!customer) {
    const direct = await db
      .select({ email: users.email })
      .from(users)
      .where(and(eq(users.id, id), isNull(users.staffRole)))
      .limit(1);
    if (!direct[0]) return null;
    customer = (await listCustomers(direct[0].email)).find(
      (row) => row.id === id,
    );
    if (!customer) return null;
  }

  const [addressRows, orderRows, reviewRows] = await Promise.all([
    db
      .select({
        id: addresses.id,
        recipientName: addresses.recipientName,
        line1: addresses.line1,
        line2: addresses.line2,
        city: addresses.city,
        district: addresses.district,
        postalCode: addresses.postalCode,
        isDefault: addresses.isDefault,
      })
      .from(addresses)
      .where(eq(addresses.userId, id))
      .orderBy(desc(addresses.isDefault)),
    db
      .select({
        reference: orders.reference,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        grandTotal: orders.grandTotal,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(eq(orders.userId, id))
      .orderBy(desc(orders.createdAt))
      .limit(50),
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(reviews)
      .where(eq(reviews.userId, id)),
  ]);

  return {
    ...customer,
    addresses: addressRows,
    orders: orderRows,
    reviewCount: reviewRows[0]?.count ?? 0,
  };
}
