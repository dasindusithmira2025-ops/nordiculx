import type { LegacyProduct } from './extract';
import type { RoutineStep, SkinType } from '@/lib/db/schema';

/**
 * The one and only place legacy records are turned into new-schema records.
 *
 * Every function here is pure and deterministic: same legacy input, same
 * output, no clock, no network, no database. That is what makes the importer
 * idempotent, the dry run truthful, and the whole mapping testable
 * (see tests/unit/legacy-migration.test.ts).
 *
 * Nothing in this file invents a fact. Where the legacy data does not contain
 * something, the target field is left empty and the gap is reported.
 */

/* --- normalisation -------------------------------------------------------- */

/**
 * Identity key for matching a name that may differ only in case, spacing or
 * punctuation. "La Roche Posay", "La Roche-Posay" and "LA ROCHE-POSAY" all
 * collapse to `larocheposay`, so a brand can never fork into duplicates.
 */
export function normaliseKey(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/%/g, ' percent ')
    .replace(/\+/g, ' plus ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Legacy names repeat the brand ("The Ordinary Niacinamide 10% + Zinc 1%")
 * because the legacy card had no separate brand line. The new PDP renders the
 * brand in its own field, so the prefix is stripped rather than shown twice.
 * The untouched original stays in the archive and in the SEO title.
 */
export function stripBrandPrefix(name: string, brand: string | undefined) {
  if (!brand) return name;
  const stripped = name.slice(brand.length).replace(/^[\s\-–—:]+/, '');
  return name.toLowerCase().startsWith(brand.toLowerCase()) && stripped
    ? stripped
    : name;
}

/** Decimal currency amount → integer minor units. Half-up, applied once. */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Millilitres, but only when the label says exactly one volume. A multi-size
 * label ("236ml / 473ml") or a weight ("454g") yields null rather than a
 * guess — the unit price is better absent than wrong.
 */
export function parseVolumeMl(type: string | undefined): number | null {
  if (!type) return null;
  const m = /^\s*([\d.]+)\s*ml\s*$/i.exec(type);
  const value = m ? Number(m[1]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** True when the size label packs several sizes into one legacy record. */
export function isMultiSizeLabel(type: string | undefined): boolean {
  return Boolean(type && type.includes('/'));
}

/* --- taxonomy ------------------------------------------------------------- */

/** Legacy category → target category slug. Slugs marked `create` do not exist yet. */
export const CATEGORY_MAP: Record<
  string,
  { slug: string; name: string; parent: string | null; create: boolean }
> = {
  Serums: { slug: 'serums', name: 'Serums', parent: 'skincare', create: false },
  Moisturizers: {
    slug: 'moisturisers',
    name: 'Moisturisers',
    parent: 'skincare',
    create: false,
  },
  Cleansers: {
    slug: 'cleansers',
    name: 'Cleansers',
    parent: 'skincare',
    create: false,
  },
  Sunscreen: {
    slug: 'sun-care',
    name: 'Sun Care',
    parent: 'skincare',
    create: false,
  },
  'Body Care': {
    slug: 'body-care',
    name: 'Body Care',
    parent: 'body',
    create: false,
  },
  'Hair Care': {
    slug: 'hair-treatments',
    name: 'Hair Treatments',
    parent: 'hair',
    create: false,
  },
  Treatments: {
    slug: 'treatments',
    name: 'Treatments',
    parent: 'skincare',
    create: true,
  },
  'Eye Care': {
    slug: 'eye-care',
    name: 'Eye Care',
    parent: 'skincare',
    create: true,
  },
  Toners: { slug: 'toners', name: 'Toners', parent: 'skincare', create: true },
  'Lip Care': {
    slug: 'lip-care',
    name: 'Lip Care',
    parent: 'skincare',
    create: true,
  },
  'Sets & Kits': {
    slug: 'sets-kits',
    name: 'Sets & Kits',
    parent: null,
    create: true,
  },
};

const ROUTINE_STEP_BY_CATEGORY: Record<string, RoutineStep | null> = {
  Cleansers: 'cleanse',
  Toners: 'tone',
  Serums: 'treat',
  Treatments: 'treat',
  'Eye Care': 'treat',
  Moisturizers: 'moisturise',
  'Lip Care': 'moisturise',
  Sunscreen: 'protect',
  'Body Care': 'body',
  'Hair Care': 'hair',
  'Sets & Kits': null, // A kit spans several steps; claiming one would be wrong.
};

const SKIN_TYPE_BY_TAG: Record<string, SkinType> = {
  'All Skin Types': 'all',
  'Dry Skin': 'dry',
  'Oily Skin': 'oily',
  'Normal Skin': 'normal',
  'Combination Skin': 'combination',
  'Sensitive Skin': 'sensitive',
};

/**
 * Legacy filter tag → existing concern slug(s). Only confident mappings appear
 * here; a tag may legitimately carry two concerns ("Brightening" is both
 * dullness and uneven tone). Tags with no honest equivalent are left unmapped
 * and listed in the reports rather than forced into the nearest concern.
 */
const CONCERNS_BY_TAG: Record<string, string[]> = {
  'Dry Skin': ['dryness'],
  Hydration: ['dehydration'],
  'Dehydrated Skin': ['dehydration'],
  'Sensitive Skin': ['sensitivity'],
  Eczema: ['sensitivity'],
  Soothing: ['sensitivity'],
  Redness: ['redness'],
  'Acne-Prone': ['blemishes'],
  'Blemish Control': ['blemishes'],
  Brightening: ['dullness', 'uneven-tone'],
  'Anti-Aging': ['firmness'],
  'Fine Lines': ['firmness'],
  'Barrier Repair': ['barrier-support'],
};

export function skinTypesFor(tags: string[]): SkinType[] {
  const found = [...new Set(tags.flatMap((t) => SKIN_TYPE_BY_TAG[t] ?? []))];
  // "All" already covers every type; listing it alongside specifics is noise.
  return found.includes('all') ? ['all'] : found.sort();
}

export function concernSlugsFor(tags: string[]): string[] {
  return [...new Set(tags.flatMap((t) => CONCERNS_BY_TAG[t] ?? []))].sort();
}

export function unmappedTags(tags: string[]): string[] {
  return tags.filter((t) => !SKIN_TYPE_BY_TAG[t] && !CONCERNS_BY_TAG[t]);
}

/* --- media ---------------------------------------------------------------- */

/** `/products/to-caffeine-30.jpg` → the app-served `/media/products/…webp`. */
export function targetMediaUrl(legacyPath: string): string {
  const file = legacyPath.split('/').pop() ?? '';
  return `/media/products/${slugify(file.replace(/\.[^.]+$/, ''))}.webp`;
}

/* --- the mapped record ---------------------------------------------------- */

/**
 * - `READY`   — complete and self-consistent; imported and published.
 * - `REVIEW`  — importable but materially incomplete (no usable image, no copy);
 *               imported as a **draft** so a human decides before it goes live.
 * - `INVALID` — a required field is missing or unusable; **not imported**, and
 *               listed by SKU in the reports so nothing disappears quietly.
 */
export type MappedState = 'READY' | 'REVIEW' | 'INVALID';

export type MappedProduct = {
  legacySku: string;
  legacyId: string;
  state: MappedState;
  /** Blocking problems — any entry means INVALID. */
  issues: string[];
  /** Material gaps — any entry means REVIEW. */
  gaps: string[];
  /** Non-blocking observations worth reporting. */
  notes: string[];

  brand: { name: string; slug: string; originCountry: string | null };
  categorySlug: string | null;

  product: {
    name: string;
    slug: string;
    excerpt: string | null;
    description: string | null;
    benefits: string[];
    howToUse: string | null;
    ingredientsList: null;
    suitableSkinTypes: SkinType[];
    routineStep: RoutineStep | null;
    status: 'published' | 'draft';
    seoTitle: string;
    seoDescription: string | null;
  };

  variant: {
    sku: string;
    name: string;
    price: number;
    salePrice: number | null;
    volumeMl: number | null;
  };

  inventory: { onHand: number };
  media: { legacyPath: string; url: string; alt: string; sortOrder: number }[];
  concernSlugs: string[];
  keyIngredients: {
    name: string;
    slug: string;
    description: string;
    concentration: string | null;
  }[];
  unmappedTags: string[];
};

/**
 * @param slugTaken - product slugs already claimed, so a collision resolves
 *   deterministically instead of failing the unique index mid-transaction.
 */
export function mapProduct(
  legacy: LegacyProduct,
  opts: {
    slugTaken: (slug: string) => boolean;
    /** Whether the legacy image file actually exists in the snapshot. */
    mediaExists?: (legacyPath: string) => boolean;
  },
): MappedProduct {
  const issues: string[] = [];
  const gaps: string[] = [];
  const notes: string[] = [];

  const brandName = legacy.brand?.trim() ?? '';
  if (!brandName) issues.push('missing brand');

  const category = CATEGORY_MAP[legacy.category];
  if (!category) issues.push(`unmapped category "${legacy.category}"`);

  if (!legacy.sku?.trim()) issues.push('missing SKU');
  if (!legacy.name?.trim()) issues.push('missing name');
  if (typeof legacy.price !== 'number' || !(legacy.price > 0))
    issues.push(`invalid price "${legacy.price}"`);
  if (!Number.isInteger(legacy.stock) || legacy.stock < 0)
    issues.push(`invalid stock "${legacy.stock}"`);

  const tags = legacy.specificationTags ?? legacy.skinConcerns ?? [];
  const displayName = stripBrandPrefix(legacy.name, brandName);

  // Size disambiguates two products of the same name; otherwise a numeric
  // suffix keeps the slug unique without ever reusing another product's URL.
  let slug = slugify(displayName);
  if (opts.slugTaken(slug) && legacy.type)
    slug = slugify(`${displayName}-${legacy.type}`);
  for (let n = 2; opts.slugTaken(slug); n += 1)
    slug = `${slugify(displayName)}-${n}`;

  if (isMultiSizeLabel(legacy.type)) {
    notes.push(
      `size label "${legacy.type}" covers several sizes but legacy holds one price, one SKU and one stock figure — kept as a single variant, as the legacy site sold it`,
    );
  }
  if (legacy.reviews > 0) {
    notes.push(
      `legacy rating ${legacy.rating}/${legacy.reviews} reviews not imported (no provenance)`,
    );
  }
  if (!legacy.ingredients?.length)
    notes.push('no ingredient data in legacy record');

  const howToUse = [...(legacy.howToUse ?? []), ...(legacy.tips ?? [])]
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');

  const onOffer =
    typeof legacy.originalPrice === 'number' &&
    legacy.originalPrice > legacy.price;
  if (typeof legacy.originalPrice === 'number' && !onOffer) {
    issues.push(
      `original price ${legacy.originalPrice} does not exceed price ${legacy.price}`,
    );
  }

  const imagePaths = [
    ...new Set([legacy.image, ...(legacy.images ?? [])].filter(Boolean)),
  ];
  const mediaExists = opts.mediaExists ?? (() => true);
  const usableImages = imagePaths.filter(mediaExists);
  for (const missing of imagePaths.filter((p) => !mediaExists(p))) {
    gaps.push(`image file missing from the legacy snapshot: ${missing}`);
  }
  if (usableImages.length === 0) gaps.push('no usable product image');
  if (!legacy.overview?.trim() && !legacy.description?.trim())
    gaps.push('no description or overview copy');
  if (!legacy.benefits?.length) gaps.push('no benefits copy');

  const state: MappedState =
    issues.length > 0 ? 'INVALID' : gaps.length > 0 ? 'REVIEW' : 'READY';

  return {
    legacySku: legacy.sku,
    legacyId: legacy.id,
    state,
    issues,
    gaps,
    notes,

    brand: {
      name: brandName,
      slug: slugify(brandName),
      originCountry: legacy.country?.trim() || null,
    },
    categorySlug: category?.slug ?? null,

    product: {
      name: displayName,
      slug,
      excerpt: legacy.description?.trim() || null,
      description:
        legacy.overview?.trim() || legacy.description?.trim() || null,
      benefits: legacy.benefits ?? [],
      howToUse: howToUse || null,
      // Legacy carries key ingredients, never a full INCI list. Leaving this
      // null is honest; filling it with a partial list would not be.
      ingredientsList: null,
      suitableSkinTypes: skinTypesFor(tags),
      routineStep: ROUTINE_STEP_BY_CATEGORY[legacy.category] ?? null,
      // Only READY records go live. Anything incomplete lands as a draft
      // rather than being published to inflate the imported count.
      status: state === 'READY' ? 'published' : 'draft',
      seoTitle: `${legacy.name} | Nordic Lux`,
      seoDescription: legacy.description?.trim() || null,
    },

    variant: {
      sku: legacy.sku,
      name: legacy.type?.trim() || 'Standard',
      price: toMinorUnits(onOffer ? legacy.originalPrice! : legacy.price),
      salePrice: onOffer ? toMinorUnits(legacy.price) : null,
      volumeMl: parseVolumeMl(legacy.type),
    },

    inventory: { onHand: Number.isInteger(legacy.stock) ? legacy.stock : 0 },

    media: usableImages.map((legacyPath, i) => ({
      legacyPath,
      url: targetMediaUrl(legacyPath),
      alt: i === 0 ? `${legacy.name}` : `${legacy.name}, view ${i + 1}`,
      sortOrder: i,
    })),

    concernSlugs: concernSlugsFor(tags),

    keyIngredients: (legacy.ingredients ?? []).map((ing) => ({
      name: ing.name,
      slug: slugify(ing.name),
      description: ing.description,
      concentration: ing.percentage ?? null,
    })),

    unmappedTags: unmappedTags(tags),
  };
}

/** Maps the whole catalogue, keeping slug allocation consistent across it. */
export function mapCatalogue(
  products: LegacyProduct[],
  mediaExists?: (legacyPath: string) => boolean,
): MappedProduct[] {
  const taken = new Set<string>();
  return products.map((legacy) => {
    const mapped = mapProduct(legacy, {
      slugTaken: (s) => taken.has(s),
      mediaExists,
    });
    taken.add(mapped.product.slug);
    return mapped;
  });
}
