/**
 * Canonical inventory builder — Phases 4, 8 and the identity half of 6/7.
 *
 * Reconciles the two sources into one inventory keyed by the PDF SKU:
 *
 *   archive/pdf-products.json      88 rows. Nordic Lux's own inventory export:
 *                                  authoritative for SKU, stock and *which
 *                                  products exist*. Names are messy, prices are
 *                                  a repeated $19.99 default, descriptions are
 *                                  truncated mid-word, ratings are all 5 stars.
 *   archive/legacy-products.json   33 rows from the old website. No SKU overlap
 *                                  (its SKUs were slug-derived and synthetic),
 *                                  but it carries genuine long-form copy,
 *                                  ingredients, benefits and usage for the
 *                                  products it does cover.
 *
 * So: PDF decides identity and inventory, legacy enriches content, and neither
 * decides price. Everything here is deterministic and unit-tested; the only
 * hand-authored inputs are the small override tables below, which exist because
 * the source data is genuinely ambiguous rather than merely irregular.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PdfProduct } from './pdf-extract';

const HERE = dirname(fileURLToPath(import.meta.url));
const ARCHIVE = resolve(HERE, '../archive');

/* ==========================================================================
   Brands
   ========================================================================== */

/**
 * The PDF prints 12 all-caps section banners, but a banner is a *section*, not
 * a brand: "MADAGASCAR CENTELLA" and "CENTELLA" are both the SKIN1004
 * Madagascar Centella range, and "OTHER" is a single Purito product. Brand is
 * therefore resolved from the product identity, with the banner only as a
 * fallback.
 */
export const BRAND_CANON: Record<string, string> = {
  cosrx: 'COSRX',
  cerave: 'CeraVe',
  cetaphil: 'Cetaphil',
  eucerin: 'Eucerin',
  ferrerorocher: 'Ferrero Rocher',
  garnier: 'Garnier',
  larocheposay: 'La Roche-Posay',
  theordinary: 'The Ordinary',
  ordinary: 'The Ordinary',
  skin1004: 'SKIN1004',
  madagascarcentella: 'SKIN1004',
  centella: 'SKIN1004',
  purito: 'Purito',
  revuele: 'Revuele',
  other: 'Purito',
};

/** Name-prefix evidence wins over the section banner. */
const BRAND_FROM_NAME: [RegExp, string][] = [
  [/^cosrx\b/i, 'COSRX'],
  [/^cerave\b/i, 'CeraVe'],
  [/^np cerave\b/i, 'CeraVe'],
  [/^cetaphil\b/i, 'Cetaphil'],
  [/^eucerin\b/i, 'Eucerin'],
  [/^garnier\b/i, 'Garnier'],
  [/^la roche[- ]?posay\b/i, 'La Roche-Posay'],
  [/^the ordinary\b/i, 'The Ordinary'],
  [/^skin1004\b/i, 'SKIN1004'],
  [/^madaga[sk]kar centella\b/i, 'SKIN1004'],
  [/^madagascar centella\b/i, 'SKIN1004'],
  [/^centella tea-?\s?trica\b/i, 'SKIN1004'],
  [/^purito\b/i, 'Purito'],
  [/^revuele\b/i, 'Revuele'],
  [/^fine hazelnut chocolates\b/i, 'Ferrero Rocher'],
];

export function brandKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function resolveBrand(name: string, section: string | null): string {
  for (const [re, brand] of BRAND_FROM_NAME)
    if (re.test(name.trim())) return brand;
  const fromSection = section ? BRAND_CANON[brandKey(section)] : undefined;
  return fromSection ?? 'Nordic Lux';
}

/* ==========================================================================
   Name cleaning
   ========================================================================== */

/**
 * Batch/expiry/listing noise. This is inventory-line text that a marketplace
 * seller appends to a listing title; it is not part of the product's name and
 * must never be baked into a permanent catalogue title.
 */
