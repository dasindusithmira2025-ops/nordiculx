import '../../../scripts/load-env';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq, inArray, sql as raw } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as s from '@/lib/db/schema';
import { extractProducts, LEGACY_SOURCE, type LegacyProduct } from './extract';
import {
  CATEGORY_MAP,
  mapCatalogue,
  normaliseKey,
  type MappedProduct,
} from './map';
import { legacyImageExists, migrateImages, writeMediaMap } from './media';

/**
 * Phases 10–13 — dry run, import, verify.
 *
 *   npm run migrate:legacy-products -- --dry-run   zero catalogue writes
 *   npm run migrate:legacy-products                one transaction, idempotent
 *   npm run migrate:legacy-products -- --verify    compare the DB to the source
 *
 * Idempotency is keyed on the legacy SKU, which is globally unique in both
 * schemas. A second run updates the same rows instead of creating new ones, so
 * re-running after a fix is always safe. The whole import is one transaction:
 * either the catalogue moves forward completely, or not at all.
 */

/**
 * A standalone client, exactly as `scripts/migrate.ts` does it. `@/lib/db`
 * pulls in `@/lib/env`, which imports `server-only` and refuses to load outside
 * a React Server Component — the schema and the connection string are all a CLI
 * needs, and this keeps that guard intact rather than weakening it.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env first.');
  process.exit(1);
}
const connection = postgres(url, { max: 1 });
const db = drizzle(connection, { schema: s, casing: 'snake_case' });

type Database = typeof db;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const ROOT = join(import.meta.dirname, '..');
const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const VERIFY_ONLY = args.has('--verify');

const MIGRATION_NOTE = 'legacy_migration_opening_balance';

/**
 * Every write below takes its handle explicitly. Passing the transaction in is
 * what actually makes the import atomic — a helper that closed over `db` would
 * quietly run outside the transaction and leave partial products behind.
 */
type Tx = Database | Transaction;

/* --- helpers -------------------------------------------------------------- */

const money = (cents: number) => `${(cents / 100).toFixed(2)}`;

function summarise(mapped: MappedProduct[]) {
  const by = (state: string) => mapped.filter((m) => m.state === state);
  const skus = mapped.map((m) => m.legacySku);
  return {
    discovered: mapped.length,
    ready: by('READY').length,
    review: by('REVIEW').length,
    invalid: by('INVALID').length,
    duplicateSkus: skus.filter((v, i) => skus.indexOf(v) !== i).length,
    missingImages: mapped.filter((m) => m.media.length === 0).length,
    missingPrices: mapped.filter((m) => !(m.variant.price > 0)).length,
    missingBrands: mapped.filter((m) => !m.brand.name).length,
    missingCategories: mapped.filter((m) => !m.categorySlug).length,
  };
}

function table(rows: [string, string | number][]) {
  return [
    '| Metric | Count |',
    '| --- | ---: |',
    ...rows.map(([k, v]) => `| ${k} | ${v} |`),
  ].join('\n');
}

/* --- reference data resolution -------------------------------------------- */

/**
 * Resolves brands by normalised name so "CeraVe", "Cerave" and "cera ve" can
 * never become three brands. Creates only what is genuinely absent.
 */
export async function resolveBrands(
  tx: Tx,
  mapped: MappedProduct[],
  dryRun: boolean,
) {
  const existing = await tx
    .select({ id: s.brands.id, name: s.brands.name, slug: s.brands.slug })
    .from(s.brands);
  const byKey = new Map(existing.map((b) => [normaliseKey(b.name), b]));

  const wanted = new Map<string, MappedProduct['brand']>();
  for (const m of mapped) {
    if (m.brand.name) wanted.set(normaliseKey(m.brand.name), m.brand);
  }

  const created: string[] = [];
  const reused: string[] = [];
  const idByKey = new Map<string, string>();

  for (const [key, brand] of wanted) {
    const hit = byKey.get(key);
    if (hit) {
      reused.push(hit.name);
      idByKey.set(key, hit.id);
      continue;
    }
    created.push(brand.name);
    if (dryRun) {
      idByKey.set(key, `dry-run:${brand.slug}`);
      continue;
    }
    const [row] = await tx
      .insert(s.brands)
      .values({
        name: brand.name,
        slug: brand.slug,
        originCountry: brand.originCountry,
        status: 'published',
        // Brand story, tagline and imagery are client-supplied editorial. The
        // legacy repo has none, and inventing a brand story is not migration.
        seoTitle: `${brand.name} at Nordic Lux`,
      })
      .returning({ id: s.brands.id });
    idByKey.set(key, row!.id);
  }

  return { idByKey, created, reused };
}

