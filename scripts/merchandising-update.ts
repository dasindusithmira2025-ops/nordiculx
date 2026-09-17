import './load-env';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql as raw } from 'drizzle-orm';
import postgres from 'postgres';
import * as s from '@/lib/db/schema';

/**
 * Applies the 2026 merchandising update to an existing database.
 *
 * `npm run db:seed` only ever runs against an empty database, so the three
 * changes below — which are all DATA, not schema — need a script of their own
 * to reach a store that is already trading:
 *
 *   A. Skincare navigation. "Shop by step" becomes "Categories", an explicit
 *      "All Skincare" link is added, and Best Sellers / New Arrivals join the
 *      Discover column.
 *   B. Pantry is retired from the storefront.
 *   C. The homepage brand row is retitled "Top Selling Brands" (its ordering
 *      is computed at request time — see getTopSellingBrands).
 *
 * NOTHING here deletes a row. Pantry is retired by setting `status` to
 * 'archived' on the categories, their products, those products' variants and
 * the brand that supplied them; every product id, SKU, order line and stock
 * ledger entry stays exactly where it was. Reversing the decision is an
 * UPDATE, not a restore from backup. Navigation rows are the one exception to
 * "nothing is removed" — a menu link carries no history and a disabled row
 * would still be listed in the admin — so retired links are deleted, and they
 * are trivially re-addable from /admin/content?tab=navigation.
 *
 * Idempotent: every statement is written so a second run is a no-op.
 *
 *   npm run merchandising:update -- --dry-run
 *   npm run merchandising:update
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

/** Category slugs that made up the Pantry range. */
const PANTRY_CATEGORIES = ['pantry', 'tea', 'preserves'];
/** Supplier whose entire range was Pantry. */
const PANTRY_BRANDS = ['saga-pantry'];

/**
 * `IN (...)` over a JS array.
 *
 * Interpolating the array directly renders as a parenthesised tuple, which
 * Postgres rejects for `= ANY()` — each element still becomes its own bound
 * parameter here, so this is a list of placeholders, not string concatenation.
 */
const inList = (values: readonly string[]) =>
  raw.join(
    values.map((value) => raw`${value}`),
    raw`, `,
  );

type Count = { count: number }[];
const countOf = (rows: unknown) => (rows as Count)[0]?.count ?? 0;

async function report() {
  const categories = (await db.execute(raw`
    SELECT slug, name, status FROM categories
     WHERE slug IN (${inList(PANTRY_CATEGORIES)})
  `)) as unknown as { slug: string; name: string; status: string }[];

  const products = (await db.execute(raw`
    SELECT p.slug, p.name, p.status
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN brands b ON b.id = p.brand_id
     WHERE c.slug IN (${inList(PANTRY_CATEGORIES)}) OR b.slug IN (${inList(PANTRY_BRANDS)})
     ORDER BY p.name
  `)) as unknown as { slug: string; name: string; status: string }[];

  const orderLines = countOf(
    await db.execute(raw`
      SELECT COUNT(*)::int AS count FROM order_items oi
       WHERE oi.product_id IN (
         SELECT p.id FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
         LEFT JOIN brands b ON b.id = p.brand_id
         WHERE c.slug IN (${inList(PANTRY_CATEGORIES)}) OR b.slug IN (${inList(PANTRY_BRANDS)})
       )
    `),
  );

  console.warn('\nPantry categories found:');
  for (const c of categories) console.warn(`  ${c.slug} (${c.status})`);
  console.warn('\nPantry products found:');
  for (const p of products) console.warn(`  ${p.slug} (${p.status})`);
  console.warn(
    `\n${orderLines} historical order line(s) reference these products.`,
  );
  console.warn('They are NOT touched — order history is preserved verbatim.\n');
}

/* --- A. skincare navigation ----------------------------------------------- */

async function updateSkincareNavigation(tx: typeof db) {
  const parent = (await tx.execute(raw`
    SELECT id FROM navigation_items
     WHERE location = 'header' AND parent_id IS NULL
       AND href = '/category/skincare'
     LIMIT 1
  `)) as unknown as { id: string }[];

  const parentId = parent[0]?.id;
  if (!parentId) {
    console.warn('No Skincare header item — navigation left untouched.');
    return;
  }

  // "Shop by step" is a merchandiser's phrase; the client asked customers to
  // be shown "Categories". Only the COLUMN LABEL changes: the links, their
  // hrefs and the category slugs behind them are untouched, so every existing
  // /category/... route keeps working and no product moves.
  await tx.execute(raw`
    UPDATE navigation_items SET column_group = 'Categories', updated_at = NOW()
     WHERE parent_id = ${parentId} AND column_group ILIKE 'shop by step%'
  `);
  await tx.execute(raw`
    UPDATE navigation_items SET column_group = 'Shop by Concern', updated_at = NOW()
     WHERE parent_id = ${parentId} AND column_group = 'Shop by concern'
  `);

  // Make room at the front of the column for "All Skincare".
  //
  // Guarded on that row NOT existing yet: an unguarded shift is the classic
  // non-idempotent migration statement — it looks correct, it runs clean, and
  // a second run silently pushes the whole column along by one again.
  await tx.execute(raw`
    UPDATE navigation_items SET sort_order = sort_order + 1, updated_at = NOW()
     WHERE parent_id = ${parentId} AND column_group = 'Categories'
       AND href <> '/category/skincare'
       AND NOT EXISTS (
         SELECT 1 FROM navigation_items existing
          WHERE existing.parent_id = ${parentId}
            AND existing.href = '/category/skincare'
       )
  `);

  const additions = [
    {
      label: 'All Skincare',
      href: '/category/skincare',
      column: 'Categories',
      sortOrder: 0,
    },
    // Ahead of the Routine Finder and the collection links, which the seed
    // numbers from 10 up. These are the two entries the client named, so they
    // lead the column rather than trailing it.
    {
      label: 'Best Sellers',
      href: '/category/skincare?sort=best-selling',
      column: 'Discover',
      sortOrder: 6,
    },
    {
      label: 'New Arrivals',
      href: '/category/skincare?sort=newest',
      column: 'Discover',
      sortOrder: 7,
    },
  ];

  for (const item of additions) {
    // Matched on href, not label: re-running must not produce a second row,
    // and a label somebody has since reworded in the admin is still the same
    // destination.
    await tx.execute(raw`
      INSERT INTO navigation_items
        (location, parent_id, label, href, column_group, enabled, sort_order)
      SELECT 'header', ${parentId}, ${item.label}, ${item.href},
             ${item.column}, TRUE, ${item.sortOrder}
       WHERE NOT EXISTS (
         SELECT 1 FROM navigation_items
          WHERE parent_id = ${parentId} AND href = ${item.href}
       )
    `);
  }

  console.warn('Skincare navigation updated.');
}

