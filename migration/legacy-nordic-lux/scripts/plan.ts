/**
 * The import plan — one resolved row per catalogue product.
 *
 * This is where the three source layers are folded into the exact shape the
 * database expects, and where every "which source wins" decision lives:
 *
 *   identity, SKU, stock   PDF (Nordic Lux's own inventory export)
 *   long-form copy         legacy repo -> official brand page -> PDF blurb
 *   imagery                official -> legacy -> PDF (see media-fetch.ts)
 *   price                  legacy repo, or temporary operational PDF/live default
 *
 * Nothing is invented. A field with no trustworthy source stays null and is
 * reported, rather than being filled with something plausible.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildCanonical,
  loadSources,
  LEGACY_LINKS,
  type CanonicalProduct,
  type LegacyProduct,
} from './canonical';
import type { Enrichment } from './enrich';
import type { MediaRecord } from './media-fetch';
import type { PdfProduct } from './pdf-extract';
import type { LiveProduct } from './live-site';

const HERE = dirname(fileURLToPath(import.meta.url));
const ARCHIVE = resolve(HERE, '../archive');

export type PlannedMedia = {
  url: string;
  alt: string;
  sortOrder: number;
  width: number;
  height: number;
};

export type PlannedProduct = {
  sku: string;
  slug: string;
  name: string;
  brand: string;
  category: string;
  routineStep: string | null;

  variantName: string;
  volumeMl: number | null;

  /** Cents. Temporary means operational launch price, not historic proof. */
  priceMinor: number;
  priceSource: 'legacy-nordic-lux-website' | 'temporary';
  pdfPriceText: string | null;

  stock: number;
  stockSource: 'pdf-inventory-export';
  /** True when Nordic Lux's own live storefront reports the same count. */
  stockCorroborated: boolean;

  excerpt: string | null;
  description: string | null;
  descriptionSource: 'nordic-lux-live' | 'legacy' | 'official' | 'pdf' | 'none';
  benefits: string[];
  howToUse: string | null;
  ingredientsList: string | null;
  keyIngredients: {
    name: string;
    concentration: string | null;
    description: string;
  }[];
  suitableSkinTypes: string[];
  concerns: string[];

  seoTitle: string;
  seoDescription: string | null;

  media: PlannedMedia[];

  /** Published when the row is sellable on the storefront. */
  status: 'published' | 'draft';

  provenance: {
    pdfPage: number;
    pdfName: string;
    legacySku: string | null;
    officialUrl: string | null;
    officialDomain: string | null;
    officialRetrievedAt: string | null;
    liveSiteUrl: string | null;
    mergedDuplicateSkus: string[];
  };
};

/* ==========================================================================
   Helpers
   ========================================================================== */

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/%/g, ' percent ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/**
 * Trims copy to the last complete sentence.
 *
 * The PDF's blurbs are cut mid-word by the layout engine ("...and leave sk").
 * Where a blurb is the only description we have, cutting back to the last full
 * stop yields something short but honest — no half-word is ever shown, which
 * is what the zero-truncation rule is protecting against.
 */
export function toCompleteSentences(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const lastStop = Math.max(
    trimmed.lastIndexOf('. '),
    trimmed.lastIndexOf('.'),
    trimmed.lastIndexOf('!'),
    trimmed.lastIndexOf('?'),
  );
  if (lastStop < 40) return null;
  return trimmed.slice(0, lastStop + 1).trim();
}

/** A one-line card summary derived from the first sentence of the description. */
function excerptFrom(description: string | null): string | null {
  if (!description) return null;
  const firstStop = description.indexOf('. ');
  const candidate =
    firstStop > 40 ? description.slice(0, firstStop + 1) : description;
  return candidate.length > 220
    ? `${candidate.slice(0, 217).replace(/\s+\S*$/, '')}…`
    : candidate.trim();
}

/**
 * The pack size Nordic Lux's own storefront states for a SKU.
 *
 * Its "Product type" field sometimes lists every size the *range* comes in
 * ("30ml,50ml,100ml") rather than this line's size, so a multi-valued entry is
 * not evidence about this SKU and is ignored — the product keeps a "Standard"
 * variant and appears on the confirmation list instead of being guessed at.
 */
export function liveSizeLabel(
  live: { productType?: string | null } | undefined,
): string | null {
  const raw = live?.productType?.trim();
  if (!raw || raw.includes(',')) return null;
  return raw;
}

/** Alt text that describes the product rather than repeating the file name. */
function altFor(name: string, index: number): string {
  return index === 0 ? name : `${name} — view ${index + 1}`;
}

/* ==========================================================================
   Price
   ========================================================================== */

/**
 * The client has confirmed prices change by shipment and temporary operating
 * prices are acceptable until staff update shipment pricing in the admin.
 * Legacy Nordic Lux prices still outrank defaults. Otherwise, the PDF/live
 * default is carried as a temporary USD price, not as verified history.
 */