export async function resolveCategories(
  tx: Tx,
  mapped: MappedProduct[],
  dryRun: boolean,
  /**
   * Category definitions to create from when a slug is missing. Defaults to
   * the legacy migration's map; the full-catalogue import passes its own,
   * which adds shelves the legacy set never needed (Masks & Patches).
   */
  categorySpecs: {
    slug: string;
    name: string;
    parent: string | null;
  }[] = Object.values(CATEGORY_MAP),
) {
  const existing = await tx
    .select({ id: s.categories.id, slug: s.categories.slug })
    .from(s.categories);
  const idBySlug = new Map(existing.map((c) => [c.slug, c.id]));

  const wanted = new Set(
    mapped.flatMap((m) => (m.categorySlug ? [m.categorySlug] : [])),
  );
  const specs = categorySpecs;
  const created: string[] = [];
  const reused: string[] = [];

  for (const slug of wanted) {
    if (idBySlug.has(slug)) {
      reused.push(slug);
      continue;
    }
    const spec = specs.find((c) => c.slug === slug);
    if (!spec) throw new Error(`no category spec for slug "${slug}"`);
    created.push(slug);
    if (dryRun) {
      idBySlug.set(slug, `dry-run:${slug}`);
      continue;
    }
    const [row] = await tx
      .insert(s.categories)
      .values({
        name: spec.name,
        slug: spec.slug,
        parentId: spec.parent ? (idBySlug.get(spec.parent) ?? null) : null,
        status: 'published',
        showInNavigation: true,
        seoTitle: `${spec.name} | Nordic Lux`,
      })
      .returning({ id: s.categories.id });
    idBySlug.set(slug, row!.id);
  }

  return { idBySlug, created, reused };
}

export async function resolveIngredients(
  tx: Tx,
  mapped: MappedProduct[],
  dryRun: boolean,
) {
  const existing = await tx
    .select({ id: s.ingredients.id, name: s.ingredients.name })
    .from(s.ingredients);
  const idByKey = new Map(existing.map((i) => [normaliseKey(i.name), i.id]));

  const wanted = new Map<string, MappedProduct['keyIngredients'][number]>();
  for (const m of mapped) {
    for (const ing of m.keyIngredients) {
      if (!wanted.has(normaliseKey(ing.name)))
        wanted.set(normaliseKey(ing.name), ing);
    }
  }

  const created: string[] = [];
  for (const [key, ing] of wanted) {
    if (idByKey.has(key)) continue;
    created.push(ing.name);
    if (dryRun) {
      idByKey.set(key, `dry-run:${ing.slug}`);
      continue;
    }
    const [row] = await tx
      .insert(s.ingredients)
      .values({
        name: ing.name,
        slug: ing.slug,
        // Legacy supplies this copy; it is carried over verbatim, not written.
        benefitSummary: ing.description,
      })
      .returning({ id: s.ingredients.id });
    idByKey.set(key, row!.id);
  }

  return { idByKey, created };
}

/* --- import --------------------------------------------------------------- */

type ImportStats = {
  productsInserted: number;
  productsUpdated: number;
  variantsInserted: number;
  variantsUpdated: number;
  mediaRows: number;
  inventoryRows: number;
  inventoryMovements: number;
  concernLinks: number;
  ingredientLinks: number;
  skipped: string[];
};

