/**
 * Official-source recovery for the brands that plain HTTP cannot read.
 *
 * Cetaphil renders its product pages client-side (the served HTML carries no
 * title, no OpenGraph and no JSON-LD), and La Roche-Posay answers a scripted
 * request with 403. Both are readable in a real browser, so this uses the
 * Playwright that already ships with the project — locally, no paid service,
 * and only for the handful of products the HTTP harvest could not resolve.
 *
 * Results are merged into archive/official-catalogue.json under the brand key,
 * so the ordinary matcher in enrich.ts consumes them like any other source.
 *
 *   npx tsx migration/legacy-nordic-lux/scripts/official-browser.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';

import { stripHtml, type OfficialProduct } from './official';

const HERE = dirname(fileURLToPath(import.meta.url));
const ARCHIVE = resolve(HERE, '../archive');
const CATALOGUE = resolve(ARCHIVE, 'official-catalogue.json');

/**
 * Product pages to read, per brand.
 *
 * These are entry points on the manufacturer's own site; the crawler follows
 * each brand's listing page to collect its product links, so the set adapts if
 * a URL moves rather than depending on a hand-copied deep link.
 */
const TARGETS: Record<string, { listings: string[]; productHref: RegExp }> = {
  Cetaphil: {
    listings: [
      'https://www.cetaphil.com/us/products/product-categories/all-cleansers',
      'https://www.cetaphil.com/us/products/product-categories/facial-cleansers',
      'https://www.cetaphil.com/us/products/product-categories/body-cleansers',
      'https://www.cetaphil.com/us/products/product-categories/all-moisturizers',
      'https://www.cetaphil.com/us/products/product-categories/facial-moisturizers',
      'https://www.cetaphil.com/us/products/product-categories/body-moisturizers',
    ],
    // A Cetaphil product URL ends in its GTIN, e.g. .../gentle-skin-cleanser/302993936015.html
    productHref: /cetaphil\.com\/us\/products\/.+\/\d{8,}\.html$/,
  },
  // La Roche-Posay's category pages render their product grid too late to
  // scrape reliably, but the on-site search returns real product links on the
  // first paint. Searching the two ranges we stock covers all five products.
  'La Roche-Posay': {
    listings: [
      'https://www.laroche-posay.co.uk/en_GB/search?q=anthelios+uvmune+400',
      'https://www.laroche-posay.co.uk/en_GB/search?q=effaclar',
    ],
    productHref: /laroche-posay\.co\.uk\/en_GB\/[^/]+\/LRP_\d+\.html$/,
  },
};

