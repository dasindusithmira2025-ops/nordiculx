/**
 * Forensic catalogue audit — the final gate.
 *
 * Checks the *database and the served storefront*, not the migration's own
 * intermediate files, so it catches anything the import silently got wrong:
 * placeholder text, unreadable or missing image files, duplicate SKUs or
 * brands, malformed names, fabricated ratings, and product pages that do not
 * resolve.
 *
 *   npx tsx migration/legacy-nordic-lux/scripts/audit.ts [--base http://localhost:3000]
 */
import '../../../scripts/load-env';
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq, isNull, sql as raw } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';

import * as s from '@/lib/db/schema';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}
const connection = postgres(url, { max: 1 });
const db = drizzle(connection, { schema: s, casing: 'snake_case' });

const baseArg = process.argv.indexOf('--base');
const BASE = baseArg > -1 ? process.argv[baseArg + 1] : 'http://localhost:3000';
/** Only the migrated catalogue; the dev seed fixture is audited separately. */
const CATALOGUE_SKU = /^(SK80CT|FER-)/;

const PLACEHOLDER_TEXT =
  /lorem ipsum|\[\s*no image\s*\]|placeholder|tbd|coming soon|xxx+|dummy/i;

type Finding = { severity: 'FAIL' | 'WARN'; check: string; detail: string };
const findings: Finding[] = [];
const fail = (check: string, detail: string) =>
  findings.push({ severity: 'FAIL', check, detail });
const warn = (check: string, detail: string) =>
  findings.push({ severity: 'WARN', check, detail });