export async function importCatalogue(tx: Tx, mapped: MappedProduct[]) {
  const importable = mapped.filter((m) => m.state !== 'INVALID');
  const stats: ImportStats = {
    productsInserted: 0,
    productsUpdated: 0,
    variantsInserted: 0,
    variantsUpdated: 0,
    mediaRows: 0,
    inventoryRows: 0,
    inventoryMovements: 0,
    concernLinks: 0,
    ingredientLinks: 0,
    skipped: mapped
      .filter((m) => m.state === 'INVALID')
      .map((m) => m.legacySku),
  };

  const brands = await resolveBrands(tx, importable, false);
  const categories = await resolveCategories(tx, importable, false);
  const ingredients = await resolveIngredients(tx, importable, false);

  const concernRows = await tx
    .select({ id: s.concerns.id, slug: s.concerns.slug })
    .from(s.concerns);
  const concernBySlug = new Map(concernRows.map((c) => [c.slug, c.id]));

  for (const m of importable) {
    const brandId = brands.idByKey.get(normaliseKey(m.brand.name))!;
    const categoryId = m.categorySlug
      ? (categories.idBySlug.get(m.categorySlug) ?? null)
      : null;

    // The legacy SKU is the identity. Finding its variant finds the product,
    // which is what makes a second run an update rather than a duplicate.
    const [existingVariant] = await tx
      .select({
        id: s.productVariants.id,
        productId: s.productVariants.productId,
      })
      .from(s.productVariants)
      .where(eq(s.productVariants.sku, m.variant.sku))
      .limit(1);

    const productValues = {
      name: m.product.name,
      brandId,
      categoryId,
      excerpt: m.product.excerpt,
      description: m.product.description,
      benefits: m.product.benefits,
      howToUse: m.product.howToUse,
      ingredientsList: m.product.ingredientsList,
      suitableSkinTypes: m.product.suitableSkinTypes,
      routineStep: m.product.routineStep,
      status: m.product.status,
      seoTitle: m.product.seoTitle,
      seoDescription: m.product.seoDescription,
      deletedAt: null,
      updatedAt: new Date(),
    };

    let productId: string;
    if (existingVariant) {
      productId = existingVariant.productId;
      await tx
        .update(s.products)
        .set(productValues)
        .where(eq(s.products.id, productId));
      stats.productsUpdated += 1;
    } else {
      const [row] = await tx
        .insert(s.products)
        .values({ ...productValues, slug: m.product.slug })
        .returning({ id: s.products.id });
      productId = row!.id;
      stats.productsInserted += 1;
    }

    /* variant + price */
    const variantValues = {
      productId,
      name: m.variant.name,
      price: m.variant.price,
      salePrice: m.variant.salePrice,
      volumeMl: m.variant.volumeMl,
      imageUrl: m.media[0]?.url ?? null,
      status: m.product.status,
      isDefault: true,
      sortOrder: 0,
      deletedAt: null,
      updatedAt: new Date(),
    };

    let variantId: string;
    if (existingVariant) {
      variantId = existingVariant.id;
      await tx
        .update(s.productVariants)
        .set(variantValues)
        .where(eq(s.productVariants.id, variantId));
      stats.variantsUpdated += 1;
    } else {
      const [row] = await tx
        .insert(s.productVariants)
        .values({ ...variantValues, sku: m.variant.sku })
        .returning({ id: s.productVariants.id });
      variantId = row!.id;
      stats.variantsInserted += 1;
    }

    /* media — replaced wholesale so a re-run cannot accumulate gallery rows */
    await tx
      .delete(s.productMedia)
      .where(eq(s.productMedia.productId, productId));
    if (m.media.length > 0) {
      await tx.insert(s.productMedia).values(
        m.media.map((img) => ({
          productId,
          variantId,
          kind: 'image' as const,
          url: img.url,
          alt: img.alt,
          sortOrder: img.sortOrder,
        })),
      );
      stats.mediaRows += m.media.length;
    }

    /* inventory — an opening balance, never a silent overwrite */
    const [inventory] = await tx
      .select({
        id: s.inventoryItems.id,
        onHand: s.inventoryItems.onHand,
        reserved: s.inventoryItems.reserved,
      })
      .from(s.inventoryItems)
      .where(eq(s.inventoryItems.variantId, variantId))
      .limit(1);

    if (!inventory) {
      await tx.insert(s.inventoryItems).values({
        variantId,
        onHand: m.inventory.onHand,
        reserved: 0,
      });
      await tx.insert(s.inventoryMovements).values({
        variantId,
        reason: 'received',
        onHandDelta: m.inventory.onHand,
        reservedDelta: 0,
        onHandAfter: m.inventory.onHand,
        reservedAfter: 0,
        referenceType: 'legacy_migration',
        referenceId: m.legacySku,
        note: MIGRATION_NOTE,
      });
      stats.inventoryRows += 1;
      stats.inventoryMovements += 1;
    } else if (inventory.onHand !== m.inventory.onHand) {
      // A re-run reconciles to the legacy figure through the ledger, so the
      // correction is explainable rather than an unexplained jump in stock.
      const delta = m.inventory.onHand - inventory.onHand;
      await tx
        .update(s.inventoryItems)
        .set({ onHand: m.inventory.onHand, updatedAt: new Date() })
        .where(eq(s.inventoryItems.id, inventory.id));
      await tx.insert(s.inventoryMovements).values({
        variantId,
        reason: 'stock_take',
        onHandDelta: delta,
        reservedDelta: 0,
        onHandAfter: m.inventory.onHand,
        reservedAfter: inventory.reserved,
        referenceType: 'legacy_migration',
        referenceId: m.legacySku,
        note: `${MIGRATION_NOTE} (reconciled)`,
      });
      stats.inventoryMovements += 1;
    }

    /* concerns and key ingredients — rewritten from source each run */
    await tx
      .delete(s.productConcerns)
      .where(eq(s.productConcerns.productId, productId));
    const concernValues = m.concernSlugs.flatMap((slug) => {
      const concernId = concernBySlug.get(slug);
      return concernId ? [{ productId, concernId, relevance: 5 }] : [];
    });
    if (concernValues.length > 0) {
      await tx.insert(s.productConcerns).values(concernValues);
      stats.concernLinks += concernValues.length;
    }

    await tx
      .delete(s.productIngredients)
      .where(eq(s.productIngredients.productId, productId));
    const ingredientValues = m.keyIngredients.flatMap((ing, i) => {
      const ingredientId = ingredients.idByKey.get(normaliseKey(ing.name));
      return ingredientId
        ? [
            {
              productId,
              ingredientId,
              isKeyIngredient: true,
              concentration: ing.concentration,
              sortOrder: i,
            },
          ]
        : [];
    });
    if (ingredientValues.length > 0) {
      await tx.insert(s.productIngredients).values(ingredientValues);
      stats.ingredientLinks += ingredientValues.length;
    }
  }

  /* audit trail for the run itself */
  await tx.insert(s.auditLogs).values({
    action: 'catalogue.legacy_migration',
    entityType: 'migration',
    entityId: LEGACY_SOURCE.commit,
    changes: {
      source: {
        from: null,
        to: `${LEGACY_SOURCE.repository}@${LEGACY_SOURCE.commit}`,
      },
      products: {
        from: null,
        to: stats.productsInserted + stats.productsUpdated,
      },
      skipped: { from: null, to: stats.skipped },
    },
  });

  return { ...stats, brands, categories, ingredients };
}

