/**
 * Phase 6 — assembles the final image set for every catalogue product.
 *
 * Three sources, in descending order of authority:
 *
 *   1. legacy repo media   — already Nordic Lux's own asset for that product
 *   2. PDF embedded JPEG   — Nordic Lux's own catalogue photography
 *   3. official brand page — the manufacturer's own imagery, only for products
 *                            whose identity was proven in `enrich.ts`
 *
 * Whatever the source, the bytes end up in the application's own media
 * architecture: re-encoded to webp at quality 82 under
 * `public/media/products/`, referenced by path. Nothing is hot-linked, and
 * every file carries provenance (source URL, domain, retrieval date, content
 * hash) in `archive/media-provenance.json` so usage rights can be reviewed.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import {
  buildCanonical,
  loadSources,
  type CanonicalProduct,
} from './canonical';
import type { Enrichment } from './enrich';
import { loadLive } from './plan';

const HERE = dirname(fileURLToPath(import.meta.url));
const ARCHIVE = resolve(HERE, '../archive');
const REPO = resolve(HERE, '../../..');
const OUT_DIR = resolve(REPO, 'public/media/products');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Minimum acceptable dimensions. Set just under the smallest image the PDF
 * itself carries (201px): those are Nordic Lux's own catalogue photographs of
 * the exact item they stock, so they are worth keeping as a fallback even
 * though they are softer than a manufacturer master. Anything smaller than
 * this genuinely does look broken in a gallery.
 */
const MIN_EDGE = 200;

/**
 * Width every served asset is brought up to.
 *
 * 640px is the widest variant a product card requests at mobile DPR, so an
 * asset narrower than this is guaranteed to be enlarged somewhere downstream.
 * Doing it once here keeps cards sharp and keeps the request path simple.
 */
const TARGET_WIDTH = 640;

export type MediaRecord = {
  sku: string;
  /** Path served by the app, e.g. /media/products/sk80ct0084.webp */
  url: string;
  file: string;
  origin: 'nordic-lux-live' | 'legacy' | 'pdf' | 'official';
  sourceUrl: string | null;
  sourceDomain: string | null;
  retrievedAt: string;
  sha256: string;
  width: number;
  height: number;
  bytes: number;
  sortOrder: number;
  /** Set when identical bytes were already written for another product. */
  duplicateOf: string | null;
};

const slugForFile = (sku: string) =>
  sku.toLowerCase().replace(/[^a-z0-9]+/g, '-');

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 1024 ? buf : null;
  } catch {
    return null;
  }
}

/**
 * Shopify and most CDNs accept a width hint. Asking for a large master avoids
 * shipping a thumbnail into a PDP gallery.
 */
function upscaleUrl(url: string): string {
  if (/cdn\.shopify\.com/.test(url))
    return url.replace(/(\.(?:jpe?g|png|webp))(\?|$)/i, '_2048x$1$2');
  return url;
}

type Candidate = {
  origin: MediaRecord['origin'];
  sourceUrl: string | null;
  bytes: Buffer;
  retrievedAt: string;
};

