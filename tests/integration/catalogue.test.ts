import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * Catalogue integration tests.
 *
 * These run against a real seeded Postgres, because the defects they exist to
 * catch — a correlated subquery binding to the wrong column, a filter that
 * silently matches nothing — are invisible to a mocked database. They are
 * skipped when no database is reachable so `npm test` still works offline.
 *
 *   docker compose up -d postgres && npm run db:migrate && npm run db:seed
 */

let available = false;
let listProducts: typeof import('@/lib/catalogue/products').listProducts;
let getProductFacets: typeof import('@/lib/catalogue/products').getProductFacets;
let getProductBySlug: typeof import('@/lib/catalogue/products').getProductBySlug;
let getConcerns: typeof import('@/lib/catalogue/taxonomy').getConcerns;
let getBrands: typeof import('@/lib/catalogue/taxonomy').getBrands;
let search: typeof import('@/lib/catalogue/search').search;
let connection: typeof import('@/lib/db').sql;

beforeAll(async () => {
  try {
    const db = await import('@/lib/db');
    connection = db.sql;
    await db.db.execute((await import('drizzle-orm')).sql`SELECT 1`);
    ({ listProducts, getProductFacets, getProductBySlug } =
      await import('@/lib/catalogue/products'));
    ({ getConcerns, getBrands } = await import('@/lib/catalogue/taxonomy'));
    ({ search } = await import('@/lib/catalogue/search'));
    available = true;
  } catch {
    available = false;
  }
});

/**
 * Fixtures are discovered from whatever catalogue the database holds rather
 * than hard-coded, because there are two legitimate seedings: the demo
 * catalogue (`db:reset --seed`) and the real one on its own
 * (`--no-demo-catalogue` + `migrate:catalogue`). These tests assert query
 * behaviour, which must hold either way.
 */
let sampleBrandSlug: string | null = null;
let sampleProductSlug: string | null = null;
let multiVariantSlug: string | null = null;
let sampleCategorySlug: string | null = null;

beforeAll(async () => {
  if (!available) return;
  const brands = await getBrands();
  const withProducts = brands.filter((b) => Number(b.productCount ?? 0) > 0);
  // A brand filter can only be shown to narrow the set when another brand exists.
  if (withProducts.length > 1) sampleBrandSlug = withProducts[0]!.slug;

  const listing = await listProducts({ pageSize: 96 });
  sampleProductSlug = listing.items[0]?.slug ?? null;

  // Categories come from the facets: the card view does not carry one.
  const facets = await getProductFacets({});
  sampleCategorySlug =
    facets.categories.find((c) => Number(c.count ?? 0) > 0)?.slug ?? null;

  for (const item of listing.items) {
    const product = await getProductBySlug(item.slug);
    if (product && product.variants.length > 1) {
      multiVariantSlug = item.slug;
      break;
    }
  }
});

const dbIt = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!available) {
      console.warn(`skipped (no database): ${name}`);
      return;
    }
    await fn();
  });

/** Skips when the seeded catalogue cannot supply the fixture the test needs. */
const withFixture = (
  name: string,
  fixture: () => string | null,
  fn: (value: string) => Promise<void>,
) =>
  dbIt(name, async () => {
    const value = fixture();
    if (!value) {
      console.warn(`skipped (catalogue has no suitable fixture): ${name}`);
      return;
    }
    await fn(value);
  });

describe('taxonomy counts', () => {
  /**
   * Regression: these counts came from a correlated subquery whose outer
   * column was interpolated by the ORM and rendered UNQUALIFIED as "id". Inside
   * the subquery that resolved to products.id, so every count silently
   * returned 0 — no error, no crash, just a homepage section that vanished.
   */
  dbIt('concern product counts are populated, not silently zero', async () => {
    const concerns = await getConcerns();
    expect(concerns.length).toBeGreaterThan(0);
    const total = concerns.reduce((sum, c) => sum + Number(c.productCount), 0);
    expect(total).toBeGreaterThan(0);
  });

  dbIt('brand product counts are populated, not silently zero', async () => {
    const brands = await getBrands();
    expect(brands.length).toBeGreaterThan(0);
    const total = brands.reduce((sum, b) => sum + Number(b.productCount), 0);
    expect(total).toBeGreaterThan(0);
  });
});