/* --- verification --------------------------------------------------------- */

type Mismatch = {
  sku: string;
  field: string;
  legacy: string;
  database: string;
};

async function verify(legacy: LegacyProduct[], mapped: MappedProduct[]) {
  const expected = mapped.filter((m) => m.state !== 'INVALID');
  const skus = expected.map((m) => m.variant.sku);

  const rows = skus.length
    ? await db
        .select({
          sku: s.productVariants.sku,
          variantName: s.productVariants.name,
          price: s.productVariants.price,
          salePrice: s.productVariants.salePrice,
          status: s.productVariants.status,
          productName: s.products.name,
          productStatus: s.products.status,
          brandName: s.brands.name,
          categorySlug: s.categories.slug,
          onHand: s.inventoryItems.onHand,
          mediaCount: raw<number>`(select count(*) from product_media pm where pm.product_id = ${s.products.id})`,
        })
        .from(s.productVariants)
        .innerJoin(s.products, eq(s.products.id, s.productVariants.productId))
        .innerJoin(s.brands, eq(s.brands.id, s.products.brandId))
        .leftJoin(s.categories, eq(s.categories.id, s.products.categoryId))
        .leftJoin(
          s.inventoryItems,
          eq(s.inventoryItems.variantId, s.productVariants.id),
        )
        .where(inArray(s.productVariants.sku, skus))
    : [];

  const bySku = new Map(rows.map((r) => [r.sku, r]));
  const legacyBySku = new Map(legacy.map((l) => [l.sku, l]));
  const mismatches: Mismatch[] = [];
  const missing: string[] = [];

  for (const m of expected) {
    const row = bySku.get(m.variant.sku);
    const src = legacyBySku.get(m.legacySku)!;
    if (!row) {
      missing.push(m.variant.sku);
      continue;
    }
    const check = (field: string, legacyValue: string, dbValue: string) => {
      if (legacyValue !== dbValue)
        mismatches.push({
          sku: m.variant.sku,
          field,
          legacy: legacyValue,
          database: dbValue,
        });
    };

    check('name', m.product.name, row.productName);
    check('brand', m.brand.name, row.brandName);
    check('category', m.categorySlug ?? '(none)', row.categorySlug ?? '(none)');
    check('variant', m.variant.name, row.variantName);
    // The amount actually charged must equal the legacy price, whichever way
    // the list/sale split fell out of the mapping.
    check(
      'effective price',
      money(toEffective(m)),
      money(row.salePrice ?? row.price),
    );
    check(
      'legacy price',
      src.price.toFixed(2),
      money(row.salePrice ?? row.price),
    );
    check(
      'original price',
      src.originalPrice ? src.originalPrice.toFixed(2) : '(none)',
      row.salePrice ? money(row.price) : '(none)',
    );
    check('stock', String(src.stock), String(row.onHand ?? -1));
    check('media', String(m.media.length), String(Number(row.mediaCount)));
    check('publish status', m.product.status, row.productStatus);
  }

  const rows2 = await db.execute<{ duplicates: number }>(raw`
    select count(*)::int as duplicates from (
      select sku from product_variants group by sku having count(*) > 1
    ) d
  `);

  return {
    mismatches,
    missing,
    duplicateSkus: Number(rows2[0]?.duplicates ?? 0),
    checked: expected.length,
  };
}

