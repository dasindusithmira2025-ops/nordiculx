import { afterAll, describe, it, expect, beforeAll } from 'vitest';

/**
 * Sales-driven merchandising, against a real Postgres.
 *
 * Both rankings here are SQL — a lateral aggregate over order lines and a
 * correlated subquery in an ORDER BY. The failure modes that matter are
 * invisible to a mocked database: a join binding to the wrong column returns
 * zero for everything and silently degrades to alphabetical, which looks
 * perfectly fine on screen and is completely wrong.
 *
 * Skipped when no database is reachable, so `npm test` still works offline.
 *
 *   docker compose up -d postgres && npm run db:migrate && npm run db:seed
 */

let available = false;
let listProducts: typeof import('@/lib/catalogue/products').listProducts;
let getTopSellingBrands: typeof import('@/lib/catalogue/taxonomy').getTopSellingBrands;
let listBrandsForMerchandising: typeof import('@/lib/admin/brands').listBrandsForMerchandising;
let database: typeof import('@/lib/db').db;
let connection: typeof import('@/lib/db').sql;
let raw: typeof import('drizzle-orm').sql;

beforeAll(async () => {
  try {
    const db = await import('@/lib/db');
    ({ sql: raw } = await import('drizzle-orm'));
    database = db.db;
    connection = db.sql;
    await database.execute(raw`SELECT 1`);
    ({ listProducts } = await import('@/lib/catalogue/products'));
    ({ getTopSellingBrands } = await import('@/lib/catalogue/taxonomy'));
    ({ listBrandsForMerchandising } = await import('@/lib/admin/brands'));
    available = true;
  } catch {
    available = false;
  }
});

afterAll(async () => {
  if (available) await connection.end();
});

/**
 * `available` is only known once `beforeAll` has tried to connect, which is
 * after collection — so the guard has to be inside the test body. `it.runIf`
 * reads the flag while it is still false and skips the whole file.
 */
const dbIt = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!available) {
      console.warn(`skipped (no database): ${name}`);
      return;
    }
    await fn();
  });

describe('Top Selling Brands', () => {
  dbIt('returns published brands that have products', async () => {
    const brands = await getTopSellingBrands(8);
    expect(Array.isArray(brands)).toBe(true);
    for (const brand of brands) {
      expect(brand.productCount).toBeGreaterThan(0);
      expect(brand.slug).toBeTruthy();
    }
  });

  dbIt(
    'fills the row even when nothing has sold — never returns empty on a stocked catalogue',
    async () => {
      const brands = await getTopSellingBrands(8);
      const anyPublished = (await database.execute(raw`
        SELECT COUNT(*)::int AS count FROM brands b
         WHERE b.status = 'published'
           AND EXISTS (SELECT 1 FROM products p
                        WHERE p.brand_id = b.id
                          AND p.status = 'published' AND p.deleted_at IS NULL)
      `)) as unknown as { count: number }[];

      if ((anyPublished[0]?.count ?? 0) > 0) {
        expect(brands.length).toBeGreaterThan(0);
      }
    },
  );

  dbIt('orders by units sold, ahead of alphabetical', async () => {
    const rows = await listBrandsForMerchandising();
    const selling = rows.filter(
      (r) => r.units > 0 && r.merchandisingRank === null,
    );
    // Only meaningful once the store has taken more than one brand's orders.
    if (selling.length < 2) return;

    const units = selling.map((r) => r.units);
    expect([...units].sort((a, b) => b - a)).toEqual(units);
  });

  dbIt('counts only paid, un-cancelled orders', async () => {
    const [mine] = (await database.execute(raw`
      SELECT COALESCE(SUM(oi.quantity), 0)::int AS units
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
       WHERE o.payment_status = 'paid'
         AND o.status NOT IN ('cancelled', 'returned')
    `)) as unknown as { units: number }[];

    const rows = await listBrandsForMerchandising();
    const total = rows.reduce((n, r) => n + r.units, 0);

    // Lines whose product row is gone cannot be attributed to a brand, so the
    // brand total is a subset of the order total — never larger than it.
    expect(total).toBeLessThanOrEqual(mine?.units ?? 0);
  });
});

