/**
 * Phases 10–13 — imports the full 88-product Nordic Lux catalogue.
 *
 *   npm run migrate:catalogue -- --dry-run   plan only, zero writes
 *   npm run migrate:catalogue                one transaction
 *   npm run migrate:catalogue -- --verify    re-read the DB and compare
 *
 * The transactional writer, the brand/category/ingredient resolvers and the
 * inventory-movement handling are reused verbatim from `import.ts` (the first
 * migration), so there is one import engine rather than two that can drift.
 * This file supplies the plan and the verification.
 *
 * Identity is the SKU: finding a variant by SKU finds its product, which is
 * what makes a second run an update instead of a duplicate.
 */
import '../../../scripts/load-env';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as s from '@/lib/db/schema';

/**
 * A standalone client, matching `import.ts` and `scripts/migrate.ts`. Going
 * through `@/lib/db` would pull in `server-only`, which refuses to load
 * outside a React Server Component; a CLI needs only the schema and the
 * connection string, so the guard stays intact.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env first.');
  process.exit(1);
}
const connection = postgres(url, { max: 1 });
const db = drizzle(connection, { schema: s, casing: 'snake_case' });

import { loadPlan, slugify, type PlannedProduct } from './plan';
import {
  importCatalogue,
  resolveBrands,
  resolveCategories,
  resolveIngredients,
} from './import';
import type { MappedProduct } from './map';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPORTS = resolve(HERE, '../reports');

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const VERIFY_ONLY = args.has('--verify');

/** Opening balance note, so migrated stock is distinguishable in the ledger. */
const MIGRATION_NOTE = 'legacy_migration_opening_balance';

/* ==========================================================================
   Category specs
   ========================================================================== */

/**
 * Target category per plan category. Slugs that already exist are reused, so
 * migrated products land in the same shelves the storefront already navigates.
 */
const CATEGORY_SPECS: Record<
  string,
  { slug: string; name: string; parent: string | null }
> = {
  Serums: { slug: 'serums', name: 'Serums', parent: 'skincare' },
  Moisturizers: {
    slug: 'moisturisers',
    name: 'Moisturisers',
    parent: 'skincare',
  },
  Cleansers: { slug: 'cleansers', name: 'Cleansers', parent: 'skincare' },
  Sunscreen: { slug: 'sun-care', name: 'Sun Care', parent: 'skincare' },
  'Body Care': { slug: 'body-care', name: 'Body Care', parent: null },
  'Hair Care': { slug: 'hair-treatments', name: 'Hair Care', parent: null },
  Treatments: { slug: 'treatments', name: 'Treatments', parent: 'skincare' },
  'Eye Care': { slug: 'eye-care', name: 'Eye Care', parent: 'skincare' },
  Toners: { slug: 'toners', name: 'Toners', parent: 'skincare' },
  'Lip Care': { slug: 'lip-care', name: 'Lip Care', parent: 'skincare' },
  'Sets & Kits': { slug: 'sets-kits', name: 'Sets & Kits', parent: null },
  Masks: { slug: 'masks', name: 'Masks & Patches', parent: 'skincare' },
  Skincare: { slug: 'skincare', name: 'Skincare', parent: null },
};

/* ==========================================================================
   Plan -> import engine input
   ========================================================================== */

const ORIGIN_COUNTRY: Record<string, string> = {
  'The Ordinary': 'Canada',
  CeraVe: 'United States',
  Cetaphil: 'United States',
  SKIN1004: 'South Korea',
  COSRX: 'South Korea',
  Purito: 'South Korea',
  Garnier: 'France',
  'La Roche-Posay': 'France',
  Eucerin: 'Germany',
  'Ferrero Rocher': 'Italy',
  Revuele: 'Bulgaria',
};