const toEffective = (m: MappedProduct) =>
  m.variant.salePrice ?? m.variant.price;

/* --- reports -------------------------------------------------------------- */

function exceptionsSection(mapped: MappedProduct[]) {
  const flagged = mapped.filter(
    (m) => m.state !== 'READY' || m.notes.length > 0,
  );
  if (flagged.length === 0) return '_No exceptions._\n';
  return flagged
    .map(
      (m) =>
        `#### \`${m.legacySku}\` — ${m.state}\n\n${[
          ...m.issues.map((i) => `- **Blocking:** ${i}`),
          ...m.gaps.map((g) => `- **Gap:** ${g}`),
          ...m.notes.map((n) => `- Note: ${n}`),
        ].join('\n')}\n`,
    )
    .join('\n');
}

function unmappedTagSection(mapped: MappedProduct[]) {
  const counts = new Map<string, number>();
  for (const m of mapped)
    for (const t of m.unmappedTags) counts.set(t, (counts.get(t) ?? 0) + 1);
  if (counts.size === 0) return '_All legacy tags mapped._\n';
  return [
    'These legacy filter tags have no honest equivalent in the current taxonomy.',
    'They are preserved in `archive/legacy-products.json` and are **not** forced',
    'into the nearest concern. Creating taxonomy for them is a client content',
    'decision, not a migration one.\n',
    table([...counts].sort((a, b) => b[1] - a[1])),
  ].join('\n');
}

/* --- entry point ---------------------------------------------------------- */