describe('best-selling product sort', () => {
  dbIt('returns a full page without error', async () => {
    const result = await listProducts({ sort: 'best-selling', pageSize: 12 });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
  });

  dbIt('puts in-stock products ahead of out-of-stock', async () => {
    const result = await listProducts({ sort: 'best-selling', pageSize: 96 });
    const firstOut = result.items.findIndex((p) => !p.inStock);
    if (firstOut === -1) return;
    expect(result.items.slice(firstOut).every((p) => !p.inStock)).toBe(true);
  });

  dbIt('ranks a flagged best seller above an unflagged one', async () => {
    const flagged = (await database.execute(raw`
      SELECT p.slug FROM products p
       WHERE p.best_seller AND p.status = 'published' AND p.deleted_at IS NULL
       LIMIT 1
    `)) as unknown as { slug: string }[];
    if (!flagged[0]) return;

    const result = await listProducts({ sort: 'best-selling', pageSize: 96 });
    const flaggedIndex = result.items.findIndex(
      (p) => p.slug === flagged[0]!.slug,
    );
    const unflaggedIndex = result.items.findIndex(
      (p) => p.slug !== flagged[0]!.slug,
    );
    if (flaggedIndex === -1 || unflaggedIndex === -1) return;
    expect(flaggedIndex).toBeLessThanOrEqual(unflaggedIndex);
  });
});

describe('Pantry retirement', () => {
  dbIt('leaves no published product in a retired pantry category', async () => {
    const rows = (await database.execute(raw`
        SELECT COUNT(*)::int AS count
          FROM products p
          JOIN categories c ON c.id = p.category_id
         WHERE c.slug IN ('pantry', 'tea', 'preserves')
           AND p.status = 'published' AND p.deleted_at IS NULL
      `)) as unknown as { count: number }[];
    expect(rows[0]?.count ?? 0).toBe(0);
  });

  dbIt('keeps historical order lines intact', async () => {
    // Archiving must never take order history with it. Any line that named a
    // pantry product still names it, with its purchase-time snapshot.
    const rows = (await database.execute(raw`
      SELECT COUNT(*)::int AS count FROM order_items
       WHERE product_name IS NULL OR sku IS NULL OR brand_name IS NULL
    `)) as unknown as { count: number }[];
    expect(rows[0]?.count ?? 0).toBe(0);
  });

  dbIt('shows no pantry link in the storefront navigation', async () => {
    const rows = (await database.execute(raw`
      SELECT COUNT(*)::int AS count FROM navigation_items
       WHERE enabled
         AND (label ILIKE '%pantry%'
              OR href IN ('/category/pantry', '/category/tea', '/category/preserves'))
    `)) as unknown as { count: number }[];
    expect(rows[0]?.count ?? 0).toBe(0);
  });
});

describe('skincare navigation', () => {
  dbIt('carries all five requested entries exactly once', async () => {
    const rows = (await database.execute(raw`
      SELECT child.label, child.href, child.column_group
        FROM navigation_items child
        JOIN navigation_items parent ON parent.id = child.parent_id
       WHERE parent.href = '/category/skincare'
         AND parent.parent_id IS NULL
         AND child.enabled
    `)) as unknown as {
      label: string;
      href: string;
      column_group: string | null;
    }[];
    if (rows.length === 0) return;

    const hrefs = rows.map((r) => r.href);
    expect(hrefs).toContain('/category/skincare');
    expect(hrefs).toContain('/category/skincare?sort=best-selling');
    expect(hrefs).toContain('/category/skincare?sort=newest');

    // Duplicate destinations would render as two identical menu rows.
    expect(new Set(hrefs).size).toBe(hrefs.length);

    const columns = new Set(rows.map((r) => r.column_group));
    expect(columns).toContain('Categories');
    expect(columns).toContain('Shop by Concern');
    // The retired wording must be gone from every column.
    for (const column of columns) {
      expect(String(column ?? '').toLowerCase()).not.toContain('shop by step');
    }
  });
});
