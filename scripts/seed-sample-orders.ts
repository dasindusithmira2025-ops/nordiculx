import './load-env';
import { and, desc, eq, isNull, sql as raw } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as s from '@/lib/db/schema';
import { generateReference, generateToken } from '@/lib/tokens';

/**
 * Sample order history, built from the catalogue that is actually loaded.
 *
 * The main seed's sample orders name demo SKUs, so against the real catalogue
 * they landed with null product/variant ids and prices in a currency the shop
 * no longer uses. This builds the same four orders — one at each interesting
 * status — out of real products at their real prices, which is what makes the
 * order, tracking, returns and review flows exercisable at all.
 *
 * Development and E2E only. It refuses to run against a database that already
 * has orders, so it can never dilute genuine trading history.
 *
 *   npm run seed:sample-orders
 *   npm run seed:sample-orders -- --force   (append anyway)
 */
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed sample orders into production.');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}
const connection = postgres(url, { max: 1 });
const db = drizzle(connection, { schema: s, casing: 'snake_case' });

const FORCE = process.argv.includes('--force');

const ADDRESS = {
  recipientName: 'Amaya Perera',
  phone: '+94771234567',
  line1: '42 Horton Place',
  line2: 'Apartment 5B',
  city: 'Colombo',
  district: 'Colombo',
  postalCode: '00700',
  country: 'LK',
};

const STATUS_TIMELINE: s.OrderStatus[] = [
  'confirmed',
  'preparing',
  'packed',
  'dispatched',
  'in_transit',
  'out_for_delivery',
  'delivered',
];

function trackingMessage(status: s.OrderStatus): string {
  switch (status) {
    case 'confirmed':
      return 'Order confirmed and payment received.';
    case 'preparing':
      return 'Being prepared at our Weboda studio.';
    case 'packed':
      return 'Packed and awaiting collection.';
    case 'dispatched':
      return 'Handed to the courier.';
    case 'in_transit':
      return 'In transit.';
    case 'out_for_delivery':
      return 'Out for delivery.';
    case 'delivered':
      return 'Delivered.';
    default:
      return '';
  }
}