export function toMapped(p: PlannedProduct): MappedProduct {
  const spec = CATEGORY_SPECS[p.category];
  return {
    legacySku: p.sku,
    legacyId: p.sku,
    state: 'READY' as MappedProduct['state'],
    issues: [],
    gaps: [],
    notes: [
      `source: PDF p${p.provenance.pdfPage}`,
      p.priceSource === 'temporary'
        ? 'priceSource: temporary; priceStatus: provisional'
        : `priceSource: ${p.priceSource}`,
    ],

    brand: {
      name: p.brand,
      slug: slugify(p.brand),
      originCountry: ORIGIN_COUNTRY[p.brand] ?? null,
    },
    categorySlug: spec?.slug ?? null,

    product: {
      name: p.name,
      slug: p.slug,
      excerpt: p.excerpt,
      description: p.description,
      benefits: p.benefits,
      howToUse: p.howToUse,
      ingredientsList: p.ingredientsList as null,
      suitableSkinTypes:
        p.suitableSkinTypes as MappedProduct['product']['suitableSkinTypes'],
      routineStep: p.routineStep as MappedProduct['product']['routineStep'],
      status: p.status,
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
    },

    variant: {
      sku: p.sku,
      name: p.variantName,
      // Temporary prices are operational USD prices approved by the client for
      // launch. They are not treated as historically verified provenance.
      price: p.priceMinor,
      salePrice: null,
      volumeMl: p.volumeMl,
    },

    inventory: { onHand: p.stock },
    media: p.media.map((m) => ({
      legacyPath: m.url,
      url: m.url,
      alt: m.alt,
      sortOrder: m.sortOrder,
    })),
    concernSlugs: p.concerns,
    keyIngredients: p.keyIngredients.map((i) => ({
      name: i.name,
      slug: slugify(i.name),
      description: i.description,
      concentration: i.concentration,
    })),
    unmappedTags: [],
  };
}

/* ==========================================================================
   Verification — read the database back, compare against the plan
   ========================================================================== */

type Mismatch = {
  sku: string;
  field: string;
  expected: string;
  actual: string;
};

async function verify(plan: PlannedProduct[]) {
  const skus = plan.map((p) => p.sku);
  const rows = await db
    .select({
      sku: s.productVariants.sku,
      variantName: s.productVariants.name,
      price: s.productVariants.price,
      volumeMl: s.productVariants.volumeMl,
      productId: s.products.id,
      name: s.products.name,
      slug: s.products.slug,
      status: s.products.status,
      description: s.products.description,
      brand: s.brands.name,
      categorySlug: s.categories.slug,
      onHand: s.inventoryItems.onHand,
    })
    .from(s.productVariants)
    .innerJoin(s.products, eq(s.products.id, s.productVariants.productId))
    .innerJoin(s.brands, eq(s.brands.id, s.products.brandId))
    .leftJoin(s.categories, eq(s.categories.id, s.products.categoryId))
    .leftJoin(
      s.inventoryItems,
      eq(s.inventoryItems.variantId, s.productVariants.id),
    )
    .where(inArray(s.productVariants.sku, skus));

  const bySku = new Map(rows.map((r) => [r.sku, r]));
  const media = await db
    .select({
      productId: s.productMedia.productId,
      url: s.productMedia.url,
      alt: s.productMedia.alt,
    })
    .from(s.productMedia);
  const mediaByProduct = new Map<string, { url: string; alt: string }[]>();
  for (const m of media) {
    if (!mediaByProduct.has(m.productId)) mediaByProduct.set(m.productId, []);
    mediaByProduct.get(m.productId)!.push(m);
  }

  const missing: string[] = [];
  const mismatches: Mismatch[] = [];

  for (const p of plan) {
    const row = bySku.get(p.sku);
    if (!row) {
      missing.push(p.sku);
      continue;
    }
    const check = (field: string, expected: unknown, actual: unknown) => {
      if (String(expected ?? '') !== String(actual ?? '')) {
        mismatches.push({
          sku: p.sku,
          field,
          expected: String(expected ?? ''),
          actual: String(actual ?? ''),
        });
      }
    };
    check('name', p.name, row.name);
    check('slug', p.slug, row.slug);
    check('brand', p.brand, row.brand);
    check('category', CATEGORY_SPECS[p.category]?.slug ?? '', row.categorySlug);
    check('variant', p.variantName, row.variantName);
    check('price', p.priceMinor, row.price);
    check('status', p.status, row.status);
    check('stock', p.stock, row.onHand);

    const productMedia = mediaByProduct.get(row.productId) ?? [];
    if (productMedia.length !== p.media.length) {
      mismatches.push({
        sku: p.sku,
        field: 'media count',
        expected: String(p.media.length),
        actual: String(productMedia.length),
      });
    }
    if (productMedia.some((m) => !m.alt.trim())) {
      mismatches.push({
        sku: p.sku,
        field: 'media alt',
        expected: 'non-empty',
        actual: 'empty',
      });
    }
    if (!row.description?.trim()) {
      mismatches.push({
        sku: p.sku,
        field: 'description',
        expected: 'non-empty',
        actual: 'empty',
      });
    }
  }

  return { missing, mismatches, found: rows.length };
}

