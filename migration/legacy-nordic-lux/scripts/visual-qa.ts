/**
 * Visual QA — screenshots the pages real catalogue data is most likely to
 * break, at desktop and mobile widths.
 *
 * The sample is chosen from the database rather than hard-coded, so it always
 * covers the awkward cases: the longest product name, a product with several
 * images, one with only a single image, an out-of-stock line, and one from
 * each major brand.
 *
 *   npx tsx migration/legacy-nordic-lux/scripts/visual-qa.ts
 *
 * Also reports layout defects that a screenshot alone would not: horizontal
 * page overflow, images that failed to load, and text clipped by its box.
 */
import '../../../scripts/load-env';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, isNull, and, sql as raw } from 'drizzle-orm';

import * as s from '@/lib/db/schema';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../reports/visual-qa');

const BASE = process.env.QA_BASE ?? 'http://localhost:3000';

const url = process.env.DATABASE_URL!;
const connection = postgres(url, { max: 1 });
const db = drizzle(connection, { schema: s, casing: 'snake_case' });

type Defect = { page: string; viewport: string; issue: string };
const defects: Defect[] = [];

async function inspect(page: Page, label: string, viewport: string) {
  const result = await page.evaluate(() => {
    const doc = document.documentElement;
    const brokenImages = [...document.querySelectorAll('img')]
      .filter((img) => img.complete && img.naturalWidth === 0)
      .map((img) => img.getAttribute('src') ?? '(no src)');

    // Text clipped by its own box — the classic long-title overflow.
    const clipped = [...document.querySelectorAll('h1, h2, h3, a, p, span')]
      .filter((el) => {
        const e = el as HTMLElement;
        if (!e.offsetParent || e.scrollWidth === 0) return false;
        const style = getComputedStyle(e);
        if (style.overflow === 'visible' && style.textOverflow !== 'ellipsis')
          return false;
        return (
          e.scrollWidth > e.clientWidth + 2 &&
          style.textOverflow !== 'ellipsis' &&
          !style.webkitLineClamp
        );
      })
      .slice(0, 5)
      .map((el) => (el.textContent ?? '').trim().slice(0, 60));

    return {
      overflowX:
        doc.scrollWidth > doc.clientWidth + 1
          ? `${doc.scrollWidth} > ${doc.clientWidth}`
          : null,
      brokenImages,
      clipped,
      imageCount: document.querySelectorAll('img').length,
      noImageText: /\[\s*no image\s*\]/i.test(document.body.innerText),
    };
  });

  if (result.overflowX)
    defects.push({
      page: label,
      viewport,
      issue: `horizontal overflow (${result.overflowX})`,
    });
  for (const src of result.brokenImages)
    defects.push({ page: label, viewport, issue: `broken image: ${src}` });
  for (const text of result.clipped)
    defects.push({ page: label, viewport, issue: `clipped text: "${text}"` });
  if (result.noImageText)
    defects.push({ page: label, viewport, issue: '"[No Image]" rendered' });

  return result;
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  const rows = await db
    .select({
      sku: s.productVariants.sku,
      slug: s.products.slug,
      name: s.products.name,
      status: s.products.status,
      brandSlug: s.brands.slug,
      brand: s.brands.name,
      onHand: s.inventoryItems.onHand,
      images: raw<number>`(select count(*) from product_media m where m.product_id = ${s.products.id})`,
      ingredientsLen: raw<number>`coalesce(length(${s.products.ingredientsList}), 0)`,
    })
    .from(s.productVariants)
    .innerJoin(s.products, eq(s.products.id, s.productVariants.productId))
    .innerJoin(s.brands, eq(s.brands.id, s.products.brandId))
    .leftJoin(
      s.inventoryItems,
      eq(s.inventoryItems.variantId, s.productVariants.id),
    )
    .where(
      and(
        isNull(s.products.deletedAt),
        raw`${s.productVariants.sku} ~ '^(SK80CT|FER-)'`,
      ),
    );

  const published = rows.filter((r) => r.status === 'published');
  const pick = <T>(list: T[], by: (x: T) => number) =>
    list.slice().sort((a, b) => by(b) - by(a))[0];

  // Cover the cases most likely to expose a layout defect.
  const targets = new Map<string, string>();
  targets.set('shop', '/shop');
  targets.set('shop-page-2', '/shop?page=2');
  targets.set('brands', '/brands');

  const longestName = pick(published, (r) => r.name.length);
  const mostImages = pick(published, (r) => Number(r.images));
  const singleImage = published.find((r) => Number(r.images) === 1);
  const outOfStock = published.find((r) => (r.onHand ?? 0) === 0);
  const longIngredients = pick(published, (r) => Number(r.ingredientsLen));

  for (const [label, row] of [
    ['pdp-longest-name', longestName],
    ['pdp-most-images', mostImages],
    ['pdp-single-image', singleImage],
    ['pdp-out-of-stock', outOfStock],
    ['pdp-long-ingredients', longIngredients],
  ] as [string, (typeof rows)[number] | undefined][]) {
    if (row) targets.set(label, `/product/${row.slug}`);
  }

  for (const brand of [...new Set(published.map((p) => p.brandSlug))].slice(
    0,
    4,
  )) {
    targets.set(`brand-${brand}`, `/brands/${brand}`);
  }

  const browser = await chromium.launch();
  const viewports = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    });
    const page = await context.newPage();
    for (const [label, path] of targets) {
      try {
        await page.goto(`${BASE}${path}`, {
          waitUntil: 'networkidle',
          timeout: 45_000,
        });
        await page.waitForTimeout(600);
        await inspect(page, label, vp.name);
        await page.screenshot({
          path: resolve(OUT, `${vp.name}-${label}.png`),
          fullPage: true,
        });
      } catch (err) {
        defects.push({
          page: label,
          viewport: vp.name,
          issue: `navigation failed: ${(err as Error).message.slice(0, 90)}`,
        });
      }
    }
    await context.close();
  }
  await browser.close();

  const lines = [
    '# Visual QA',
    '',
    `Generated ${new Date().toISOString()} · ${targets.size} pages × ${viewports.length} viewports`,
    '',
    '## Sample',
    '',
    ...[...targets].map(([label, path]) => `- \`${label}\` — ${path}`),
    '',
    '## Findings',
    '',
    defects.length === 0
      ? 'No layout defects detected: no horizontal overflow, no broken images, no clipped text, no `[No Image]`.'
      : defects
          .map((d) => `- **${d.viewport} / ${d.page}** — ${d.issue}`)
          .join('\n'),
    '',
    `Screenshots: \`reports/visual-qa/\``,
    '',
  ];
  writeFileSync(resolve(OUT, '../visual-qa.md'), `${lines.join('\n')}\n`);

  console.warn(`pages captured: ${targets.size * viewports.length}`);
  console.warn(
    defects.length === 0 ? 'no layout defects' : `${defects.length} defects:`,
  );
  for (const d of defects.slice(0, 30))
    console.warn(`  ${d.viewport}/${d.page}: ${d.issue}`);

  await connection.end();
  process.exit(defects.length === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await connection.end();
  process.exit(1);
});