async function main() {
  const legacy = extractProducts();
  const mapped = mapCatalogue(legacy, legacyImageExists);
  const counts = summarise(mapped);

  if (VERIFY_ONLY) {
    const result = await verify(legacy, mapped);
    const report = `# Post-import comparison — legacy source vs PostgreSQL

Generated ${new Date().toISOString()} from \`${LEGACY_SOURCE.repository}@${LEGACY_SOURCE.commit}\`.

Every importable legacy record is compared field by field against the database.
Counts are produced by the query, not asserted.

${table([
  ['Legacy products discovered', counts.discovered],
  ['Expected in database', result.checked],
  ['Found in database', result.checked - result.missing.length],
  ['Missing from database', result.missing.length],
  ['Duplicate SKUs in database', result.duplicateSkus],
  ['Field mismatches', result.mismatches.length],
  [
    'Price mismatches',
    result.mismatches.filter((m) => m.field.includes('price')).length,
  ],
  [
    'Stock mismatches',
    result.mismatches.filter((m) => m.field === 'stock').length,
  ],
  [
    'Media mismatches',
    result.mismatches.filter((m) => m.field === 'media').length,
  ],
])}

## Fields compared

Product name, brand, category, variant label, effective price (\`salePrice ?? price\`),
legacy list price, original/struck-through price, stock on hand, media row count,
publish status.

${
  result.mismatches.length === 0
    ? '## Mismatches\n\nNone.\n'
    : `## Mismatches\n\n| SKU | Field | Legacy | Database |\n| --- | --- | --- | --- |\n${result.mismatches
        .map(
          (m) => `| \`${m.sku}\` | ${m.field} | ${m.legacy} | ${m.database} |`,
        )
        .join('\n')}\n`
}${
      result.missing.length === 0
        ? ''
        : `## Missing rows\n\n${result.missing.map((sku) => `- \`${sku}\``).join('\n')}\n`
    }
## Not imported by design

| Legacy field | Reason |
| --- | --- |
| \`rating\`, \`reviews\` | No review rows and no provenance in the legacy repository; importing them would present marketing placeholders as customer feedback. |
| \`createdAt\`, \`updatedAt\` | \`new Date()\` at module load — no historical value. |
| \`badge: 'Bundle'\` | No badge field in the target schema; the \`Sets & Kits\` category carries the same meaning. |
| 21 orphaned \`.png\`/\`.webp\` files | Superseded by the \`.jpg\` photography referenced by the catalogue; 8 of them are byte-identical placeholders. |
`;
    writeFileSync(
      join(ROOT, 'reports', 'post-import-comparison.md'),
      report,
      'utf8',
    );
    console.warn(
      `verify: ${result.checked} checked, ${result.mismatches.length} mismatches, ${result.missing.length} missing, ${result.duplicateSkus} duplicate SKUs`,
    );
    await connection.end();
    process.exit(
      result.mismatches.length +
        result.missing.length +
        result.duplicateSkus ===
        0
        ? 0
        : 1,
    );
  }

  /* media first — the image conversion must succeed before the DB is touched */
  const mediaResults = await migrateImages(
    mapped.flatMap((m) => m.media.map((img) => img.legacyPath)),
    { dryRun: DRY_RUN },
  );

  if (DRY_RUN) {
    const importable = mapped.filter((m) => m.state !== 'INVALID');
    const brands = await resolveBrands(db, importable, true);
    const categories = await resolveCategories(db, importable, true);
    const ingredients = await resolveIngredients(db, importable, true);
    const existingSkus = await db
      .select({ sku: s.productVariants.sku })
      .from(s.productVariants)
      .where(
        inArray(
          s.productVariants.sku,
          mapped.map((m) => m.variant.sku),
        ),
      );

    const report = `# Dry-run report — legacy Nordic Lux catalogue

Generated ${new Date().toISOString()}. **No catalogue rows were written.**

Source: \`${LEGACY_SOURCE.repository}@${LEGACY_SOURCE.commit}\` → \`${LEGACY_SOURCE.productSourceFile}\`

## Outcome

${table([
  ['Products discovered', counts.discovered],
  ['READY (import + publish)', counts.ready],
  ['REVIEW (import as draft)', counts.review],
  ['INVALID (not imported)', counts.invalid],
  ['Already in database (would update)', existingSkus.length],
  [
    'New to database (would insert)',
    counts.discovered - counts.invalid - existingSkus.length,
  ],
])}

## Data issues

${table([
  ['Duplicate SKUs', counts.duplicateSkus],
  ['Missing images', counts.missingImages],
  ['Missing prices', counts.missingPrices],
  ['Missing brands', counts.missingBrands],
  ['Missing categories', counts.missingCategories],
])}

## Reference data

${table([
  ['Brands reused', brands.reused.length],
  ['Brands to create', brands.created.length],
  ['Categories reused', categories.reused.length],
  ['Categories to create', categories.created.length],
  ['Ingredients to create', ingredients.created.length],
])}

- Brands to create: ${brands.created.length ? brands.created.map((b) => `\`${b}\``).join(', ') : '—'}
- Categories to create: ${categories.created.length ? categories.created.map((c) => `\`${c}\``).join(', ') : '—'}

