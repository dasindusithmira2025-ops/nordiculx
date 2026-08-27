import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SEED_PRODUCTS } from '../archive/source/seed-products';

/**
 * Phases 1–4: recover the legacy catalogue, snapshot it, inventory its media,
 * and report ground truth. Reads only the vendored snapshot under
 * `archive/source`, so it is reproducible without the legacy repository.
 *
 *   npx tsx migration/legacy-nordic-lux/scripts/extract.ts
 *
 * Writes nothing to the database and never rewrites an existing snapshot's
 * product data — re-running regenerates identical output from the same source.
 */

export const LEGACY_SOURCE = {
  repository: 'https://github.com/thenordiclux-a11y/thnordiclux',
  branch: 'main',
  commit: 'cc86865c90fe7dd2e78d677720395a7347cfb665',
  productSourceFile: 'app/lib/seed-products.ts',
  mediaRoot: 'public/products',
} as const;

const ROOT = join(import.meta.dirname, '..');
const MEDIA_DIR = join(ROOT, 'archive', 'media', 'products');

export type LegacyIngredient = {
  name: string;
  percentage?: string;
  description: string;
};

/** The legacy record, preserved field for field. */
export type LegacyProduct = {
  id: string;
  sku: string;
  name: string;
  brand?: string;
  category: string;
  type?: string;
  price: number;
  originalPrice?: number;
  stock: number;
  image: string;
  images?: string[];
  badge?: string;
  rating: number;
  reviews: number;
  country: string;
  description?: string;
  overview?: string;
  ingredients?: LegacyIngredient[];
  benefits?: string[];
  howToUse?: string[];
  tips?: string[];
  skinConcerns?: string[];
  specificationTags?: string[];
  sourceFile: string;
};

export type LegacyMediaEntry = {
  legacyPath: string;
  exists: boolean;
  fileType: string;
  bytes: number;
  sha256: string | null;
  referencedBy: string[];
};

/** Field order is fixed so the snapshot diffs cleanly across runs. */
function toLegacyProduct(raw: Record<string, unknown>): LegacyProduct {
  const g = <T>(k: string) => raw[k] as T;
  return {
    id: g<string>('id'),
    sku: g<string>('sku'),
    name: g<string>('name'),
    brand: g<string | undefined>('brand'),
    category: g<string>('category'),
    type: g<string | undefined>('type'),
    price: g<number>('price'),
    originalPrice: g<number | undefined>('originalPrice'),
    stock: g<number>('stock'),
    image: g<string>('image'),
    images: g<string[] | undefined>('images'),
    badge: g<string | undefined>('badge'),
    rating: g<number>('rating'),
    reviews: g<number>('reviews'),
    country: g<string>('country'),
    description: g<string | undefined>('description'),
    overview: g<string | undefined>('overview'),
    ingredients: g<LegacyIngredient[] | undefined>('ingredients'),
    benefits: g<string[] | undefined>('benefits'),
    howToUse: g<string[] | undefined>('howToUse'),
    tips: g<string[] | undefined>('tips'),
    skinConcerns: g<string[] | undefined>('skinConcerns'),
    specificationTags: g<string[] | undefined>('specificationTags'),
    sourceFile: LEGACY_SOURCE.productSourceFile,
  };
}

export function extractProducts(): LegacyProduct[] {
  return (SEED_PRODUCTS as Record<string, unknown>[]).map(toLegacyProduct);
}

/** All image paths a product refers to, primary first, de-duplicated. */
export function imagePathsOf(p: LegacyProduct): string[] {
  return [...new Set([p.image, ...(p.images ?? [])].filter(Boolean))];
}

/** `/products/x.jpg` in the legacy repo is `public/products/x.jpg` on disk. */
function diskPathFor(legacyPath: string): string | null {
  const m = /^\/products\/(.+)$/.exec(legacyPath);
  return m ? join(MEDIA_DIR, m[1]!) : null;
}

export function buildMediaManifest(
  products: LegacyProduct[],
): LegacyMediaEntry[] {
  const referencedBy = new Map<string, string[]>();
  for (const p of products) {
    for (const path of imagePathsOf(p)) {
      referencedBy.set(path, [...(referencedBy.get(path) ?? []), p.sku]);
    }
  }

  // Files present on disk but never referenced still belong in the manifest —
  // that is how orphans become visible instead of being silently dropped.
  const onDisk = readdirSync(MEDIA_DIR).map((f) => `/products/${f}`);
  const allPaths = [...new Set([...referencedBy.keys(), ...onDisk])].sort();

  return allPaths.map((legacyPath) => {
    const disk = diskPathFor(legacyPath);
    let exists = false;
    let bytes = 0;
    let sha256: string | null = null;
    if (disk) {
      try {
        bytes = statSync(disk).size;
        sha256 = createHash('sha256').update(readFileSync(disk)).digest('hex');
        exists = true;
      } catch {
        exists = false;
      }
    }
    return {
      legacyPath,
      exists,
      fileType: legacyPath.split('.').pop()?.toLowerCase() ?? '',
      bytes,
      sha256,
      referencedBy: referencedBy.get(legacyPath) ?? [],
    };
  });
}