function priceFor(
  legacy: LegacyProduct | undefined,
  pdfPriceText: string | null,
): {
  priceMinor: number;
  source: PlannedProduct['priceSource'];
} {
  if (!legacy || typeof legacy.price !== 'number') {
    const parsed = Number((pdfPriceText ?? '$19.99').replace(/[^\d.]/g, ''));
    return {
      priceMinor:
        Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 1999,
      source: 'temporary',
    };
  }
  return {
    priceMinor: Math.round(legacy.price * 100),
    source: 'legacy-nordic-lux-website',
  };
}

/* ==========================================================================
   Build
   ========================================================================== */

export type PlanInputs = {
  canonical: CanonicalProduct[];
  enrichment: Enrichment[];
  media: MediaRecord[];
  pdf: PdfProduct[];
  legacy: LegacyProduct[];
  live: LiveProduct[];
};

export function buildPlan(inputs: PlanInputs): PlannedProduct[] {
  const enrichBySku = new Map(inputs.enrichment.map((e) => [e.sku, e]));
  const liveBySku = new Map(
    inputs.live.flatMap((l) => (l.sku ? [[l.sku, l] as const] : [])),
  );
  const pdfBySku = new Map(inputs.pdf.map((p) => [p.sku!, p]));
  const legacyBySku = new Map(inputs.legacy.map((l) => [l.sku, l]));

  const legacyForPdfSku = new Map<string, LegacyProduct>();
  for (const [legacySku, pdfSkus] of Object.entries(LEGACY_LINKS)) {
    const row = legacyBySku.get(legacySku);
    if (!row) continue;
    for (const pdfSku of pdfSkus) legacyForPdfSku.set(pdfSku, row);
  }

  const mediaBySku = new Map<string, MediaRecord[]>();
  for (const m of inputs.media) {
    if (!mediaBySku.has(m.sku)) mediaBySku.set(m.sku, []);
    mediaBySku.get(m.sku)!.push(m);
  }

  const mergedInto = new Map<string, string[]>();
  for (const c of inputs.canonical) {
    if (c.state === 'DUPLICATE_CONFIRMED' && c.duplicateOf) {
      if (!mergedInto.has(c.duplicateOf)) mergedInto.set(c.duplicateOf, []);
      mergedInto.get(c.duplicateOf)!.push(c.sku);
    }
  }

  const usedSlugs = new Set<string>();
  const plan: PlannedProduct[] = [];

  for (const c of inputs.canonical) {
    if (c.state === 'DUPLICATE_CONFIRMED') continue;

    const official = enrichBySku.get(c.sku);
    const legacy = legacyForPdfSku.get(c.sku);
    const pdfRow = pdfBySku.get(c.sku);

    // Description: legacy long-form first (it was written for this shop), then
    // the manufacturer's own copy, then the PDF blurb cut to whole sentences.
    const live = liveBySku.get(c.sku);

    // Nordic Lux's own storefront copy outranks everything: it is the
    // retailer's description of the exact SKU, not a third party's page that
    // had to be matched to it.
    let description = live?.description ?? null;
    let descriptionSource: PlannedProduct['descriptionSource'] = description
      ? 'nordic-lux-live'
      : 'none';
    if (!description && c.description) {
      description = c.description;
      descriptionSource = 'legacy';
    }
    if (!description && official?.description) {
      description = official.description;
      descriptionSource = 'official';
    }
    if (!description && pdfRow?.description) {
      description = toCompleteSentences(pdfRow.description);
      descriptionSource = description ? 'pdf' : 'none';
    }

    // A unique slug, kept stable by falling back to the SKU rather than a
    // counter — a counter would reshuffle URLs whenever the catalogue changes.
    let slug = slugify(c.name);
    if (!slug || usedSlugs.has(slug)) slug = slugify(`${c.name}-${c.sku}`);
    usedSlugs.add(slug);

    const { priceMinor, source: priceSource } = priceFor(
      legacy,
      c.pdfPriceText,
    );
    // Dedup is per-SKU only. A byte-identical file shared with *another* SKU
    // (the 30ml and 100ml skin1004 ampoules ship one manufacturer shot) is
    // still this product's own photograph and was written to disk under its
    // own name, so dropping it left that product with no imagery at all.
    const skuFilePrefix = c.sku.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const media = (mediaBySku.get(c.sku) ?? [])
      .filter((m) => !m.duplicateOf?.startsWith(skuFilePrefix))
      // Trailing junk (badges, size charts) is small *and* low-resolution;
      // bytes alone rejected clean 1000px studio shots on flat backgrounds.
      .filter(
        (m) => !(m.sortOrder >= 2 && m.bytes < 48_000 && (m.width ?? 0) < 600),
      )
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((m, i) => ({
        url: m.url,
        alt: altFor(c.name, i),
        sortOrder: i,
        width: m.width,
        height: m.height,
      }));

    plan.push({
      sku: c.sku,
      slug,
      name: c.name,
      brand: c.brand,
      category: c.category,
      routineStep: c.routineStep,

      variantName: c.sizeLabel ?? liveSizeLabel(live) ?? 'Standard',
      volumeMl: c.volumeMl,

      priceMinor,
      priceSource,
      pdfPriceText: c.pdfPriceText,

      stock: c.stock ?? 0,
      stockSource: 'pdf-inventory-export',
      stockCorroborated: live?.stock != null && live.stock === (c.stock ?? 0),

      excerpt: c.excerpt ?? excerptFrom(description),
      description,
      descriptionSource,
      benefits: c.benefits,
      howToUse: c.howToUse ?? official?.howToUse ?? null,
      ingredientsList: official?.ingredients ?? null,
      keyIngredients: c.ingredients,
      suitableSkinTypes: c.suitableSkinTypes,
      concerns: c.concerns,

      seoTitle: `${c.name} | Nordic Lux`,
      seoDescription: excerptFrom(description),

      media,

      // The client has approved temporary USD prices for launch. Staff can
      // update shipment prices in the admin without re-running migration code.
      status: 'published',

      provenance: {
        pdfPage: c.provenance.pdfPage,
        pdfName: c.provenance.pdfName,
        legacySku: legacy?.sku ?? null,
        officialUrl: official?.source?.url ?? null,
        officialDomain: official?.source?.domain ?? null,
        officialRetrievedAt: official?.source?.retrievedAt ?? null,
        liveSiteUrl: live?.url ?? null,
        mergedDuplicateSkus: mergedInto.get(c.sku) ?? [],
      },
    });
  }

  return plan;
}