/* --- B. retire Pantry ----------------------------------------------------- */

async function retirePantry(tx: typeof db) {
  // Nav first: a link to a page that is about to stop resolving is the one
  // ordering that can be seen by a customer mid-run.
  await tx.execute(raw`
    DELETE FROM navigation_items
     WHERE href IN ('/category/pantry', '/category/tea', '/category/preserves')
  `);
  await tx.execute(raw`
    UPDATE navigation_items SET label = 'Wellness', updated_at = NOW()
     WHERE label = 'Wellness & Pantry'
  `);

  await tx.execute(raw`
    UPDATE product_variants SET status = 'archived', updated_at = NOW()
     WHERE product_id IN (
       SELECT p.id FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN brands b ON b.id = p.brand_id
       WHERE c.slug IN (${inList(PANTRY_CATEGORIES)}) OR b.slug IN (${inList(PANTRY_BRANDS)})
     ) AND status <> 'archived'
  `);

  await tx.execute(raw`
    UPDATE products SET status = 'archived', updated_at = NOW()
     WHERE id IN (
       SELECT p.id FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN brands b ON b.id = p.brand_id
       WHERE c.slug IN (${inList(PANTRY_CATEGORIES)}) OR b.slug IN (${inList(PANTRY_BRANDS)})
     ) AND status <> 'archived'
  `);

  await tx.execute(raw`
    UPDATE categories SET status = 'archived', show_in_navigation = FALSE,
                          updated_at = NOW()
     WHERE slug IN (${inList(PANTRY_CATEGORIES)}) AND status <> 'archived'
  `);

  // The brand is only retired once it has nothing left to sell. A supplier
  // that also stocks skincare must keep its brand page.
  await tx.execute(raw`
    UPDATE brands SET status = 'archived', featured = FALSE, updated_at = NOW()
     WHERE slug IN (${inList(PANTRY_BRANDS)})
       AND status <> 'archived'
       AND NOT EXISTS (
         SELECT 1 FROM products p
          WHERE p.brand_id = brands.id
            AND p.status = 'published' AND p.deleted_at IS NULL
       )
  `);

  console.warn('Pantry retired (archived, not deleted).');
}

/* --- C. top selling brands ------------------------------------------------ */

async function retireePantryCopy(tx: typeof db) {
  // Seeded homepage copy still sold the range in words. Matched on the exact
  // seeded string so a sentence a merchandiser has since rewritten is left
  // alone rather than being silently reverted.
  await tx.execute(raw`
    UPDATE homepage_sections
       SET description = REPLACE(description, 'skincare, fragrance and pantry',
                                 'skincare, fragrance and wellness'),
           updated_at = NOW()
     WHERE description ILIKE '%skincare, fragrance and pantry%'
  `);
  console.warn('Homepage copy updated.');
}

async function retitleBrandRow(tx: typeof db) {
  // The section's ORDER is computed per request from paid orders; this only
  // changes what it is called. Staff can reword it again in the admin.
  await tx.execute(raw`
    UPDATE homepage_sections
       SET eyebrow = 'The makers',
           title = 'Top Selling Brands',
           updated_at = NOW()
     WHERE kind = 'brand_marquee' AND title IS DISTINCT FROM 'Top Selling Brands'
  `);
  console.warn('Homepage brand row retitled "Top Selling Brands".');
}

async function main() {
  await report();

  if (DRY_RUN) {
    console.warn('--dry-run: nothing was written.');
    await connection.end();
    return;
  }

  await db.transaction(async (tx) => {
    await updateSkincareNavigation(tx as unknown as typeof db);
    await retirePantry(tx as unknown as typeof db);
    await retireePantryCopy(tx as unknown as typeof db);
    await retitleBrandRow(tx as unknown as typeof db);
  });

  console.warn('\nDone. Restart or revalidate the storefront to see changes.');
  await connection.end();
}

main().catch(async (error) => {
  console.error(error);
  await connection.end();
  process.exit(1);
});