async function candidatesFor(
  product: CanonicalProduct,
  enrichment: Enrichment | undefined,
  cache: Map<string, Buffer | null>,
  liveImages: string[] = [],
): Promise<Candidate[]> {
  const now = new Date().toISOString();
  const out: Candidate[] = [];

  // 0. the image Nordic Lux themselves publish for this SKU. It outranks
  // everything else because it needs no identity inference at all — the
  // retailer has already stated which photograph belongs to this product.
  for (const raw of liveImages) {
    const url = upscaleUrl(raw);
    if (!cache.has(url)) {
      cache.set(url, await downloadImage(url));
      await new Promise((r) => setTimeout(r, 350));
    }
    const bytes = cache.get(url);
    if (bytes)
      out.push({
        origin: 'nordic-lux-live',
        sourceUrl: raw,
        bytes,
        retrievedAt: now,
      });
  }

  // Order sets which image leads the PDP gallery. Every source here is already
  // identity-verified, so the tiebreak is resolution: manufacturer masters run
  // 1000–2048px, the legacy repo's assets a few hundred, and the PDF's
  // embedded photography 200–400px. Best first, the rest kept as gallery
  // alternates rather than discarded.

  // 1. official manufacturer imagery (only for a proven identity match)
  for (const raw of enrichment?.images ?? []) {
    const url = upscaleUrl(raw);
    if (!cache.has(url)) {
      cache.set(url, await downloadImage(url));
      await new Promise((r) => setTimeout(r, 350));
    }
    const bytes = cache.get(url);
    if (bytes)
      out.push({
        origin: 'official',
        sourceUrl: raw,
        bytes,
        retrievedAt: enrichment?.source?.retrievedAt ?? now,
      });
  }

  // 2. legacy repo asset — Nordic Lux's own image for this product
  if (product.legacyImage) {
    const file = resolve(
      ARCHIVE,
      'media/products',
      product.legacyImage.replace(/^\/products\//, ''),
    );
    if (existsSync(file)) {
      out.push({
        origin: 'legacy',
        sourceUrl: product.legacyImage,
        bytes: readFileSync(file),
        retrievedAt: now,
      });
    }
  }

  // 3. PDF embedded photography — the backstop
  if (product.pdfImage) {
    const file = resolve(ARCHIVE, 'pdf-media', product.pdfImage);
    if (existsSync(file)) {
      out.push({
        origin: 'pdf',
        sourceUrl: `Nordic_Lux_Product_Catalogue.pdf#${product.pdfImage}`,
        bytes: readFileSync(file),
        retrievedAt: now,
      });
    }
  }

  return out;
}

/**
 * Re-encodes to webp and rejects anything too small or unreadable. Rejecting
 * here rather than at render time is what keeps a broken image off the PDP.
 */
async function encode(
  bytes: Buffer,
): Promise<{ data: Buffer; width: number; height: number } | null> {
  try {
    const meta = await sharp(bytes).metadata();
    if (!meta.width || !meta.height) return null;
    if (Math.min(meta.width, meta.height) < MIN_EDGE) return null;
    // Normalise the served width to what the layout actually asks for. A
    // 320px catalogue photograph dropped into a 640px card slot is enlarged
    // either by the browser or by the image optimiser, and both look softer
    // than doing it once, here, with a good kernel.
    const enlargeTo = meta.width < TARGET_WIDTH ? TARGET_WIDTH : undefined;

    const { data, info } = await sharp(bytes)
      // Flatten transparency onto white: several official PNGs are cut-outs and
      // render as a black box on dark surfaces otherwise.
      .flatten({ background: '#ffffff' })
      .resize(
        enlargeTo
          ? { width: enlargeTo, kernel: 'lanczos3' }
          : {
              width: 1200,
              height: 1200,
              fit: 'inside',
              withoutEnlargement: true,
            },
      )
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    return null;
  }
}

export async function buildMedia(
  canonical: CanonicalProduct[],
  enrichment: Enrichment[],
  { dryRun = false, maxPerProduct = 3 } = {},
): Promise<MediaRecord[]> {
  if (!dryRun) mkdirSync(OUT_DIR, { recursive: true });

  const bySku = new Map(enrichment.map((e) => [e.sku, e]));
  const liveBySku = new Map(
    loadLive().flatMap((l) => (l.sku ? [[l.sku, l.images] as const] : [])),
  );
  const downloadCache = new Map<string, Buffer | null>();
  const writtenHashes = new Map<string, string>();
  const records: MediaRecord[] = [];

  for (const product of canonical) {
    // A duplicate listing shares the primary's imagery; nothing to fetch.
    if (product.state === 'DUPLICATE_CONFIRMED') continue;

    const candidates = await candidatesFor(
      product,
      bySku.get(product.sku),
      downloadCache,
      liveBySku.get(product.sku) ?? [],
    );
    let sortOrder = 0;

    /** Native width of the best asset kept so far, before any enlargement. */
    let bestNativeWidth = 0;

    for (const candidate of candidates) {
      if (sortOrder >= maxPerProduct) break;

      // A gallery alternate that is softer than the shot it sits beside is
      // worse than no alternate: the customer clicks through and the product
      // gets blurrier. Only keep extras that hold their own.
      const nativeWidth =
        (
          await sharp(candidate.bytes)
            .metadata()
            .catch(() => null)
        )?.width ?? 0;
      if (
        sortOrder > 0 &&
        nativeWidth < TARGET_WIDTH &&
        bestNativeWidth >= TARGET_WIDTH
      )
        continue;

      const encoded = await encode(candidate.bytes);
      if (!encoded) continue;
      bestNativeWidth = Math.max(bestNativeWidth, nativeWidth);

      const sha256 = createHash('sha256').update(encoded.data).digest('hex');
      const suffix = sortOrder === 0 ? '' : `-${sortOrder + 1}`;
      const file = `${slugForFile(product.sku)}${suffix}.webp`;
      const duplicateOf = writtenHashes.get(sha256) ?? null;
      writtenHashes.set(sha256, duplicateOf ?? file);

      if (!dryRun) writeFileSync(resolve(OUT_DIR, file), encoded.data);

      records.push({
        sku: product.sku,
        url: `/media/products/${file}`,
        file,
        origin: candidate.origin,
        sourceUrl: candidate.sourceUrl,
        sourceDomain: candidate.sourceUrl?.startsWith('http')
          ? new URL(candidate.sourceUrl).hostname
          : null,
        retrievedAt: candidate.retrievedAt,
        sha256,
        width: encoded.width,
        height: encoded.height,
        bytes: encoded.data.length,
        sortOrder,
        duplicateOf,
      });
      sortOrder++;
    }
  }

  return records;
}

const invokedDirectly = process.argv[1]
  ?.replace(/\\/g, '/')
  .endsWith('media-fetch.ts');
if (invokedDirectly) {
  const dryRun = process.argv.includes('--dry-run');
  const { pdf, legacy } = loadSources();
  const canonical = buildCanonical(pdf, legacy);
  const enrichment = JSON.parse(
    readFileSync(resolve(ARCHIVE, 'official-enrichment.json'), 'utf8'),
  ) as Enrichment[];

  const records = await buildMedia(canonical, enrichment, { dryRun });
  writeFileSync(
    resolve(ARCHIVE, 'media-provenance.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        count: records.length,
        media: records,
      },
      null,
      2,
    ),
  );

  const withMedia = new Set(records.map((r) => r.sku));
  const needed = canonical.filter((c) => c.state !== 'DUPLICATE_CONFIRMED');
  const missing = needed.filter((c) => !withMedia.has(c.sku));

  const byOrigin = new Map<string, number>();
  for (const r of records)
    byOrigin.set(r.origin, (byOrigin.get(r.origin) ?? 0) + 1);

  console.warn(`${dryRun ? '[dry run] ' : ''}media files: ${records.length}`);
  console.warn(`products with imagery: ${withMedia.size}/${needed.length}`);
  console.warn(
    `by origin: ${[...byOrigin].map(([k, v]) => `${k} ${v}`).join(', ')}`,
  );
  if (missing.length) {
    console.warn(`\nMISSING IMAGERY (${missing.length}):`);
    for (const m of missing)
      console.warn(`  ${m.sku}  ${m.brand.padEnd(15)} ${m.name.slice(0, 60)}`);
  }
}