/** Nordic Lux's own live catalogue, when it has been harvested. */
export function loadLive(): LiveProduct[] {
  const path = resolve(ARCHIVE, 'live-site-catalogue.json');
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf8')) as LiveProduct[];
}

export function loadPlan(): {
  plan: PlannedProduct[];
  canonical: CanonicalProduct[];
} {
  const { pdf, legacy } = loadSources();
  const canonical = buildCanonical(pdf, legacy);
  const enrichment = JSON.parse(
    readFileSync(resolve(ARCHIVE, 'official-enrichment.json'), 'utf8'),
  ) as Enrichment[];
  const mediaFile = JSON.parse(
    readFileSync(resolve(ARCHIVE, 'media-provenance.json'), 'utf8'),
  ) as { media: MediaRecord[] };
  return {
    plan: buildPlan({
      canonical,
      enrichment,
      media: mediaFile.media,
      pdf,
      legacy,
      live: loadLive(),
    }),
    canonical,
  };
}

const invokedDirectly = process.argv[1]
  ?.replace(/\\/g, '/')
  .endsWith('plan.ts');
if (invokedDirectly) {
  const { plan, canonical } = loadPlan();

  const dupes = canonical.filter((c) => c.state === 'DUPLICATE_CONFIRMED');
  const temporaryPrice = plan.filter((p) => p.priceSource === 'temporary');
  const noMedia = plan.filter((p) => p.media.length === 0);
  const noDescription = plan.filter((p) => !p.description);
  const skus = plan.map((p) => p.sku);
  const slugs = plan.map((p) => p.slug);

  const bySource = new Map<string, number>();
  for (const p of plan)
    bySource.set(
      p.descriptionSource,
      (bySource.get(p.descriptionSource) ?? 0) + 1,
    );

  console.warn(`PDF products expected:        88`);
  console.warn(`PDF products accounted for:   ${canonical.length}`);
  console.warn(
    `Resolved products:            ${canonical.filter((c) => c.state === 'RESOLVED').length}`,
  );
  console.warn(
    `Duplicates confirmed:         ${dupes.length}${dupes.length ? ` (${dupes.map((d) => `${d.sku}→${d.duplicateOf}`).join(', ')})` : ''}`,
  );
  console.warn(`Rows to import:               ${plan.length}`);
  console.warn('');
  console.warn(
    `Duplicate SKUs:               ${skus.length - new Set(skus).size}`,
  );
  console.warn(
    `Duplicate slugs:              ${slugs.length - new Set(slugs).size}`,
  );
  console.warn(
    `Brands:                       ${new Set(plan.map((p) => p.brand)).size}`,
  );
  console.warn(
    `Categories:                   ${new Set(plan.map((p) => p.category)).size}`,
  );
  console.warn('');
  console.warn(`Products missing imagery:     ${noMedia.length}`);
  console.warn(
    `Media rows:                   ${plan.reduce((a, p) => a + p.media.length, 0)}`,
  );
  console.warn(`Products missing description: ${noDescription.length}`);
  console.warn(
    `Description sources:          ${[...bySource].map(([k, v]) => `${k} ${v}`).join(', ')}`,
  );
  console.warn('');
  console.warn(
    `Publishable (priced):         ${plan.filter((p) => p.status === 'published').length}`,
  );
  console.warn(`Temporary prices:             ${temporaryPrice.length}`);
  console.warn(
    `Total stock units:            ${plan.reduce((a, p) => a + p.stock, 0)}`,
  );

  if (process.argv.includes('--list')) {
    for (const p of plan) {
      console.warn(
        [
          p.sku.padEnd(15),
          p.status === 'published' ? 'PUB' : 'drf',
          p.brand.padEnd(15),
          p.category.padEnd(13),
          (p.variantName ?? '-').padEnd(11),
          `${p.media.length}img`,
          p.descriptionSource.padEnd(8),
          p.name.slice(0, 58),
        ].join(' | '),
      );
    }
  }
}