async function main() {
  const rows = await db
    .select({
      sku: s.productVariants.sku,
      price: s.productVariants.price,
      variantName: s.productVariants.name,
      productId: s.products.id,
      name: s.products.name,
      slug: s.products.slug,
      status: s.products.status,
      excerpt: s.products.excerpt,
      description: s.products.description,
      howToUse: s.products.howToUse,
      ratingAverage: s.products.ratingAverage,
      ratingCount: s.products.ratingCount,
      brand: s.brands.name,
      brandSlug: s.brands.slug,
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
    .where(isNull(s.products.deletedAt));

  const catalogue = rows.filter((r) => CATALOGUE_SKU.test(r.sku));
  console.warn(
    `Auditing ${catalogue.length} migrated catalogue products (of ${rows.length} total).\n`,
  );

  /* --- identity ---------------------------------------------------------- */

  const skus = catalogue.map((r) => r.sku);
  for (const sku of new Set(skus)) {
    if (skus.filter((x) => x === sku).length > 1) fail('duplicate SKU', sku);
  }
  const slugs = catalogue.map((r) => r.slug);
  for (const slug of new Set(slugs)) {
    if (slugs.filter((x) => x === slug).length > 1)
      fail('duplicate slug', slug);
  }

  const brandRows = await db
    .select({ name: s.brands.name, slug: s.brands.slug })
    .from(s.brands);
  const brandKeys = brandRows.map((b) =>
    b.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
  );
  for (const key of new Set(brandKeys)) {
    if (brandKeys.filter((k) => k === key).length > 1) {
      fail(
        'duplicate brand',
        brandRows
          .filter((b) => b.name.toLowerCase().replace(/[^a-z0-9]/g, '') === key)
          .map((b) => b.name)
          .join(' / '),
      );
    }
  }

  /* --- content ----------------------------------------------------------- */

  for (const r of catalogue) {
    for (const [field, value] of [
      ['name', r.name],
      ['excerpt', r.excerpt],
      ['description', r.description],
      ['howToUse', r.howToUse],
    ] as [string, string | null][]) {
      if (value && PLACEHOLDER_TEXT.test(value))
        fail('placeholder text', `${r.sku} ${field}: "${value.slice(0, 80)}"`);
    }
    if (!r.description?.trim()) fail('empty description', r.sku);
    if (!r.name?.trim()) fail('empty name', r.sku);
    if (/\s{2,}|^\s|\s$/.test(r.name))
      fail('malformed name whitespace', `${r.sku} "${r.name}"`);
    if (
      /\b(exp|exp:)\s*\d/i.test(r.name) ||
      /sealed|brand new|nib\b/i.test(r.name)
    ) {
      fail('batch/expiry text in name', `${r.sku} "${r.name}"`);
    }
    // Truncation means text cut mid-thought — a trailing ellipsis, or the
    // PDF's mid-word cut ("...and leave sk"). A description that simply ends
    // without a full stop is not truncated: ingredient lists and headline
    // copy legitimately do, so punctuation alone is not the test.
    const desc = r.description?.trim() ?? '';
    if (
      desc.endsWith('…') ||
      /\s(?:sk|th|wo|lightweigh|hel|prot|mo|fo|includ|nourish)$/i.test(desc)
    ) {
      fail('truncated description', `${r.sku} ends "...${desc.slice(-40)}"`);
    }
    if (r.ratingCount > 0 || r.ratingAverage > 0) {
      fail(
        'fabricated rating',
        `${r.sku} avg=${r.ratingAverage} count=${r.ratingCount}`,
      );
    }
    if (r.status === 'published' && r.price <= 0) {
      fail('published without price', `${r.sku} price=${r.price}`);
    }
    if (r.onHand === null) warn('no inventory row', r.sku);
    if (!r.categorySlug) fail('no category', r.sku);
  }

  /* --- reviews ----------------------------------------------------------- */

  const reviewRows = await db
    .select({ productId: s.reviews.productId })
    .from(s.reviews)
    .innerJoin(s.products, eq(s.products.id, s.reviews.productId))
    .innerJoin(
      s.productVariants,
      eq(s.productVariants.productId, s.products.id),
    )
    .where(raw`${s.productVariants.sku} ~ '^(SK80CT|FER-)'`);
  if (reviewRows.length > 0)
    fail('review rows on migrated products', `${reviewRows.length} rows`);

  /* --- media ------------------------------------------------------------- */

  const media = await db
    .select({
      productId: s.productMedia.productId,
      url: s.productMedia.url,
      alt: s.productMedia.alt,
    })
    .from(s.productMedia);
  const byProduct = new Map<string, { url: string; alt: string }[]>();
  for (const m of media) {
    if (!byProduct.has(m.productId)) byProduct.set(m.productId, []);
    byProduct.get(m.productId)!.push(m);
  }

  let checkedFiles = 0;
  for (const r of catalogue) {
    const assets = byProduct.get(r.productId) ?? [];
    if (assets.length === 0) {
      fail('no image', `${r.sku} ${r.name}`);
      continue;
    }
    for (const asset of assets) {
      if (!asset.alt.trim()) fail('empty alt text', `${r.sku} ${asset.url}`);
      if (/placeholder|no-image|dummy/i.test(asset.url))
        fail('placeholder image', `${r.sku} ${asset.url}`);
      const file = resolve(REPO, 'public', asset.url.replace(/^\//, ''));
      if (!existsSync(file)) {
        fail('missing image file', `${r.sku} ${asset.url}`);
        continue;
      }
      if (statSync(file).size < 1024)
        fail('suspiciously small image', `${r.sku} ${asset.url}`);
      try {
        const meta = await sharp(file).metadata();
        checkedFiles++;
        if (!meta.width || !meta.height)
          fail('unreadable image', `${r.sku} ${asset.url}`);
        else if (Math.min(meta.width, meta.height) < 200) {
          warn(
            'low-resolution image',
            `${r.sku} ${asset.url} ${meta.width}x${meta.height}`,
          );
        }
      } catch {
        fail('corrupt image', `${r.sku} ${asset.url}`);
      }
    }
  }

  /* --- storefront -------------------------------------------------------- */

  const published = catalogue.filter((r) => r.status === 'published');
  const sample = [
    '/shop',
    '/brands',
    ...[...new Set(published.map((p) => `/brands/${p.brandSlug}`))],
    ...[...new Set(published.map((p) => `/shop?category=${p.categorySlug}`))],
    ...published.map((p) => `/product/${p.slug}`),
  ];

  let reachable = 0;
  for (const path of sample) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        fail('route not OK', `${path} -> ${res.status}`);
        continue;
      }
      reachable++;
      // Scan rendered *text*, not markup: `placeholder="16500"` on a price
      // filter is a legitimate HTML attribute, not placeholder content.
      const html = await res.text();
      const visible = html
        .replace(/<script[\s\S]*?<\/script>/g, ' ')
        .replace(/<style[\s\S]*?<\/style>/g, ' ')
        .replace(/<[^>]+>/g, ' ');
      const hit = visible.match(PLACEHOLDER_TEXT);
      if (hit) fail('placeholder text rendered', `${path}: "${hit[0]}"`);
    } catch (err) {
      fail('route unreachable', `${path}: ${(err as Error).message}`);
    }
  }

  /* --- report ------------------------------------------------------------ */

  const fails = findings.filter((f) => f.severity === 'FAIL');
  const warns = findings.filter((f) => f.severity === 'WARN');

  console.warn(`Image files verified:  ${checkedFiles}`);
  console.warn(`Routes checked:        ${sample.length} (${reachable} OK)`);
  console.warn(`Published products:    ${published.length}`);
  console.warn(`Draft products:        ${catalogue.length - published.length}`);
  console.warn('');

  if (fails.length === 0) console.warn('PASS — no failures.');
  else {
    console.warn(`FAIL — ${fails.length} findings:`);
    const grouped = new Map<string, string[]>();
    for (const f of fails) {
      if (!grouped.has(f.check)) grouped.set(f.check, []);
      grouped.get(f.check)!.push(f.detail);
    }
    for (const [check, details] of grouped) {
      console.warn(`  ${check} (${details.length}):`);
      for (const d of details.slice(0, 12)) console.warn(`    - ${d}`);
      if (details.length > 12)
        console.warn(`    ... and ${details.length - 12} more`);
    }
  }
  if (warns.length) {
    console.warn(`\n${warns.length} warnings:`);
    const grouped = new Map<string, number>();
    for (const w of warns)
      grouped.set(w.check, (grouped.get(w.check) ?? 0) + 1);
    for (const [check, n] of grouped) console.warn(`  ${check}: ${n}`);
  }

  await connection.end();
  process.exit(fails.length === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await connection.end();
  process.exit(1);
});