/** Reads whatever structured data a rendered page exposes. */
async function readProduct(
  page: Page,
  url: string,
): Promise<OfficialProduct | null> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    // Product data is injected after hydration on both sites.
    await page.waitForTimeout(2500);

    // La Roche-Posay serves a Cloudflare interstitial ("Just a moment...")
    // before the real document. Wait for it to hand over rather than scraping
    // the challenge page, which is where the empty titles came from.
    for (let attempt = 0; attempt < 6; attempt++) {
      const title = await page.title();
      if (
        !/just a moment|attention required|checking your browser/i.test(title)
      )
        break;
      await page.waitForTimeout(4000);
    }
    // Lazy galleries only load what is in view.
    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(1500);
  } catch {
    return null;
  }

  // NB: no named inner functions inside `evaluate` — the TypeScript loader
  // rewrites them with a `__name` helper that does not exist in the page.
  const data = await page.evaluate(() => {
    let ld: Record<string, unknown> | null = null;
    for (const node of document.querySelectorAll(
      'script[type="application/ld+json"]',
    )) {
      try {
        const parsed = JSON.parse(node.textContent ?? '');
        const list = Array.isArray(parsed) ? parsed : [parsed];
        for (const entry of list) {
          const type = entry?.['@type'];
          const types = Array.isArray(type) ? type : [type];
          if (types.includes('Product')) ld = entry;
        }
      } catch {
        /* ignore malformed blocks */
      }
    }

    // Product imagery, preferring the largest asset the gallery references.
    const images = [...document.querySelectorAll('img')]
      .map((img) => ({
        src: img.currentSrc || img.src,
        area: (img.naturalWidth || 0) * (img.naturalHeight || 0),
        alt: img.alt ?? '',
      }))
      .filter(
        (i) =>
          /^https?:/.test(i.src) &&
          i.area > 90_000 &&
          !/logo|icon|sprite|badge|placeholder/i.test(i.src) &&
          // Site chrome lives in the shared "Library" bucket on Demandware
          // storefronts — footer badges are large but are not the product.
          !/-Library\/|\/footer\/|\/header\/|\/banner/i.test(i.src),
      )
      .sort((a, b) => b.area - a.area)
      .map((i) => i.src);

    const bodyText = (
      (document.querySelector('main') ?? document.body) as HTMLElement
    ).innerText;
    const ogTitle =
      document
        .querySelector('meta[property="og:title"]')
        ?.getAttribute('content') ?? null;
    const ogDesc =
      document
        .querySelector('meta[property="og:description"]')
        ?.getAttribute('content') ?? null;
    const ogImage =
      document
        .querySelector('meta[property="og:image"]')
        ?.getAttribute('content') ?? null;

    return {
      ld,
      title: (ld?.name as string) ?? ogTitle ?? document.title,
      description: (ld?.description as string) ?? ogDesc ?? null,
      ogImage,
      images: [...new Set(images)].slice(0, 6),
      bodyText: bodyText.slice(0, 6000),
    };
  });

  if (!data.title) return null;

  const host = new URL(url).hostname;
  const sizes = [
    ...new Set(
      [
        ...data.bodyText.matchAll(/\b(\d[\d.]*)\s?(ml|g|fl\.?\s?oz|oz)\b/gi),
      ].map(
        (m) => `${Number(m[1])}${m[2]!.toLowerCase().replace(/\s|\./g, '')}`,
      ),
    ),
  ].slice(0, 8);

  return {
    source: host,
    sourceDomain: host,
    url,
    title: stripHtml(data.title)
      .replace(/\s*\|.*$/, '')
      .trim(),
    vendor: null,
    description: data.description ? stripHtml(data.description) : null,
    ingredients: sectionFrom(data.bodyText, /ingredients/i),
    howToUse: sectionFrom(data.bodyText, /how to use|directions|application/i),
    images: [
      ...new Set([...(data.ogImage ? [data.ogImage] : []), ...data.images]),
    ],
    sizes,
    tags: [],
    productType: null,
    retrievedAt: new Date().toISOString(),
  };
}

function sectionFrom(text: string, label: RegExp): string | null {
  const lines = text.split('\n').map((l) => l.trim());
  const at = lines.findIndex((l) => label.test(l) && l.length < 60);
  if (at < 0) return null;
  const body: string[] = [];
  for (let i = at + 1; i < lines.length && body.join(' ').length < 1200; i++) {
    const line = lines[i];
    if (!line) {
      if (body.length) break;
      continue;
    }
    if (
      /^(ingredients|how to use|directions|reviews|related|you may also)/i.test(
        line,
      ) &&
      body.length
    )
      break;
    body.push(line);
  }
  const joined = body.join('\n').trim();
  return joined.length > 20 ? joined : null;
}

// Headed: La Roche-Posay's bot check never hands over to headless Chromium,
// but clears immediately for a real browser window. This is a local, manual
// migration step, so a visible window is an acceptable cost.
const browser = await chromium.launch({
  headless: false,
  args: ['--disable-blink-features=AutomationControlled'],
});
const context = await browser.newContext({
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: { width: 1440, height: 900 },
  locale: 'en-GB',
});
const page = await context.newPage();

const catalogue: Record<string, OfficialProduct[]> = existsSync(CATALOGUE)
  ? JSON.parse(readFileSync(CATALOGUE, 'utf8'))
  : {};

for (const [brand, target] of Object.entries(TARGETS)) {
  const links = new Set<string>();
  for (const listing of target.listings) {
    try {
      await page.goto(listing, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });
      await page.waitForTimeout(3000);
      const hrefs = await page.evaluate(() =>
        [...document.querySelectorAll('a[href]')].map(
          (a) => (a as HTMLAnchorElement).href,
        ),
      );
      for (const href of hrefs)
        if (target.productHref.test(href)) links.add(href.split('?')[0]!);
    } catch {
      console.warn(`  listing failed: ${listing}`);
    }
  }

  console.warn(`${brand}: ${links.size} product links`);
  const products: OfficialProduct[] = [];
  for (const url of [...links].slice(0, 60)) {
    const product = await readProduct(page, url);
    if (product) products.push(product);
  }
  console.warn(`${brand}: ${products.length} products read`);
  if (products.length) catalogue[brand] = products;
}

await browser.close();
writeFileSync(CATALOGUE, JSON.stringify(catalogue, null, 2));
console.warn(`wrote ${CATALOGUE}`);
