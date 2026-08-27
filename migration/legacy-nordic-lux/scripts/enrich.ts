/**
 * Phase 7 — attaches official-source content to the canonical inventory.
 *
 * Reads the harvested brand catalogues (archive/official-catalogue.json) and
 * decides, per product, whether any of them is *provably* the same product.
 * Accepted matches contribute a canonical name, description, imagery and
 * ingredient/usage copy; rejected ones are reported with the reason so the
 * gap is visible instead of silently filled.
 *
 * The bar is deliberately high. A wrong photograph on a product page is worse
 * than no photograph: it misleads a customer into buying the wrong item. So a
 * candidate must clear a weighted-token threshold, beat its runner-up by a
 * margin, and agree on any strength (%/SPF) we state.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildCanonical,
  loadSources,
  productLineKey,
  type CanonicalProduct,
} from './canonical';
import {
  assignMatches,
  tokenWeights,
  type Match,
  type OfficialProduct,
} from './official';
import { MANUAL_MATCHES, MANUAL_SOURCES } from './manual-sources';

const HERE = dirname(fileURLToPath(import.meta.url));
const ARCHIVE = resolve(HERE, '../archive');

export type Enrichment = {
  sku: string;
  brand: string;
  ourName: string;
  accepted: boolean;
  reason: string;
  score: number;
  sizeAgreement: boolean | null;
  /** Set when the match is trusted for copy but not for imagery. */
  contentOnly: boolean;
  source: {
    domain: string;
    url: string;
    title: string;
    retrievedAt: string;
  } | null;
  description: string | null;
  ingredients: string | null;
  howToUse: string | null;
  images: string[];
  tags: string[];
  sizes: string[];
  runnerUp: { title: string; score: number } | null;
};

function loadOfficial(): Record<string, OfficialProduct[]> {
  const path = resolve(ARCHIVE, 'official-catalogue.json');
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8')) as Record<
    string,
    OfficialProduct[]
  >;
}

export function enrichAll(
  canonical: CanonicalProduct[],
  official: Record<string, OfficialProduct[]>,
): Enrichment[] {
  // IDF weights are per source: "cerave" is worthless inside the CeraVe
  // catalogue but "argan" is decisive inside The Ordinary's.
  const weights = new Map<string, Map<string, number>>();
  for (const [brand, list] of Object.entries(official))
    weights.set(brand, tokenWeights(list));

  // Matching is decided per brand, over that brand's whole product set at once,
  // so sibling products in a range cannot be assigned the same source page.
  const assignments = new Map<string, Match>();

  // Hand-pinned identifications are resolved first and kept out of the pool,
  // so the automatic pass cannot reassign their page to something else.
  for (const c of canonical) {
    const pin = MANUAL_MATCHES[c.sku];
    if (!pin) continue;
    const candidate = (official[c.brand] ?? []).find((o) => o.url === pin.url);
    if (!candidate) continue;
    assignments.set(c.sku, {
      sku: c.sku,
      candidate,
      score: 1,
      sizeAgreement: null,
      accepted: true,
      reason: `pinned: ${pin.evidence}`,
      runnerUp: null,
    });
  }

  const byBrand = new Map<string, CanonicalProduct[]>();
  for (const c of canonical) {
    if (MANUAL_SOURCES[c.sku] || assignments.has(c.sku)) continue;
    if (!byBrand.has(c.brand)) byBrand.set(c.brand, []);
    byBrand.get(c.brand)!.push(c);
  }
  for (const [brand, group] of byBrand) {
    const assigned = assignMatches(
      group.map((g) => ({
        sku: g.sku,
        name: g.name,
        sizeLabel: g.sizeLabel,
        lineKey: productLineKey(g.brand, g.name),
      })),
      official[brand] ?? [],
      { weights: weights.get(brand) },
    );
    for (const [sku, match] of assigned)
      if (!assignments.has(sku)) assignments.set(sku, match);
  }

  return canonical.map((c) => {
    const manual = MANUAL_SOURCES[c.sku];
    if (manual) return fromManual(c, manual);

    const match: Match = assignments.get(c.sku) ?? {
      sku: c.sku,
      candidate: null,
      score: 0,
      sizeAgreement: null,
      accepted: false,
      reason: 'no source harvested for brand',
      runnerUp: null,
    };

    const hit = match.candidate;
    // A size disagreement means we found the right product line but the wrong
    // pack. Copy is shared across packs; photography is not, because the
    // bottle in the shot is the wrong size.
    const contentOnly = match.accepted && match.sizeAgreement === false;

    return {
      sku: c.sku,
      brand: c.brand,
      ourName: c.name,
      accepted: match.accepted,
      reason: match.reason,
      score: match.score,
      sizeAgreement: match.sizeAgreement,
      contentOnly,
      source:
        match.accepted && hit
          ? {
              domain: hit.sourceDomain,
              url: hit.url,
              title: hit.title,
              retrievedAt: hit.retrievedAt,
            }
          : null,
      description:
        match.accepted && hit ? cleanDescription(hit.description) : null,
      ingredients: match.accepted && hit ? hit.ingredients : null,
      howToUse: match.accepted && hit ? hit.howToUse : null,
      images:
        match.accepted && hit && !contentOnly ? hit.images.slice(0, 4) : [],
      tags: match.accepted && hit ? hit.tags : [],
      sizes: hit?.sizes ?? [],
      runnerUp: match.runnerUp,
    };
  });
}