const LISTING_NOISE: RegExp[] = [
  /\bexp(?:iry)?\.?\s*:?\s*\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/gi,
  /\bexp(?:iry)?\.?\s*:?\s*\d{1,2}[-/.]\d{2,4}\b/gi,
  /\bnew\s+exp\s*[\d\-/.]+/gi,
  /\bsealed\s+nib\b/gi,
  /\bbrand\s+new\b/gi,
  /\bnib\b/g,
  /\bsealed\b/gi,
  /\btravel size\b/gi,
  /^\s*np\s+/i,
];

/** Source typos, corrected only where the intended product is unambiguous. */
export const NAME_FIXES: [RegExp, string][] = [
  [/\bMoistursing\b/gi, 'Moisturising'],
  [/\bMadagaskar\b/gi, 'Madagascar'],
  [/\bHari Food\b/gi, 'Hair Food'],
  [/\bAloevera\b/gi, 'Aloe Vera'],
  [/\bAloe vera\b/g, 'Aloe Vera'],
  [/\bGel-Crem\b/gi, 'Gel-Cream'],
  [/\bAdvance Repair\b/gi, 'Advanced Repair'],
  [/\bClean To-Foam-Cleanser\b/gi, 'Hydrating Cream-to-Foam Cleanser'],
  [/\bfor rmal to Dry Skin\b/gi, 'for Normal to Dry Skin'],
  [/\bTea-Trica\b/gi, 'Tea-Trica'],
  [/\bTea - Trica\b/gi, 'Tea-Trica'],
  [/\bRelife\b/gi, 'Relief'],
  [/\bHyalu - Cica\b/gi, 'Hyalu-Cica'],
  [/\bCold - Pressed\b/gi, 'Cold-Pressed'],
  [/\bDuo\+M\b/gi, 'Duo+ M'],
  [/\bUVmune\b/gi, 'UVMune'],
  [/\bUVMUNE\b/g, 'UVMune'],
  [/\bSkinActive\b/gi, 'SkinActive'],
  [/\bMoisturising\b/g, 'Moisturising'],
];

/** Marketplace listings tack a benefit clause onto the title after a comma. */
const TRAILING_BLURB =
  /,\s*(?:advanced |brightens?|targets?|hydrating|depuffing|brightening|gentle|lightweight|multi-depth|rich |smoothing|acne-fighting|intermediate|nourishing|soothing|for lips|supports|hydrating makeup|helps).*$/i;

const SIZE_TAIL = /\b\d[\d.]*\s*(?:ml|g|oz|fl\.?\s?oz|kg)\b/gi;

/**
 * Turns a marketplace listing title into a catalogue product name.
 *
 * These titles are written for search, not for a shelf: "Madagascar Centella
 * Ampoule Foam 4.22 fl.oz, 125ml, Low pH Foam Cleanser, Natural Soda Powder
 * Coconut Surfactant and EWG Green Grade". Everything from the pack size
 * onwards is keyword padding, and the size itself belongs on the variant, so
 * the name is cut there.
 */
