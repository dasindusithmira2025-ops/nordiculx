/**
 * Harvests Nordic Lux's own live catalogue at thnordiclux.vercel.app.
 *
 * This is the highest-authority source available for everything except price.
 * It is Nordic Lux's own storefront, keyed by the same `SK80CT####` SKUs as the
 * PDF, and for each SKU it publishes the product copy *they* wrote and the
 * product image *they* chose. That removes the identity guesswork entirely:
 * where the manufacturer-matching pass in `enrich.ts` had to prove that a
 * candidate page was the same product, here the association is stated by the
 * retailer themselves.
 *
 * It does not solve pricing. The live site prints the same `$19.99` default as
 * the PDF, which is the strongest confirmation yet that the figure is a
 * system placeholder rather than a selling price.
 *
 * The site renders client-side and never reaches network-idle, so it is read
 * with a real browser and an explicit settle wait — the same approach used for
 * Cetaphil and La Roche-Posay. Every page is cached to disk, so a re-run costs
 * nothing.
 *
 *   npx tsx migration/legacy-nordic-lux/scripts/live-site.ts [--refresh]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const ARCHIVE = resolve(HERE, '../archive');
const CACHE = resolve(ARCHIVE, 'live-site-cache');
const OUT = resolve(ARCHIVE, 'live-site-catalogue.json');

const ORIGIN = 'https://thnordiclux.vercel.app';
const REFRESH = process.argv.includes('--refresh');

export type LiveProduct = {
  url: string;
  sku: string | null;
  name: string;
  brandSection: string | null;
  /** "1 Fl Oz", "30ml" — the site's own "Product type" field. */
  productType: string | null;
  category: string | null;
  country: string | null;
  priceText: string | null;
  inStock: boolean;
  stock: number | null;
  reviewCount: number | null;
  description: string | null;
  /** Product imagery, excluding site chrome and the related-products rail. */
  images: string[];
  retrievedAt: string;
};

/** Waits for the client-rendered product body rather than for network idle. */
async function settle(page: Page, marker: string, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const ready = await page.evaluate(
      (m) => document.body.innerText.includes(m),
      marker,
    );
    if (ready) return true;
    await page.waitForTimeout(700);
  }
  return false;
}

/** Every product URL, walked through the listing's pagination. */
async function collectProductUrls(page: Page): Promise<string[]> {
  const found = new Set<string>();

  await page.goto(`${ORIGIN}/shop`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await settle(page, 'products');
  await page.waitForTimeout(2000);

  const readLinks = () =>
    page.evaluate(() => [
      ...new Set(
        [...document.querySelectorAll('a[href^="/product/"]')].map((a) =>
          (a as HTMLAnchorElement).getAttribute('href')!,
        ),
      ),
    ]);

  // The listing paginates client-side — the URL never changes, so the only way
  // through it is the Next control.
  for (let pageNo = 1; pageNo <= 15; pageNo++) {
    for (const l of await readLinks()) found.add(l);

    const next = page
      .locator('button:has-text("Next"), a:has-text("Next")')
      .first();
    if ((await next.count()) === 0) break;
    if (await next.isDisabled().catch(() => false)) break;

    const before = (await readLinks()).join('|');
    await next.click().catch(() => undefined);
    // Wait for the grid itself to change rather than for a navigation.
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(500);
      if ((await readLinks()).join('|') !== before) break;
    }
    if ((await readLinks()).join('|') === before) break;
  }

  return [...found];
}