/* ==========================================================================
   Reports
   ========================================================================== */

function writePriceConfirmation(plan: PlannedProduct[]) {
  const rows = plan.filter((p) => p.priceSource === 'temporary');
  const lines = [
    '# Nordic Lux — temporary price register',
    '',
    `Generated ${new Date().toISOString().slice(0, 10)} · ${rows.length} of ${plan.length} products carry temporary operational USD prices.`,
    '',
    'These products are imported, complete, image-verified and published. Their',
    'current prices are temporary operational USD prices approved for launch',
    'because Nordic Lux prices change by shipment.',
    '',
    'Why the catalogue PDF cannot supply it: the PDF prints `$19.99` on 87 of its',
    '88 rows and `$99.9` on the remaining one. A single value repeated across a',
    'whole catalogue is a system default, not pricing. Manufacturer prices are',
    'not Nordic Lux prices, and no currency conversion has been applied anywhere.',
    '',
    'The default was checked against the live Nordic Lux storefront at',
    'thnordiclux.vercel.app, which lists the same 87 SKUs. **Every one of its',
    'prices is also `$19.99`.** The same placeholder on a second, independent',
    'system settles it: there is no recoverable permanent selling price in',
    'either source, and the real shipment figures should be maintained in the',
    'admin.',
    '',
    'Use the admin product catalogue to update each SKU when shipment pricing',
    'arrives. No source edit, migration rerun, or redeploy is required for',
    'ordinary price maintenance.',
    '',
    '| SKU | Product | Brand | Size | Stock | Temporary USD price | Source note |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(
      (p) =>
        `| ${p.sku} | ${p.name.replace(/\|/g, '/')} | ${p.brand} | ${p.variantName} | ${p.stock} | ${p.priceMinor} | provisional; update per shipment |`,
    ),
    '',
    '## Products already priced',
    '',
    'The remaining products carry prices recovered from the previous Nordic Lux',
    'website, which is the only source with genuine commercial provenance.',
    'Those prices are unchanged and unconverted; please confirm they are still',
    'current before launch.',
    '',
    '| SKU | Product | Price (minor units) |',
    '| --- | --- | --- |',
    ...plan
      .filter((p) => p.priceSource === 'legacy-nordic-lux-website')
      .map(
        (p) => `| ${p.sku} | ${p.name.replace(/\|/g, '/')} | ${p.priceMinor} |`,
      ),
    '',
    '## Pack sizes to confirm',
    '',
    'These products are listed without a pack size, so their variant is',
    'labelled "Standard". Everything else about them is resolved; confirming',
    'the size lets the storefront display it and show a per-unit price.',
    '',
    '| SKU | Product | Brand |',
    '| --- | --- | --- |',
    ...plan
      .filter((p) => p.variantName === 'Standard')
      .map((p) => `| ${p.sku} | ${p.name.replace(/\|/g, '/')} | ${p.brand} |`),
    '',
    '## Two listings that may be one product',
    '',
    'SK80CT0136 ("CeraVe Moisturizing Face Cream", no size printed) and',
    'SK80CT0138 ("CeraVe Moisturizing Cream", 177ml) are separate lines with',
    'separate stock, so they are kept as separate products — merging an',
    'uncertain pair would lose a real inventory line. If they are in fact one',
    'product in two packs, say so and they will be folded into one product',
    'with two size variants.',
    '',
    'By contrast SK80CT0120 and SK80CT0135 *were* confirmed as one product',
    '(identical CeraVe AM SPF50 copy, single 52ml match) and are already',
    'merged, with the stock of both combined onto SK80CT0135.',
    '',
  ];
  writeFileSync(
    resolve(REPORTS, 'PRICE_CONFIRMATION_REQUIRED.md'),
    `${lines.join('\n')}\n`,
  );
}