/* --- discovery report ----------------------------------------------------- */

function countBy<T>(items: T[], key: (t: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + 1);
  return m;
}

function duplicates(values: string[]): string[] {
  return [...countBy(values, (v) => v)]
    .filter(([, n]) => n > 1)
    .map(([v]) => v);
}

function table(rows: [string, string | number][]): string {
  return [
    '| Metric | Count |',
    '| --- | ---: |',
    ...rows.map(([k, v]) => `| ${k} | ${v} |`),
  ].join('\n');
}

function discoveryReport(
  products: LegacyProduct[],
  media: LegacyMediaEntry[],
): string {
  const byHash = new Map<string, string[]>();
  for (const m of media) {
    if (m.sha256)
      byHash.set(m.sha256, [...(byHash.get(m.sha256) ?? []), m.legacyPath]);
  }
  const duplicateGroups = [...byHash.values()].filter((g) => g.length > 1);
  const orphans = media.filter((m) => m.exists && m.referencedBy.length === 0);
  const missingFiles = media.filter(
    (m) => !m.exists && m.referencedBy.length > 0,
  );

  const identityKey = (p: LegacyProduct) =>
    `${(p.brand ?? '').toLowerCase()}|${p.name.toLowerCase()}|${(p.type ?? '').toLowerCase()}`;
  const likelyDuplicates = duplicates(products.map(identityKey));

  const noPrice = products.filter((p) => typeof p.price !== 'number');
  const badPrice = products.filter(
    (p) => typeof p.price === 'number' && !(p.price > 0),
  );
  const badStock = products.filter(
    (p) => !Number.isInteger(p.stock) || p.stock < 0,
  );

  return `# Legacy Nordic Lux — Discovery Report

Ground truth only. Nothing has been fixed, normalised, or imported at this stage.

## Source

| Field | Value |
| --- | --- |
| Repository | ${LEGACY_SOURCE.repository} |
| Branch | ${LEGACY_SOURCE.branch} |
| Commit | \`${LEGACY_SOURCE.commit}\` |
| Product source | \`${LEGACY_SOURCE.productSourceFile}\` |
| Media root | \`${LEGACY_SOURCE.mediaRoot}\` |
| Generated | ${new Date().toISOString()} |

### Sources searched

The whole legacy tree was searched for product-bearing data (\`SEED_PRODUCTS\`,
product arrays, JSON/CSV/XLSX, SQL inserts, \`addProduct\`/\`addProducts\`, SKU
references, image paths). Findings:

| Location | Contains products? | Notes |
| --- | --- | --- |
| \`app/lib/seed-products.ts\` | **Yes — ${products.length}** | The only literal product catalogue in the repository. |
| \`app/lib/seed-categories.ts\` | No | 6 category records; images are hot-linked manufacturer URLs. |
| \`supabase/migrations/001_schema.sql\` | No | DDL only — \`create table public.products\`, zero \`insert\` statements. |
| \`app/lib/products-db.ts\` | No | Supabase read/write adapter; falls back to \`SEED_PRODUCTS\`. |
| \`app/contexts/DataContext.tsx\` | No | Client state; seeds itself from \`SEED_PRODUCTS\`. |
| \`app/admin/products/page.tsx\` | No | CSV/XLSX **import UI**. No bundled data file, no fixtures. |
| \`public/products/\` | Media | ${media.length} files. |
| \`public/images/\`, \`public/assets/\` | No | Site chrome (hero image, hero video). |

No CSV, XLSX, JSON or SQL product export exists anywhere in the legacy tree, so
\`seed-products.ts\` plus \`public/products/\` is the complete recoverable catalogue.

## Products

${table([
  ['Products discovered', products.length],
  ['Unique SKUs', new Set(products.map((p) => p.sku)).size],
  ['Duplicate SKUs', duplicates(products.map((p) => p.sku)).length],
  ['Missing SKUs', products.filter((p) => !p.sku?.trim()).length],
  ['Missing names', products.filter((p) => !p.name?.trim()).length],
  ['Missing brands', products.filter((p) => !p.brand?.trim()).length],
  ['Missing categories', products.filter((p) => !p.category?.trim()).length],
  ['Missing prices', noPrice.length],
  ['Invalid prices (<= 0)', badPrice.length],
  ['Missing / invalid stock', badStock.length],
  ['Missing image reference', products.filter((p) => !p.image?.trim()).length],
  ['Broken image reference (file absent)', missingFiles.length],
  ['Likely duplicate products (brand+name+size)', likelyDuplicates.length],
  ['Products with size/variant label', products.filter((p) => p.type).length],
  [
    'Products with a sale/original price',
    products.filter((p) => p.originalPrice).length,
  ],
  [
    'Products with structured ingredients',
    products.filter((p) => p.ingredients?.length).length,
  ],
  ['Products with benefits', products.filter((p) => p.benefits?.length).length],
  [
    'Products with how-to-use',
    products.filter((p) => p.howToUse?.length).length,
  ],
  [
    'Products with specification tags',
    products.filter((p) => p.specificationTags?.length).length,
  ],
  [
    'Products carrying rating/review counts',
    products.filter((p) => p.reviews > 0).length,
  ],
])}

### Brands

${table([...countBy(products, (p) => p.brand ?? '(none)')].sort())}

### Categories

${table([...countBy(products, (p) => p.category)].sort())}

### Sizes

${table([...countBy(products, (p) => p.type ?? '(none)')].sort())}

## Media

${table([
  ['Files in public/products', media.filter((m) => m.exists).length],
  [
    'Image paths referenced by products',
    new Set(products.flatMap(imagePathsOf)).size,
  ],
  [
    'Referenced files present',
    media.filter((m) => m.exists && m.referencedBy.length > 0).length,
  ],
  ['Referenced files missing', missingFiles.length],
  ['Orphaned files (present, unreferenced)', orphans.length],
  ['Exact duplicate groups (by sha256)', duplicateGroups.length],
  [
    'Redundant duplicate files',
    duplicateGroups.reduce((n, g) => n + g.length - 1, 0),
  ],
])}

### File types

${table(
  [
    ...countBy(
      media.filter((m) => m.exists),
      (m) => m.fileType,
    ),
  ].sort(),
)}

${
  duplicateGroups.length > 0
    ? `### Exact duplicate groups\n\n${duplicateGroups
        .map((g) => `- \`${g.join('`, `')}\``)
        .join('\n')}\n`
    : ''
}${
    orphans.length > 0
      ? `### Orphaned files\n\nPresent on disk, referenced by no product:\n\n${orphans
          .map((o) => `- \`${o.legacyPath}\``)
          .join('\n')}\n`
      : ''
  }${
    missingFiles.length > 0
      ? `### Broken references\n\n${missingFiles
          .map(
            (m) =>
              `- \`${m.legacyPath}\` — referenced by ${m.referencedBy.join(', ')}`,
          )
          .join('\n')}\n`
      : ''
  }
## Data-quality observations

These are recorded, not acted on.

1. **Currency.** Legacy prices are plain decimals (\`8.90\`) rendered as
   \`\${price.toFixed(2)}\` in \`app/components/ProductCard.tsx\`, i.e. a dollar
   sign. The new application's money unit is LKR minor units. The numeric
   values are preserved exactly; no exchange rate is applied and none is
   invented. See MIGRATION_STATE.md § Open question — currency.
2. **Ratings and reviews.** Every product carries a rating and a review count
   (e.g. 4.7 / 2840) with no underlying review rows anywhere in the legacy
   repository and no provenance. They are marketing placeholders, so they are
   **not** imported as genuine customer feedback.
3. **\`createdAt\` / \`updatedAt\`** are \`new Date().toISOString()\` evaluated at
   module load, so they carry no historical information and are not migrated.
4. **Structured \`ingredients\`** are key-ingredient highlights with
   percentages, not INCI lists. They map to key ingredients; the full INCI
   field is left empty rather than filled with a partial list.
5. **Legacy category images** are hot-linked manufacturer URLs and are not
   migrated.
`;
}

/* --- entry point ---------------------------------------------------------- */

/** Only when run directly — the importer imports this module for its parsers. */
function run() {
  const products = extractProducts();
  const media = buildMediaManifest(products);

  const write = (rel: string, body: string) => {
    writeFileSync(join(ROOT, rel), body, 'utf8');
    console.warn(`wrote ${rel}`);
  };

  write(
    'archive/legacy-products.json',
    `${JSON.stringify({ source: LEGACY_SOURCE, extractedAt: new Date().toISOString(), count: products.length, products }, null, 2)}\n`,
  );
  write(
    'archive/legacy-media-manifest.json',
    `${JSON.stringify({ source: LEGACY_SOURCE, mediaRoot: LEGACY_SOURCE.mediaRoot, count: media.length, files: media }, null, 2)}\n`,
  );
  write('reports/discovery-report.md', discoveryReport(products, media));
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) run();