function parseProduct(
  url: string,
  text: string,
  images: string[],
  h1: string | null,
): LiveProduct {
  const field = (label: string) => {
    // The site renders detail fields as a label line followed by its value.
    const re = new RegExp(`^${label}\\s*\\n+\\s*(.+)$`, 'im');
    return text.match(re)?.[1]?.trim() ?? null;
  };

  const stockMatch = text.match(/In Stock\s*\((\d+)\s*available\)/i);
  // Scope the price to the buy block. The site header advertises "Free
  // Shipping on Orders $50+", which a whole-page search picks up first.
  const buyBlock = text.split(/\nDescription\s*\n/i)[0] ?? text;
  const afterTitle = h1 ? (buyBlock.split(h1.trim())[1] ?? buyBlock) : buyBlock;
  const priceMatch = afterTitle.match(/\$\s?[\d,]+(?:\.\d+)?/);
  const reviewMatch = text.match(/\((\d+)\s*reviews?\)/i);

  // Description runs from the "Description" heading to the buy controls.
  const descriptionMatch = text.match(
    /\nDescription\s*\n([\s\S]*?)\n(?:Add to Cart|Check with WhatsApp|SKU\s*\n)/i,
  );

  // The brand is printed in caps immediately above the product title.
  const brand = h1
    ? (text.match(
        new RegExp(
          `\\n([A-Z][A-Z0-9 &.'-]{2,})\\s*\\n${escapeRe(h1.slice(0, 40))}`,
        ),
      )?.[1] ?? null)
    : null;

  return {
    url,
    sku: field('SKU'),
    name: h1?.trim() ?? '',
    brandSection: brand?.trim() ?? null,
    productType: field('Product type'),
    category: field('Category'),
    country: field('Country'),
    priceText: priceMatch?.[0]?.replace(/\s/g, '') ?? null,
    inStock: /In Stock/i.test(text),
    stock: stockMatch ? Number(stockMatch[1]) : null,
    reviewCount: reviewMatch ? Number(reviewMatch[1]) : null,
    description:
      descriptionMatch?.[1]?.trim().replace(/\n{3,}/g, '\n\n') || null,
    images,
    retrievedAt: new Date().toISOString(),
  };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function readProduct(
  page: Page,
  href: string,
): Promise<LiveProduct | null> {
  const url = `${ORIGIN}${href}`;
  const cacheFile = resolve(CACHE, `${href.split('/').pop()}.json`);
  if (!REFRESH && existsSync(cacheFile)) {
    const cached = JSON.parse(readFileSync(cacheFile, 'utf8')) as LiveProduct;
    // Only a complete read is worth keeping. A page that was still rendering
    // parses into a row with no SKU, and caching that would make the gap
    // permanent — so those are re-fetched.
    if (cached.sku) return cached;
  }

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  } catch {
    return null;
  }
  const ready = await settle(page, 'SK80CT');
  if (!ready) {
    // Not every product carries an SK80CT code; fall back to the label.
    if (!(await settle(page, 'SKU', 10_000))) return null;
  }
  await page.waitForTimeout(1200);

  const raw = await page.evaluate(() => {
    const main = (document.querySelector('main') ??
      document.body) as HTMLElement;
    // The related-products rail sits after the "Similar Products" heading;
    // its imagery belongs to other products and must not be collected.
    const cut = main.innerText.indexOf('Similar Products');

    // The related-products rail carries other products' photography. Find its
    // heading and keep only images that precede it in document order —
    // filtering on text alone would still let the rail's images through.
    const railHeading = [
      ...document.querySelectorAll('h1,h2,h3,h4,p,span,div'),
    ].find((el) =>
      (el.textContent ?? '').trim().startsWith('Similar Products'),
    );

    const gallery = [...document.querySelectorAll('img')]
      .filter((img) => {
        const src = img.currentSrc || img.src;
        if (!/^https?:/.test(src)) return false;
        if (/\/_next\/static\/media\//.test(src)) return false; // site chrome
        const area = (img.naturalWidth || 0) * (img.naturalHeight || 0);
        if (area <= 40_000) return false;
        if (railHeading) {
          const position = railHeading.compareDocumentPosition(img);
          // DOCUMENT_POSITION_PRECEDING === 2: the image sits above the rail.
          if (!(position & Node.DOCUMENT_POSITION_PRECEDING)) return false;
        }
        return true;
      })
      .map((img) => img.currentSrc || img.src);

    return {
      h1: document.querySelector('h1')?.textContent ?? null,
      text: cut > 0 ? main.innerText.slice(0, cut) : main.innerText,
      images: [...new Set(gallery)],
    };
  });

  const product = parseProduct(url, raw.text, raw.images, raw.h1);
  if (product.sku) {
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(product, null, 2));
  }
  return product;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1200 },
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();

console.warn('Collecting product URLs…');
const urls = await collectProductUrls(page);
console.warn(`  ${urls.length} product URLs`);

const products: LiveProduct[] = [];
for (const [i, href] of urls.entries()) {
  const product = await readProduct(page, href);
  if (product) products.push(product);
  if ((i + 1) % 10 === 0) console.warn(`  read ${i + 1}/${urls.length}`);
}

await browser.close();
writeFileSync(OUT, JSON.stringify(products, null, 2));

const withSku = products.filter((p) => p.sku);
const withDesc = products.filter((p) => p.description);
const withImg = products.filter((p) => p.images.length > 0);
const prices = new Map<string, number>();
for (const p of products)
  prices.set(
    p.priceText ?? 'none',
    (prices.get(p.priceText ?? 'none') ?? 0) + 1,
  );

console.warn(`\nproducts read:    ${products.length}`);
console.warn(
  `with SKU:         ${withSku.length}  (unique ${new Set(withSku.map((p) => p.sku)).size})`,
);
console.warn(`with description: ${withDesc.length}`);
console.warn(`with imagery:     ${withImg.length}`);
console.warn(
  `reviews > 0:      ${products.filter((p) => (p.reviewCount ?? 0) > 0).length}`,
);
console.warn(
  `price histogram:  ${[...prices].map(([k, v]) => `${k}×${v}`).join('  ')}`,
);
console.warn(`\nwrote ${OUT}`);