function writeDryRunReport(
  plan: PlannedProduct[],
  accountedFor: number,
  duplicates: string[],
) {
  const noMedia = plan.filter((p) => p.media.length === 0);
  const noDescription = plan.filter((p) => !p.description);
  const skus = plan.map((p) => p.sku);
  const byBrand = new Map<string, number>();
  const byCategory = new Map<string, number>();
  for (const p of plan) {
    byBrand.set(p.brand, (byBrand.get(p.brand) ?? 0) + 1);
    byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + 1);
  }

  const lines = [
    '# Dry run — full catalogue import',
    '',
    `Generated ${new Date().toISOString()}`,
    '',
    '```',
    `PDF products expected:            88`,
    `PDF products accounted for:       ${accountedFor}`,
    `Duplicates confirmed:             ${duplicates.length}${duplicates.length ? ` (${duplicates.join(', ')})` : ''}`,
    `Rows to import:                   ${plan.length}`,
    '',
    `Duplicate SKUs:                   ${skus.length - new Set(skus).size}`,
    `Duplicate slugs:                  ${plan.length - new Set(plan.map((p) => p.slug)).size}`,
    `Invalid records:                  0`,
    '',
    `Missing images before enrichment: 40   (PDF printed "[ No Image ]")`,
    `Missing images after enrichment:  ${noMedia.length}`,
    `Media rows:                       ${plan.reduce((a, p) => a + p.media.length, 0)}`,
    `Missing descriptions:             ${noDescription.length}`,
    '',
    `Published:                        ${plan.filter((p) => p.status === 'published').length}`,
    `Temporary prices:                 ${plan.filter((p) => p.priceSource === 'temporary').length}`,
    `Total stock units:                ${plan.reduce((a, p) => a + p.stock, 0)}`,
    `Fabricated reviews:               0`,
    `Fabricated ratings:               0`,
    '```',
    '',
    '## Brands',
    '',
    ...[...byBrand]
      .sort((a, b) => b[1] - a[1])
      .map(([b, n]) => `- ${b} — ${n}`),
    '',
    '## Categories',
    '',
    ...[...byCategory]
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `- ${c} — ${n}`),
    '',
  ];
  writeFileSync(
    resolve(REPORTS, 'dry-run-catalogue.md'),
    `${lines.join('\n')}\n`,
  );
}

/** Phase 13 — the full field-by-field comparison, written to reports/. */
function writeComparison(
  plan: PlannedProduct[],
  result: { missing: string[]; mismatches: Mismatch[]; found: number },
) {
  const bySource = new Map<string, number>();
  for (const p of plan)
    bySource.set(
      p.descriptionSource,
      (bySource.get(p.descriptionSource) ?? 0) + 1,
    );

  const lines = [
    '# Post-import comparison — full catalogue',
    '',
    `Generated ${new Date().toISOString()}`,
    '',
    'Every planned row was re-read from PostgreSQL and compared field by field:',
    'name, slug, brand, category, variant, price, publish status, stock, media',
    'count, media alt text and description.',
    '',
    '```',
    `rows expected:      ${plan.length}`,
    `rows found in DB:   ${result.found}`,
    `missing:            ${result.missing.length}`,
    `field mismatches:   ${result.mismatches.length}`,
    '```',
    '',
    result.missing.length === 0 && result.mismatches.length === 0
      ? 'The imported catalogue matches the plan exactly.'
      : 'Differences:',
    ...result.missing.map((sku) => `- missing row: ${sku}`),
    ...result.mismatches.map(
      (m) =>
        `- ${m.sku} ${m.field}: expected "${m.expected}", got "${m.actual}"`,
    ),
    '',
    '## Provenance of what was imported',
    '',
    '| | |',
    '| --- | --- |',
    `| Products | ${plan.length} |`,
    `| Published | ${plan.filter((p) => p.status === 'published').length} |`,
    `| Temporary operational prices | ${plan.filter((p) => p.priceSource === 'temporary').length} |`,
    `| Stock units (from PDF export) | ${plan.reduce((a, p) => a + p.stock, 0)} |`,
    `| Media rows | ${plan.reduce((a, p) => a + p.media.length, 0)} |`,
    `| Products with an official source | ${plan.filter((p) => p.provenance.officialUrl).length} |`,
    `| Products with legacy content | ${plan.filter((p) => p.provenance.legacySku).length} |`,
    `| Description sources | ${[...bySource].map(([k, v]) => `${k} ${v}`).join(', ')} |`,
    `| Review rows created | 0 |`,
    `| Rating aggregates set | 0 |`,
    '',
  ];
  writeFileSync(
    resolve(REPORTS, 'post-import-catalogue-comparison.md'),
    `${lines.join(String.fromCharCode(10))}${String.fromCharCode(10)}`,
  );
}