describe('listProducts', () => {
  dbIt(
    'returns published products with resolved prices and imagery',
    async () => {
      const result = await listProducts({ pageSize: 6 });
      expect(result.items.length).toBeGreaterThan(0);
      for (const item of result.items) {
        expect(item.effectivePrice).toBeGreaterThan(0);
        expect(item.brandName).toBeTruthy();
        expect(item.image).not.toBeNull();
      }
    },
  );

  dbIt('paginates without overlapping between pages', async () => {
    const first = await listProducts({ pageSize: 4, page: 1, sort: 'name' });
    const second = await listProducts({ pageSize: 4, page: 2, sort: 'name' });
    const overlap = first.items.filter((a) =>
      second.items.some((b) => b.id === a.id),
    );
    expect(overlap).toHaveLength(0);
    expect(first.total).toBe(second.total);
  });

  withFixture(
    'filters by brand and the filter actually narrows the set',
    () => sampleBrandSlug,
    async (brand) => {
      const all = await listProducts({ pageSize: 96 });
      const filtered = await listProducts({
        pageSize: 96,
        filters: { brandSlugs: [brand] },
      });
      expect(filtered.items.length).toBeGreaterThan(0);
      expect(filtered.items.length).toBeLessThan(all.total);
      expect(filtered.items.every((p) => p.brandSlug === brand)).toBe(true);
    },
  );

  dbIt('filters by concern', async () => {
    const filtered = await listProducts({
      pageSize: 96,
      filters: { concernSlugs: ['dryness'] },
    });
    expect(filtered.items.length).toBeGreaterThan(0);
  });

  dbIt('a parent category includes its children', async () => {
    const parent = await listProducts({
      pageSize: 96,
      filters: { categorySlugs: ['skincare'] },
    });
    const child = await listProducts({
      pageSize: 96,
      filters: { categorySlugs: ['serums'] },
    });
    expect(child.items.length).toBeGreaterThan(0);
    expect(parent.total).toBeGreaterThan(child.total);
  });

  dbIt('in-stock filter excludes sold-out products', async () => {
    const inStock = await listProducts({
      pageSize: 96,
      filters: { inStockOnly: true },
    });
    expect(inStock.items.every((p) => p.inStock)).toBe(true);
  });

  dbIt('price sort is monotonic', async () => {
    const asc = await listProducts({ pageSize: 96, sort: 'price-asc' });
    const prices = asc.items.map((p) => p.effectivePrice);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });

  dbIt(
    'returns an empty result for a filter that matches nothing',
    async () => {
      const none = await listProducts({
        pageSize: 12,
        filters: { brandSlugs: ['no-such-brand'] },
      });
      expect(none.items).toHaveLength(0);
      expect(none.total).toBe(0);
      expect(none.totalPages).toBe(1);
    },
  );
});

describe('facets', () => {
  withFixture(
    'a selected dimension stays fully selectable',
    () => sampleBrandSlug,
    async (brand) => {
      const unfiltered = await getProductFacets({});
      const filtered = await getProductFacets({ brandSlugs: [brand] });

      // Counting brands against the brand filter would leave only Kvist here,
      // making a second brand impossible to add.
      expect(filtered.brands.map((b) => b.slug).sort()).toEqual(
        unfiltered.brands.map((b) => b.slug).sort(),
      );
      expect(filtered.priceRange.max).toBeGreaterThan(0);
    },
  );

  withFixture(
    'other dimensions do narrow to the active filters',
    () => sampleBrandSlug,
    async (brand) => {
      const unfiltered = await getProductFacets({});
      const filtered = await getProductFacets({ brandSlugs: [brand] });

      // Concerns are a different dimension, so they must reflect the brand.
      expect(filtered.concerns.length).toBeLessThanOrEqual(
        unfiltered.concerns.length,
      );
    },
  );

  dbIt('the price range ignores its own bounds', async () => {
    const full = await getProductFacets({});
    const bounded = await getProductFacets({
      minPrice: full.priceRange.min,
      maxPrice: Math.round(
        full.priceRange.min + (full.priceRange.max - full.priceRange.min) / 4,
      ),
    });

    // Narrowing the slider must not shrink the slider's own bounds, or it
    // becomes impossible to widen the range again.
    expect(bounded.priceRange).toEqual(full.priceRange);
  });

  withFixture(
    'route-locked filters still constrain every dimension',
    () => sampleCategorySlug,
    async (category) => {
      const locked = await getProductFacets({}, { categorySlugs: [category] });
      // The lock is not a removable refinement, so it applies even to the
      // dimension being counted.
      expect(locked.brands.length).toBeGreaterThan(0);
      expect(
        locked.brands.reduce((sum, b) => sum + b.count, 0),
      ).toBeGreaterThan(0);
    },
  );
});

describe('getProductBySlug', () => {
  withFixture(
    'returns a fully hydrated product',
    () => sampleProductSlug,
    async (slug) => {
      const product = await getProductBySlug(slug);
      expect(product).not.toBeNull();
      expect(product!.variants.length).toBeGreaterThan(0);
      expect(product!.media.length).toBeGreaterThan(0);
      // Every variant must price itself; a null price would render "$0".
      for (const variant of product!.variants) {
        expect(variant.effectivePrice).toBeGreaterThanOrEqual(0);
      }
    },
  );

  withFixture(
    'exposes every variant of a multi-variant product',
    () => multiVariantSlug,
    async (slug) => {
      const product = await getProductBySlug(slug);
      expect(product!.variants.length).toBeGreaterThan(1);
      const skus = product!.variants.map((v) => v.sku);
      expect(new Set(skus).size).toBe(skus.length);
    },
  );

  dbIt('returns null for an unknown slug rather than throwing', async () => {
    expect(await getProductBySlug('does-not-exist')).toBeNull();
  });
});

describe('search', () => {
  withFixture(
    'matches a brand name',
    () => sampleBrandSlug,
    async (brand) => {
      const results = await search(brand.replace(/-/g, ' '));
      expect(results.total).toBeGreaterThan(0);
    },
  );

  dbIt('matches a partial word', async () => {
    const results = await search('clea');
    expect(results.products.length).toBeGreaterThan(0);
  });

  dbIt('returns nothing for a query below the minimum length', async () => {
    const results = await search('a');
    expect(results.total).toBe(0);
  });

  dbIt('returns an empty result set for gibberish', async () => {
    const results = await search('zzzzqqqqxxxx');
    expect(results.total).toBe(0);
  });
});

// Close the pool so vitest exits cleanly.
afterAll(async () => {
  if (available && connection) await connection.end();
});