## Media

${table([
  ['Legacy images referenced', mediaResults.length],
  ['Converted to webp', mediaResults.length],
  [
    'Byte-identical duplicates',
    mediaResults.filter((m) => m.duplicateOf).length,
  ],
  [
    'Source bytes',
    mediaResults.reduce((n, m) => n + m.bytesIn, 0).toLocaleString(),
  ],
  [
    'Output bytes',
    mediaResults.reduce((n, m) => n + m.bytesOut, 0).toLocaleString(),
  ],
])}

## Pricing to be written

| SKU | Legacy | List (minor units) | Sale (minor units) | Effective |
| --- | ---: | ---: | ---: | ---: |
${mapped
  .filter((m) => m.state !== 'INVALID')
  .map(
    (m) =>
      `| \`${m.variant.sku}\` | ${legacy.find((l) => l.sku === m.legacySku)!.price.toFixed(2)} | ${m.variant.price} | ${m.variant.salePrice ?? '—'} | ${money(toEffective(m))} |`,
  )
  .join('\n')}

## Exceptions

${exceptionsSection(mapped)}
## Unmapped legacy tags

${unmappedTagSection(mapped)}
`;
    writeFileSync(join(ROOT, 'reports', 'dry-run-report.md'), report, 'utf8');
    console.warn(
      [
        `Products discovered: ${counts.discovered}`,
        `READY: ${counts.ready}`,
        `REVIEW: ${counts.review}`,
        `INVALID: ${counts.invalid}`,
        '',
        `Duplicate SKUs: ${counts.duplicateSkus}`,
        `Missing images: ${counts.missingImages}`,
        `Missing prices: ${counts.missingPrices}`,
        `Missing brands: ${counts.missingBrands}`,
        '',
        'Dry run — no catalogue writes. Wrote reports/dry-run-report.md',
      ].join('\n'),
    );
    await connection.end();
    return;
  }

  /* real import — one transaction */
  // One transaction for the whole catalogue: a failure anywhere rolls back
  // every product, variant, media row and stock movement together.
  const stats = await db.transaction((tx) => importCatalogue(tx, mapped));

  writeMediaMap(mediaResults);
  console.warn(
    [
      `Imported from ${LEGACY_SOURCE.commit}`,
      `  products: ${stats.productsInserted} inserted, ${stats.productsUpdated} updated`,
      `  variants: ${stats.variantsInserted} inserted, ${stats.variantsUpdated} updated`,
      `  media rows: ${stats.mediaRows}`,
      `  inventory: ${stats.inventoryRows} items, ${stats.inventoryMovements} movements`,
      `  skipped (INVALID): ${stats.skipped.length}`,
    ].join('\n'),
  );
  await connection.end();
}

/**
 * Only run the legacy migration when this file is the entry point. It is also
 * imported by catalogue-import.ts, which reuses the resolvers and the
 * transactional writer above for the full 88-product catalogue.
 */
// Basename, not endsWith: `catalogue-import.ts` also ends in "import.ts" and
// must not trigger the legacy migration when it imports this module.
const invokedDirectly =
  process.argv[1]?.replace(/\\/g, '/').split('/').pop() === 'import.ts';
if (invokedDirectly) {
  main().catch(async (error) => {
    console.error(error);
    await connection.end();
    process.exit(1);
  });
}