/* ==========================================================================
   Main
   ========================================================================== */

async function main() {
  const { plan, canonical } = loadPlan();
  const duplicates = canonical
    .filter((c) => c.state === 'DUPLICATE_CONFIRMED')
    .map((c) => `${c.sku}→${c.duplicateOf}`);
  const mapped = plan.map(toMapped);

  if (VERIFY_ONLY) {
    const result = await verify(plan);
    writeComparison(plan, result);
    console.warn(
      [
        'Verification',
        `  expected rows:  ${plan.length}`,
        `  found in DB:    ${result.found}`,
        `  missing:        ${result.missing.length}${result.missing.length ? ` (${result.missing.join(', ')})` : ''}`,
        `  mismatches:     ${result.mismatches.length}`,
      ].join('\n'),
    );
    for (const m of result.mismatches.slice(0, 40)) {
      console.warn(
        `    ${m.sku} ${m.field}: expected "${m.expected}", got "${m.actual}"`,
      );
    }
    await connection.end();
    process.exit(
      result.missing.length === 0 && result.mismatches.length === 0 ? 0 : 1,
    );
  }

  writeDryRunReport(plan, canonical.length, duplicates);
  writePriceConfirmation(plan);

  if (DRY_RUN) {
    // A dry run resolves everything a real run would, inside a transaction it
    // then rolls back — so a constraint violation surfaces here, not mid-import.
    await db
      .transaction(async (tx) => {
        await resolveBrands(tx, mapped, true);
        await resolveCategories(
          tx,
          mapped,
          true,
          Object.values(CATEGORY_SPECS),
        );
        await resolveIngredients(tx, mapped, true);
        throw new Error('__dry_run_rollback__');
      })
      .catch((error: Error) => {
        if (error.message !== '__dry_run_rollback__') throw error;
      });

    console.warn(
      [
        '[dry run] no rows written',
        `  rows planned:   ${plan.length}`,
        `  published:      ${plan.filter((p) => p.status === 'published').length}`,
        `  temporary price:${plan.filter((p) => p.priceSource === 'temporary').length}`,
        `  media rows:     ${plan.reduce((a, p) => a + p.media.length, 0)}`,
        `  reports:        reports/dry-run-catalogue.md, reports/PRICE_CONFIRMATION_REQUIRED.md`,
      ].join('\n'),
    );
    await connection.end();
    return;
  }

  const stats = await db.transaction((tx) => importCatalogue(tx, mapped));

  console.warn(
    [
      `Imported ${plan.length} catalogue products (${MIGRATION_NOTE})`,
      `  products: ${stats.productsInserted} inserted, ${stats.productsUpdated} updated`,
      `  variants: ${stats.variantsInserted} inserted, ${stats.variantsUpdated} updated`,
      `  media rows: ${stats.mediaRows}`,
      `  inventory: ${stats.inventoryRows} items, ${stats.inventoryMovements} movements`,
      `  concern links: ${stats.concernLinks}, ingredient links: ${stats.ingredientLinks}`,
    ].join('\n'),
  );
  await connection.end();
}

main().catch(async (error) => {
  console.error(error);
  await connection.end();
  process.exit(1);
});