export function cleanName(raw: string, brand: string): string {
  let s = ` ${raw} `;
  for (const re of LISTING_NOISE) s = s.replace(re, ' ');
  for (const [re, to] of NAME_FIXES) s = s.replace(re, to);

  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(TRAILING_BLURB, '');
  s = s.replace(/\s*\|\s*.*$/, '');

  // Cut at the pack size. Guarded so a name that is *only* a size survives,
  // and so strength markers ("SPF50", "UVMune 400") are never mistaken for one.
  const sizeAt = s.search(SIZE_TAIL);
  if (sizeAt > 12) s = s.slice(0, sizeAt);

  // Whatever trails a comma after that cut is descriptive padding.
  s = s.replace(/,[^,]*$/, (m) => (/\d/.test(m) ? '' : m));
  // Pack-count tails: "- 1pack (5pcs)".
  s = s.replace(/\s*[-–]\s*\d+\s*pack.*$/i, '');
  // An opening bracket left with nothing after it, once its contents were cut.
  s = s.replace(/[([{]\s*$/, '');
  s = s.replace(/[,\s|·\-–]+$/, '').trim();
  s = s.replace(/\s+(?:and|with|for|in)$/i, '').trim();
  // A comma directly after the range name, from "Madagascar Centella, Poremizing…".
  s = s.replace(/,\s+/g, ' ');

  if (isShouting(s)) s = titleCase(s);
  // Individual shouted words inside an otherwise normal title ("ANTHELIOS").
  s = s.replace(/\b[A-Z]{4,}\b/g, (word) =>
    KEEP_UPPER.test(word) ? word : titleCase(word),
  );
  // Range names the source types inconsistently ("Hair food Shampoo").
  s = s.replace(/\bHair food\b/g, 'Hair Food');

  // Ensure the brand appears exactly once, at the front.
  const bare = stripLeadingBrand(s, brand);
  return `${brand} ${bare}`.replace(/\s+/g, ' ').trim();
}

/** True for listings typed in caps lock, e.g. "VITAMIN C SUSPENSION 23%". */
function isShouting(s: string): boolean {
  const letters = s.replace(/[^A-Za-z]/g, '');
  if (letters.length < 8) return false;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return upper / letters.length > 0.7;
}

/** Words that stay lower-case inside a title, and initialisms that stay up. */
const MINOR_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
]);
const KEEP_UPPER =
  /^(?:SPF\d*|UV|AHA|BHA|PHA|HA|EGCG|NMF|SA|B5|EWG|PDRN|LED|UK|USA)$/i;

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/(\s+)/)
    .map((word, i) => {
      if (!word.trim()) return word;
      const original = s.split(/\s+/)[Math.floor(i / 2)] ?? '';
      if (KEEP_UPPER.test(word)) return word.toUpperCase();
      if (/\d/.test(word)) return original;
      if (i > 0 && MINOR_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join('');
}

export function stripLeadingBrand(name: string, brand: string): string {
  // "Madagascar Centella" is SKIN1004's product *line*, not a brand alias, so
  // it stays in the name — it is how the range is sold and searched.
  const variants = [
    brand,
    brand.replace(/-/g, ' '),
    brand.replace(/^The /, ''),
    ...(brand === 'La Roche-Posay' ? ['La Roche Posay'] : []),
  ];
  let out = name.trim();
  // Repeat: "CeraVe CeraVe Foaming" and "The Ordinary Ordinary" both occur.
  for (let pass = 0; pass < 3; pass++) {
    const before = out;
    for (const v of variants) {
      const re = new RegExp(
        `^${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s:,-]+`,
        'i',
      );
      out = out.replace(re, '').trim();
    }
    if (out === before) break;
  }
  return out || name.trim();
}

/* ==========================================================================
   Size / variant
   ========================================================================== */

export type Size = { label: string | null; volumeMl: number | null };

const ML_PER_FL_OZ = 29.5735;

/**
 * Pulls the pack size out of a listing title. Prefers an explicit millilitre or
 * gram figure; converts fl oz only when no metric figure is printed.
 */
export function parseSize(raw: string): Size {
  const text = raw.replace(/\s+/g, ' ');

  const ml = text.match(/(\d[\d.]*)\s*ml\b/i);
  if (ml) return { label: `${trimNum(ml[1]!)}ml`, volumeMl: Number(ml[1]) };

  const g = text.match(/(\d[\d.]*)\s*g\b(?!\/)/i);
  if (g) return { label: `${trimNum(g[1]!)}g`, volumeMl: null };

  const floz = text.match(/(\d[\d.]*)\s*fl\.?\s?oz\b/i);
  if (floz)
    return {
      label: `${trimNum(floz[1]!)} fl oz`,
      volumeMl: round1(Number(floz[1]) * ML_PER_FL_OZ),
    };

  const oz = text.match(/(\d[\d.]*)\s*oz\b/i);
  if (oz) return { label: `${trimNum(oz[1]!)}oz`, volumeMl: null };

  const pack = text.match(/\((\d+)\s*pcs?\)/i);
  if (pack) return { label: `${pack[1]} pcs`, volumeMl: null };

  return { label: null, volumeMl: null };
}

const trimNum = (s: string) => String(Number(s));
const round1 = (n: number) => Math.round(n * 10) / 10;

/* ==========================================================================
   Category
   ========================================================================== */

/**
 * The PDF files 87 of 88 products under the single label "Skin Care", which
 * carries no shelf information. Category is therefore derived from the product
 * identity, most specific rule first.
 */
const CATEGORY_RULES: [RegExp, string][] = [
  [/\bchocolate|gift box\b/i, 'Sets & Kits'],
  [/\bset\b|\bkit\b/i, 'Sets & Kits'],
  [/\bshampoo\b/i, 'Hair Care'],
  [/\bconditioner\b/i, 'Hair Care'],
  [/\bhair food\b|\bfor hair density\b|\bhair mask\b/i, 'Hair Care'],
  [
    /\bsun ?stick\b|\bspf\b|\bsunscreen\b|\bsun lotion\b|\buvmune\b|\banthelios\b|\bsuper uv\b/i,
    'Sunscreen',
  ],
  [/\bbody lotion\b|\bhand cream\b|\bbody serum\b|\bbody wash\b/i, 'Body Care'],
  [/\bointment\b/i, 'Body Care'],
  [/\blip balm\b/i, 'Lip Care'],
  [/\beye (?:repair )?cream\b|\beye serum\b|\bfor dark circles\b/i, 'Eye Care'],
  [/\bmask\b|\bpatch\b/i, 'Masks'],
  [/\btoner\b/i, 'Toners'],
  [
    /\bcleanser\b|\bcleansing (?:oil|foam)\b|\bface wash\b|\bmicellar water\b|\bcleansing\b|\bampoule foam\b/i,
    'Cleansers',
  ],
  [
    /\bserum\b|\bampoule\b|\bessence\b|\bsolution\b|\bsuspension\b|\bpeeling\b|\bpowder\b|\boil\b/i,
    'Serums',
  ],
  [
    /\bmoisturi[sz]|cream\b|\blotion\b|\bgel-?cream\b|\bfluid\b/i,
    'Moisturizers',
  ],
  [/\btreatment\b|\bgel\b/i, 'Treatments'],
];

export function resolveCategory(name: string): string {
  for (const [re, cat] of CATEGORY_RULES) if (re.test(name)) return cat;
  // The Ordinary names most of its range as "<active> <strength>" with no
  // format word at all — "Niacinamide 10% + Zinc 1%", "Retinol 0.5% in
  // Squalane". Those are serums, and shelving them under a generic bucket
  // would hide them from the Serums category page.
  if (/\d+(?:\.\d+)?%/.test(name)) return 'Serums';
  return 'Skincare';
}

/* ==========================================================================
   Routine step / skin types — derived from the same identity evidence
   ========================================================================== */

const ROUTINE_BY_CATEGORY: Record<string, string> = {
  Cleansers: 'cleanse',
  Toners: 'tone',
  Serums: 'treat',
  Treatments: 'treat',
  Moisturizers: 'moisturise',
  Sunscreen: 'protect',
  'Eye Care': 'treat',
  Masks: 'mask',
  'Body Care': 'body',
  'Hair Care': 'hair',
  'Lip Care': 'moisturise',
  'Sets & Kits': 'treat',
};

export function resolveRoutineStep(category: string): string | null {
  return ROUTINE_BY_CATEGORY[category] ?? null;
}

/* ==========================================================================
   Identity key + matching
   ========================================================================== */

/** Words that carry no identity, so two listings of one product still match. */
const STOPWORDS = new Set([
  'the',
  'for',
  'with',
  'and',
  'a',
  'of',
  'in',
  'to',
  'skin',
  'face',
  'facial',
  'new',
  'size',
  'oz',
  'ml',
  'fl',
  'g',
  'pack',
  'pcs',
  'travel',
]);

/**
 * A bag-of-words identity key: brand + the significant tokens of the name,
 * sorted. Order and punctuation differences ("Cerave Facial Moisturising
 * Lotion Am Spf50 52ml" vs "AM Facial Moisturising Lotion SPF 50") collapse to
 * the same key, which is what makes duplicate detection reliable.
 */
export function identityKey(brand: string, name: string, size: Size): string {
  const bare = stripLeadingBrand(name, brand)
    .toLowerCase()
    // "SPF 50" and "Spf50" are the same claim written two ways; joining them
    // keeps one product from looking like two.
    .replace(/\bspf\s+(\d+)/g, 'spf$1')
    .replace(/[^a-z0-9%+ ]/g, ' ')
    .split(/\s+/)
    .filter(
      (w) =>
        w &&
        !STOPWORDS.has(w) &&
        !/^\d+$/.test(w) &&
        // Size tokens ("50ml", "6oz", "5pcs") must not reach the line key, or
        // two packs of one product stop looking like one product.
        !/^\d+(?:\.\d+)?(?:ml|g|kg|oz|pcs|pc)$/.test(w),
    )
    .sort();
  return `${brandKey(brand)}|${[...new Set(bare)].join('-')}|${size.label ?? ''}`;
}

/** Looser key ignoring size, for spotting same-product-different-pack rows. */
export function productLineKey(brand: string, name: string): string {
  return identityKey(brand, name, { label: null, volumeMl: null });
}

/* ==========================================================================
   Types
   ========================================================================== */

/**
 * Legacy row -> PDF SKU, established by hand.
 *
 * The two catalogues share no SKU (the legacy site's were slug-derived and
 * synthetic), and the listing titles differ enough that a similarity score
 * cannot separate real matches from near misses safely: "SA Smoothing
 * Cleanser" and "SA Smoothing Cream" differ by one word and are different
 * products, while "Renewing Salicylic Acid Cleanser" and "SA Smoothing
 * Cleanser" are two names for one product. That is precisely the case the
 * brief says never to resolve automatically, so it is resolved explicitly.
 *
 * One legacy row may enrich several PDF SKUs when they are the same product in
 * different pack sizes — the copy, ingredients and usage are shared; only the
 * size differs, and the size comes from the PDF.
 *
 * Legacy rows with no entry here have no counterpart in the current catalogue
 * and are intentionally not imported.
 */
export const LEGACY_LINKS: Record<string, string[]> = {
  'TO-NIACINAMIDE-30': ['SK80CT0084'],
  'TO-NIACINAMIDE-POWDER': ['SK80CT0100'],
  'TO-CAFFEINE-30': ['SK80CT0089'],
  'TO-HA-B5-CERAMIDES-30': ['SK80CT0086'],
  'TO-GLYCOLIC-TONER-240': ['SK80CT0087'],
  'TO-NMF-HA-30': ['SK80CT0088'],
  'TO-NMF-PHYTOCERAMIDES-100': ['SK80CT0091'],
  'TO-NMF-BETAGLUCAN-100': ['SK80CT0093'],
  'TO-SQUALANE-CLEANSER-50': ['SK80CT0090'],
  'TO-SQUALANE-LIP-BALM-15': ['SK80CT0092'],
  'TO-AHA-BHA-PEEL-30': ['SK80CT0094'],
  'TO-RETINOL-05-30': ['SK80CT0097'],
  'TO-UV-SPF45-30': ['SK80CT0085'],

  // CeraVe Moisturising Cream is stocked in two pack sizes; the legacy row is
  // the 454g tub and covers both.
  'CV-MOISTURIZING-CREAM-454': ['SK80CT0138', 'SK80CT0136'],
  'CV-MOISTURIZING-LOTION-236': ['SK80CT0137'],
  // Both PDF rows are the AM SPF50 facial lotion; see DUPLICATE_OF below.
  'CV-FACIAL-LOTION-AM-SPF50-52': ['SK80CT0135', 'SK80CT0120'],
  'CV-EYE-REPAIR-CREAM-14': ['SK80CT0134'],
  'CV-ADVANCED-REPAIR-OINTMENT-85': ['SK80CT0132'],
  'CV-CREAM-TO-FOAM-CLEANSER-236': ['SK80CT0131'],
  'CV-FOAMING-CLEANSER-236': ['SK80CT0130'],
  'CV-HYDRATING-CLEANSER-236': ['SK80CT0127'],
  'CV-FOAMING-OIL-CLEANSER-236': ['SK80CT0128'],
  'CV-BLEMISH-CONTROL-CLEANSER-236': ['SK80CT0126'],
  // CeraVe sells one salicylic-acid cleanser under both names by market.
  'CV-SA-SMOOTHING-CLEANSER-236': ['SK80CT0125'],
  'CV-SA-SMOOTHING-CREAM-177': ['SK80CT0124'],
};

/**
 * PDF rows that are the same product listed twice. The value is the SKU kept
 * as the public listing; the key is folded into it.
 *
 * SK80CT0120 ("AM Facial Moisturising Lotion SPF 50", no size printed) and
 * SK80CT0135 ("Cerave Facial Moisturising Lotion Am Spf50 52ml") carry
 * identical blurbs in the PDF and match the single 52ml legacy product. The
 * sized row is kept; the unsized row's stock is merged into it so no inventory
 * is lost, and the folded SKU stays recorded for traceability.
 */
export const DUPLICATE_OF: Record<string, string> = {
  SK80CT0120: 'SK80CT0135',
};

export type LegacyProduct = {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  type: string;
  price: number;
  stock: number;
  image: string;
  rating: number;
  reviews: number;
  country: string;
  description: string;
  overview: string;
  ingredients: { name: string; percentage?: string; description: string }[];
  benefits: string[];
  howToUse: string[] | string;
  specificationTags: string[];
};

export type ResolutionState =
  'RESOLVED' | 'DUPLICATE_CONFIRMED' | 'BUSINESS_DATA_REQUIRED';

export type CanonicalProduct = {
  /** Nordic Lux inventory SKU from the PDF — the traceability key. */
  sku: string;
  state: ResolutionState;
  /** SKU this row duplicates, when state is DUPLICATE_CONFIRMED. */
  duplicateOf: string | null;

  name: string;
  brand: string;
  category: string;
  routineStep: string | null;
  sizeLabel: string | null;
  volumeMl: number | null;

  /** Nordic Lux's own stock count, from the inventory export. */
  stock: number | null;

  /** Never trusted from the PDF; filled only from an authoritative source. */
  priceMinor: number | null;
  priceSource: 'legacy-website' | 'pdf-default' | 'none';
  /** Verbatim price text the PDF printed, kept for the client confirmation list. */
  pdfPriceText: string | null;

  excerpt: string | null;
  description: string | null;
  benefits: string[];
  howToUse: string | null;
  ingredients: {
    name: string;
    concentration: string | null;
    description: string;
  }[];
  suitableSkinTypes: string[];
  concerns: string[];

  /** Image recovered from the PDF's own embedded photography. */
  pdfImage: string | null;
  /** Image path inherited from the legacy repo, when identity matched. */
  legacyImage: string | null;

  provenance: {
    pdfPage: number;
    pdfSection: string | null;
    pdfName: string;
    legacySku: string | null;
    matchMethod: 'curated-link' | 'none';
  };
};

/* ==========================================================================
   Legacy content mapping (reused from the first migration)
   ========================================================================== */

const SKIN_TYPE_MAP: Record<string, string> = {
  'all skin types': 'all',
  'dry skin': 'dry',
  'oily skin': 'oily',
  'normal skin': 'normal',
  'combination skin': 'combination',
  'sensitive skin': 'sensitive',
};

const CONCERN_MAP: Record<string, string[]> = {
  'dry skin': ['dryness'],
  hydration: ['dehydration'],
  'dehydrated skin': ['dehydration'],
  'sensitive skin': ['sensitivity'],
  eczema: ['sensitivity'],
  soothing: ['sensitivity'],
  redness: ['redness'],
  'acne-prone': ['blemishes'],
  'blemish control': ['blemishes'],
  brightening: ['dullness', 'uneven-tone'],
  'anti-aging': ['firmness'],
  'fine lines': ['firmness'],
  'barrier repair': ['barrier-support'],
};

function mapTags(tags: string[] | undefined) {
  const skin = new Set<string>();
  const concerns = new Set<string>();
  for (const tag of tags ?? []) {
    const key = tag.toLowerCase().trim();
    if (SKIN_TYPE_MAP[key]) skin.add(SKIN_TYPE_MAP[key]);
    for (const c of CONCERN_MAP[key] ?? []) concerns.add(c);
  }
  return { suitableSkinTypes: [...skin], concerns: [...concerns] };
}

/* ==========================================================================
   Build
   ========================================================================== */

export function buildCanonical(
  pdf: PdfProduct[],
  legacy: LegacyProduct[],
): CanonicalProduct[] {
  // The curated table is the only source of legacy links; similarity scoring
  // was not trustworthy enough here (see LEGACY_LINKS).
  const legacyBySku = new Map(legacy.map((l) => [l.sku, l]));
  const legacyForPdfSku = new Map<string, LegacyProduct>();
  for (const [legacySku, pdfSkus] of Object.entries(LEGACY_LINKS)) {
    const row = legacyBySku.get(legacySku);
    if (!row) continue;
    for (const pdfSku of pdfSkus) legacyForPdfSku.set(pdfSku, row);
  }

  // Stock from rows folded into a primary is added to that primary, so merging
  // a duplicate listing never loses inventory.
  const foldedStock = new Map<string, number>();
  for (const p of pdf) {
    const primary = DUPLICATE_OF[p.sku ?? ''];
    if (primary)
      foldedStock.set(
        primary,
        (foldedStock.get(primary) ?? 0) + (p.stock ?? 0),
      );
  }

  const out: CanonicalProduct[] = [];

  for (const p of pdf) {
    const brand = resolveBrand(p.name, p.brandSection);
    const name = cleanName(p.name, brand);
    const size = parseSize(p.name);
    const category = resolveCategory(name);

    const match = legacyForPdfSku.get(p.sku!);
    const matchMethod: CanonicalProduct['provenance']['matchMethod'] = match
      ? 'curated-link'
      : 'none';
    const duplicateOf = DUPLICATE_OF[p.sku!] ?? null;
    const tags = mapTags(match?.specificationTags);

    out.push({
      sku: p.sku!,
      state: duplicateOf ? 'DUPLICATE_CONFIRMED' : 'RESOLVED',
      duplicateOf,

      name,
      brand,
      category,
      routineStep: resolveRoutineStep(category),
      sizeLabel: size.label,
      volumeMl: size.volumeMl,

      // A folded duplicate contributes its stock to the row that is kept.
      stock:
        p.stock === null && !foldedStock.has(p.sku!)
          ? null
          : (p.stock ?? 0) + (foldedStock.get(p.sku!) ?? 0),

      // Price is deliberately left unset here. The PDF's $19.99 is a default
      // repeated across 87 of 88 rows and carries no commercial authority;
      // legacy prices are the old website's and are attached separately only
      // where a same-product match exists.
      priceMinor: null,
      priceSource: 'none',
      pdfPriceText: p.priceText,

      excerpt: match?.description ?? null,
      description: match?.overview ?? null,
      benefits: match?.benefits ?? [],
      howToUse: joinHowToUse(match),
      ingredients: (match?.ingredients ?? []).map((i) => ({
        name: i.name,
        concentration: i.percentage ?? null,
        description: i.description,
      })),
      suitableSkinTypes: tags.suitableSkinTypes,
      concerns: tags.concerns,

      pdfImage: p.image,
      legacyImage: match?.image ?? null,

      provenance: {
        pdfPage: p.page,
        pdfSection: p.brandSection,
        pdfName: p.name,
        legacySku: match?.sku ?? null,
        matchMethod,
      },
    });
  }

  return out;
}

function joinHowToUse(match: LegacyProduct | undefined): string | null {
  if (!match?.howToUse) return null;
  return Array.isArray(match.howToUse)
    ? match.howToUse.join('\n')
    : match.howToUse;
}

/* ==========================================================================
   CLI
   ========================================================================== */

export function loadSources() {
  const pdf = JSON.parse(
    readFileSync(resolve(ARCHIVE, 'pdf-products.json'), 'utf8'),
  ) as PdfProduct[];
  const legacyFile = JSON.parse(
    readFileSync(resolve(ARCHIVE, 'legacy-products.json'), 'utf8'),
  ) as {
    products: LegacyProduct[];
  };
  return { pdf, legacy: legacyFile.products };
}

const invokedDirectly = process.argv[1]
  ?.replace(/\\/g, '/')
  .endsWith('canonical.ts');
if (invokedDirectly) {
  const { pdf, legacy } = loadSources();
  const canonical = buildCanonical(pdf, legacy);

  const byBrand = new Map<string, number>();
  const byCategory = new Map<string, number>();
  for (const c of canonical) {
    byBrand.set(c.brand, (byBrand.get(c.brand) ?? 0) + 1);
    byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + 1);
  }

  const matched = canonical.filter((c) => c.provenance.matchMethod !== 'none');
  const dupes = canonical.filter((c) => c.state === 'DUPLICATE_CONFIRMED');
  const noImage = canonical.filter((c) => !c.pdfImage && !c.legacyImage);

  console.warn(`canonical products: ${canonical.length}`);
  console.warn(`legacy content matched: ${matched.length} via curated links`);
  console.warn(
    `duplicate identities: ${dupes.length}${dupes.length ? ` -> ${dupes.map((d) => `${d.sku}~${d.duplicateOf}`).join(', ')}` : ''}`,
  );
  console.warn(
    `legacy rows unused: ${legacy.length - new Set(matched.map((m) => m.provenance.legacySku)).size}`,
  );
  console.warn(`\nbrands (${byBrand.size}):`);
  for (const [b, n] of [...byBrand].sort((a, b2) => b2[1] - a[1]))
    console.warn(`  ${b.padEnd(18)} ${n}`);
  console.warn(`\ncategories (${byCategory.size}):`);
  for (const [c, n] of [...byCategory].sort((a, b2) => b2[1] - a[1]))
    console.warn(`  ${c.padEnd(18)} ${n}`);
  console.warn(
    `\nimages: pdf ${canonical.filter((c) => c.pdfImage).length}, legacy ${canonical.filter((c) => !c.pdfImage && c.legacyImage).length}, MISSING ${noImage.length}`,
  );
  console.warn(
    `content: description ${canonical.filter((c) => c.description).length}/88, benefits ${canonical.filter((c) => c.benefits.length).length}/88`,
  );

  if (process.argv.includes('--list')) {
    for (const c of canonical) {
      console.warn(
        [
          c.sku.padEnd(15),
          c.state === 'RESOLVED' ? '   ' : 'DUP',
          c.brand.padEnd(15),
          c.category.padEnd(13),
          (c.sizeLabel ?? '-').padEnd(10),
          c.pdfImage ? 'pdf' : c.legacyImage ? 'leg' : 'NO-IMG',
          c.description ? 'desc' : '----',
          c.name,
        ].join(' | '),
      );
    }
  }
}