function fromManual(
  c: CanonicalProduct,
  m: (typeof MANUAL_SOURCES)[string],
): Enrichment {
  return {
    sku: c.sku,
    brand: c.brand,
    ourName: c.name,
    accepted: true,
    reason: 'manually verified official page',
    score: 1,
    sizeAgreement: null,
    contentOnly: false,
    source: {
      domain: new URL(m.url).hostname,
      url: m.url,
      title: m.title,
      retrievedAt: m.retrievedAt,
    },
    description: m.description ?? null,
    ingredients: m.ingredients ?? null,
    howToUse: m.howToUse ?? null,
    images: m.images ?? [],
    tags: [],
    sizes: m.size ? [m.size] : [],
    runnerUp: null,
  };
}

/**
 * Storefront copy, not a scraped page dump: drops nav/marketing furniture and
 * caps the length so a PDP paragraph stays readable.
 */
export function cleanDescription(raw: string | null): string | null {
  if (!raw) return null;
  const text = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length > 0 &&
        !/^(shop|home|menu|search|cart|sign in|newsletter|subscribe|free shipping|add to (bag|cart))/i.test(
          l,
        ) &&
        !/^\d+\s*(reviews?|stars?)$/i.test(l),
    )
    .join('\n')
    .trim()
    // Brand meta-descriptions often close with a call to action aimed at the
    // brand's own store ("Shop now", "Buy now"). It is not product
    // information and it points a Nordic Lux customer somewhere else.
    .replace(
      /[\s.,!-]*\b(shop|buy|discover|order|learn more)\s*(now|more|today|here)?\s*[.!]?$/i,
      '',
    )
    .trim();
  // Floor is deliberately low. Some brands publish a genuine one-line
  // positioning statement as their entire description — The Ordinary's Rose
  // Hip Seed Oil is simply "A solution for supple skin." That is real,
  // attributable brand copy, and keeping it beats leaving the field empty. The
  // floor only exists to reject stray fragments.
  if (text.length < 20) return null;
  return text.length > 2000
    ? `${text.slice(0, 2000).replace(/\s+\S*$/, '')}…`
    : text;
}

const invokedDirectly = process.argv[1]
  ?.replace(/\\/g, '/')
  .endsWith('enrich.ts');
if (invokedDirectly) {
  const { pdf, legacy } = loadSources();
  const canonical = buildCanonical(pdf, legacy);
  const official = loadOfficial();
  const enrichment = enrichAll(canonical, official);

  writeFileSync(
    resolve(ARCHIVE, 'official-enrichment.json'),
    JSON.stringify(enrichment, null, 2),
  );

  const accepted = enrichment.filter((e) => e.accepted);
  const withImages = enrichment.filter((e) => e.images.length > 0);
  const byBrand = new Map<string, { total: number; ok: number }>();
  for (const e of enrichment) {
    const row = byBrand.get(e.brand) ?? { total: 0, ok: 0 };
    row.total++;
    if (e.accepted) row.ok++;
    byBrand.set(e.brand, row);
  }

  console.warn(`enriched: ${accepted.length}/${enrichment.length}`);
  console.warn(`with official images: ${withImages.length}`);
  console.warn(
    `content-only (size differs): ${enrichment.filter((e) => e.contentOnly).length}\n`,
  );
  for (const [brand, r] of [...byBrand].sort(
    (a, b) => b[1].total - a[1].total,
  )) {
    console.warn(
      `  ${brand.padEnd(16)} ${String(r.ok).padStart(2)}/${r.total}`,
    );
  }

  if (process.argv.includes('--unresolved')) {
    console.warn('\n--- unresolved ---');
    for (const e of enrichment.filter((x) => !x.accepted)) {
      console.warn(
        `  ${e.sku}  ${e.ourName.slice(0, 58).padEnd(59)} ${e.reason}`,
      );
    }
  }
}
