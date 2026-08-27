import './load-env';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql as raw } from 'drizzle-orm';
import postgres from 'postgres';
import * as s from '@/lib/db/schema';

/**
 * Removes demo records from the operating dataset.
 *
 * The seed's sample orders name demo SKUs. Imported over the real catalogue,
 * they landed with null `product_id`/`variant_id` and prices from a currency
 * the shop no longer uses — order history for products that have never
 * existed, sitting in what should be the business's own records.
 *
 * Deliberately conservative. An order is only removed when it carries no
 * payment from a real provider AND matches one of two rules:
 *
 *   1. Orphaned demo history — every line has a null product_id and a null
 *      variant_id, and no line's SKU exists in the catalogue at all.
 *   2. Test traffic — the customer email is at a domain RFC 2606 reserves for
 *      exactly this purpose (`example.com`, or anything under `.test`), so it
 *      can never belong to a real person. That covers both the seeded
 *      development accounts and orders placed by the E2E suite.
 *
 * Removing an order also releases the stock it reserved, with a compensating
 * ledger movement. Without that the units stay reserved against an order that
 * no longer exists and the product silently becomes unsellable.
 *
 * Everything is reported before anything is written, and `--dry-run` is the
 * default posture in review: run it, read the list, then run it for real.
 *
 *   npm run data:cleanup -- --dry-run
 *   npm run data:cleanup
 */
if (
  process.env.NODE_ENV === 'production' &&
  !process.argv.includes('--force')
) {
  console.error(
    'Refusing to run against production without --force. Take a backup first.',
  );
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}
const connection = postgres(url, { max: 1 });
const db = drizzle(connection, { schema: s, casing: 'snake_case' });

const DRY_RUN = process.argv.includes('--dry-run');

type Orphan = {
  id: string;
  reference: string;
  email: string;
  status: string;
  grand_total: number;
  created_at: string;
  skus: string[];
  rule: string;
};

async function main() {
  const orphans = (await db.execute(raw`
    SELECT o.id, o.reference, o.email, o.status::text, o.grand_total,
           o.created_at::text,
           ARRAY_AGG(DISTINCT oi.sku) AS skus,
           CASE
             WHEN o.email LIKE '%@example.com' OR o.email LIKE '%.test'
               THEN 'test traffic'
             ELSE 'orphaned demo'
           END AS rule
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
     WHERE NOT EXISTS (
             SELECT 1 FROM payments p
              WHERE p.order_id = o.id AND p.provider <> 'mock'
           )
       AND (
             o.email LIKE '%@example.com'
             OR o.email LIKE '%.test'
             OR (
               NOT EXISTS (
                 SELECT 1 FROM order_items x
                  WHERE x.order_id = o.id
                    AND (x.product_id IS NOT NULL OR x.variant_id IS NOT NULL)
               )
               AND NOT EXISTS (
                 SELECT 1 FROM order_items x
                   JOIN product_variants pv ON pv.sku = x.sku
                  WHERE x.order_id = o.id
               )
             )
           )
     GROUP BY o.id
     ORDER BY o.created_at
  `)) as unknown as Orphan[];

  const totals = (await db.execute(raw`
    SELECT
      (SELECT COUNT(*)::int FROM orders)    AS orders,
      (SELECT COUNT(*)::int FROM products)  AS products,
      (SELECT COUNT(*)::int FROM reviews)   AS reviews,
      (SELECT COUNT(*)::int FROM users WHERE staff_role IS NULL) AS customers
  `)) as unknown as {
    orders: number;
    products: number;
    reviews: number;
    customers: number;
  }[];

  const before = totals[0]!;

  console.warn(
    [
      'Operating data',
      `  orders:            ${before.orders}`,
      `  products:          ${before.products}`,
      `  reviews:           ${before.reviews}`,
      `  customer accounts: ${before.customers}`,
      '',
      `Orphaned demo orders: ${orphans.length}`,
      ...orphans.map(
        (o) =>
          `  ${o.reference}  ${o.rule.padEnd(14)} ${o.status.padEnd(11)} ${o.email.padEnd(26)} ${o.skus.join(', ')}`,
      ),
    ].join('\n'),
  );

  if (orphans.length === 0) {
    console.warn('\nNothing to remove — the operating dataset is clean.');
    await connection.end();
    return;
  }

  if (DRY_RUN) {
    console.warn('\n[dry run] no rows deleted');
    await connection.end();
    return;
  }

  // One transaction. `order_items`, `payments`, `tracking_events`, `shipments`
  // and `return_items` all cascade from `orders`, so the delete is complete
  // without naming each of them and cannot half-apply.
  // An `= ANY(${array})` expands to one bound parameter per element, which
  // Postgres reads as a row constructor rather than an array. An explicit
  // IN list is unambiguous.
  const idList = raw.join(
    orphans.map((o) => raw`${o.id}::uuid`),
    raw`, `,
  );
  await db.transaction(async (tx) => {
    // Release first, while the lines still exist. Stock these orders reserved
    // would otherwise stay locked against an order that no longer exists.
    const released = (await tx.execute(raw`
      WITH claimed AS (
        SELECT oi.variant_id, SUM(oi.quantity)::int AS quantity
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
         WHERE o.id IN (${idList})
           AND oi.variant_id IS NOT NULL
           AND o.status NOT IN ('cancelled', 'returned')
         GROUP BY oi.variant_id
      )
      UPDATE inventory_items i
         SET reserved = GREATEST(i.reserved - c.quantity, 0),
             updated_at = NOW()
        FROM claimed c
       WHERE i.variant_id = c.variant_id
      RETURNING i.variant_id, c.quantity, i.on_hand, i.reserved
    `)) as unknown as {
      variant_id: string;
      quantity: number;
      on_hand: number;
      reserved: number;
    }[];

    for (const row of released) {
      await tx.execute(raw`
        INSERT INTO inventory_movements
          (variant_id, reason, on_hand_delta, reserved_delta,
           on_hand_after, reserved_after, reference_type, note)
        VALUES
          (${row.variant_id}, 'order_released', 0, ${-row.quantity},
           ${row.on_hand}, ${row.reserved}, 'data_cleanup',
           'Reservation released by operating-data cleanup')
      `);
    }

    await tx.execute(raw`DELETE FROM orders WHERE id IN (${idList})`);
    if (released.length > 0) {
      console.warn(
        `
Released reservations on ${released.length} variants.`,
      );
    }
  });

  const after = (await db.execute(raw`
    SELECT COUNT(*)::int AS orders FROM orders
  `)) as unknown as { orders: number }[];

  console.warn(
    `\nRemoved ${orphans.length} demo orders. Orders now: ${after[0]!.orders}`,
  );
  await connection.end();
}

main().catch(async (error) => {
  console.error(error);
  await connection.end();
  process.exit(1);
});