async function main() {
  const existing = await db
    .select({ count: raw<number>`COUNT(*)::int` })
    .from(s.orders);
  if ((existing[0]?.count ?? 0) > 0 && !FORCE) {
    console.warn(
      `Database already holds ${existing[0]!.count} orders — leaving them alone. Pass --force to append.`,
    );
    await connection.end();
    return;
  }

  const customers = await db
    .select({ id: s.users.id, email: s.users.email })
    .from(s.users)
    .where(and(isNull(s.users.staffRole), isNull(s.users.deletedAt)))
    .orderBy(s.users.createdAt);

  if (customers.length === 0) {
    console.warn('No customer accounts — run `npm run db:seed` first.');
    await connection.end();
    return;
  }

  // Real, sellable lines: published product, default variant, live price.
  const pool = await db
    .select({
      productId: s.products.id,
      variantId: s.productVariants.id,
      sku: s.productVariants.sku,
      productName: s.products.name,
      variantName: s.productVariants.name,
      brandName: s.brands.name,
      price: s.productVariants.price,
      salePrice: s.productVariants.salePrice,
      imageUrl: raw<string | null>`(
        SELECT m.url FROM product_media m
         WHERE m.product_id = ${s.products.id}
         ORDER BY m.sort_order LIMIT 1
      )`,
    })
    .from(s.products)
    .innerJoin(
      s.productVariants,
      eq(s.productVariants.productId, s.products.id),
    )
    .innerJoin(s.brands, eq(s.brands.id, s.products.brandId))
    .where(
      and(
        eq(s.products.status, 'published'),
        isNull(s.products.deletedAt),
        eq(s.productVariants.status, 'published'),
      ),
    )
    // Deterministic: the same catalogue always produces the same sample orders.
    .orderBy(s.productVariants.sku)
    .limit(8);

  if (pool.length === 0) {
    console.warn('Catalogue is empty — import it before seeding orders.');
    await connection.end();
    return;
  }

  const line = (index: number, qty: number) => {
    const item = pool[index % pool.length]!;
    const unitPrice = item.salePrice ?? item.price;
    return {
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName,
      variantName: item.variantName,
      brandName: item.brandName,
      sku: item.sku,
      imageUrl: item.imageUrl,
      unitPrice,
      quantity: qty,
      lineTotal: unitPrice * qty,
    };
  };

  // Every customer gets a delivered order on a product of their own, and no
  // two share one: reviews and returns are keyed on (product, customer), so
  // overlapping fixtures make parallel tests fight over a single row.
  // Delivered orders sit inside the 14-day return window so the returns flow
  // has something to act on, and carry two units so a partial return still
  // leaves something returnable.
  const at = (n: number) => n % customers.length;
  const specs = [
    {
      customer: 0,
      status: 'delivered' as const,
      daysAgo: 6,
      lines: [line(0, 2)],
    },
    {
      customer: 0,
      status: 'dispatched' as const,
      daysAgo: 3,
      lines: [line(1, 2)],
    },
    {
      customer: at(1),
      status: 'delivered' as const,
      daysAgo: 5,
      lines: [line(2, 2)],
    },
    {
      customer: at(1),
      status: 'preparing' as const,
      daysAgo: 1,
      lines: [line(3, 1)],
    },
    {
      customer: at(2),
      status: 'delivered' as const,
      daysAgo: 4,
      lines: [line(4, 2)],
    },
    {
      customer: at(2),
      status: 'confirmed' as const,
      daysAgo: 0,
      lines: [line(5, 1), line(6, 2)],
    },
  ];

  for (const spec of specs) {
    const customer = customers[spec.customer]!;
    const subtotal = spec.lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const shipping = subtotal >= 10_000 ? 0 : 4_500;
    const grandTotal = subtotal + shipping;
    const placedAt = new Date(Date.now() - spec.daysAgo * 86_400_000);
    const deliveredAt =
      spec.status === 'delivered'
        ? new Date(placedAt.getTime() + 3 * 86_400_000)
        : null;

    const [order] = await db
      .insert(s.orders)
      .values({
        reference: generateReference(),
        userId: customer.id,
        email: customer.email,
        phone: ADDRESS.phone,
        status: spec.status,
        paymentStatus: 'paid',
        subtotal,
        shippingTotal: shipping,
        grandTotal,
        shippingAddress: ADDRESS,
        billingAddress: ADDRESS,
        shippingMethod: 'standard',
        placedAt,
        deliveredAt,
        createdAt: placedAt,
      })
      .returning({ id: s.orders.id });

    await db
      .insert(s.orderItems)
      .values(spec.lines.map((l) => ({ ...l, orderId: order!.id })));

    await db.insert(s.payments).values({
      orderId: order!.id,
      provider: 'mock',
      providerReference: `mock_${generateToken().slice(0, 18)}`,
      status: 'paid',
      amount: grandTotal,
      method: 'card',
      last4: '4242',
      capturedAt: placedAt,
    });

    const reached = STATUS_TIMELINE.slice(
      0,
      STATUS_TIMELINE.indexOf(spec.status) + 1,
    );
    await db.insert(s.trackingEvents).values(
      reached.map((status, i) => ({
        orderId: order!.id,
        status,
        message: trackingMessage(status),
        location: i >= 3 ? 'Colombo' : 'Weboda',
        source: 'staff' as const,
        occurredAt: new Date(placedAt.getTime() + i * 14 * 3_600_000),
      })),
    );

    if (reached.includes('dispatched')) {
      await db.insert(s.shipments).values({
        orderId: order!.id,
        carrier: 'domex',
        trackingNumber: `DMX${generateToken().slice(0, 10).toUpperCase()}`,
        dispatchedAt: new Date(placedAt.getTime() + 2 * 86_400_000),
        deliveredAt,
      });
    }
  }

  const latest = await db
    .select({ reference: s.orders.reference, status: s.orders.status })
    .from(s.orders)
    .orderBy(desc(s.orders.createdAt))
    .limit(specs.length);

  console.warn(
    [
      `Seeded ${specs.length} sample orders from the live catalogue`,
      ...latest.map((o) => `  ${o.reference}  ${o.status}`),
    ].join('\n'),
  );
  await connection.end();
}

main().catch(async (error) => {
  console.error(error);
  await connection.end();
  process.exit(1);
});
