import './load-env';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql as raw } from 'drizzle-orm';
import postgres from 'postgres';
import * as s from '@/lib/db/schema';

/**
 * Replaces the nine original skin concerns with the six current ones in an
 * existing database.
 *
 * `npm run db:seed` only ever runs against an empty database, so this change —
 * which is DATA, not schema — needs a script of its own to reach a store that
 * is already trading:
 *
 *   A. The six new concerns are upserted by slug and published.
 *   B. Every product link on an old concern is copied to its new concern(s).
 *      A product that reaches one new concern from several old ones keeps the
 *      HIGHEST relevance of the sources (e.g. dryness + dehydration).
 *   C. Routine Finder answer options are repointed from the old concern they
 *      implied to ONE new concern. Option values and labels (dehydration,
 *      dryness, blemishes, dullness, uneven_tone, barrier) are NOT changed.
 *   D. The old concerns lose their product links and are ARCHIVED, not
 *      deleted, so the rows (and the reversal path) survive. Storefront reads
 *      (getConcerns, getConcernBySlug, search) filter on status = 'published'.
 *   E. Navigation: the five "Shop by Concern" links under Skincare are
 *      replaced by six links to the new concerns, in the old links' slot.
 *
 * Old /concern/<slug> URLs are 308-redirected by next.config.ts.
 *
 * Idempotent: every statement is written so a second run is a no-op.
 *
 *   npm run concerns:update -- --dry-run
 *   npm run concerns:update
 */
if (
  process.env.NODE_ENV === 'production' &&
  !process.argv.includes('--force')
) {
  console.error(
    'Refusing to run against production without --force. Take a backup first.',
  );
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const connection = postgres(url, { max: 1 });
const db = drizzle(connection, { schema: s, casing: 'snake_case' });

const DRY_RUN = process.argv.includes('--dry-run');

const NEW_CONCERNS = [
  {
    sortOrder: 0,
    slug: 'dullness-uneven-tone',
    name: 'Dullness & Uneven Tone',
    description: 'For tired, lacklustre-looking skin.',
    guidance:
      'Gentle exfoliation, consistent hydration and daily sun protection are the usual approach. Frequency matters more than strength.',
  },
  {
    sortOrder: 1,
    slug: 'dark-spots-pigmentation',
    name: 'Dark Spots & Pigmentation',
    description: 'For visible spots and post-acne marks.',
    guidance:
      'Daily sun protection is the single most useful habit here. Beyond that, products are grouped by ingredient family so you can choose what suits you.',
  },
  {
    sortOrder: 2,
    slug: 'dryness-dehydration',
    name: 'Dryness & Dehydration',
    description: 'For tight, rough or moisture-lacking skin.',
    guidance:
      'Dryness and dehydration are different things — oily skin can be dehydrated. A humectant serum under a moisturiser is the usual approach, with richer textures where skin feels tight. Products are grouped by texture and typical use, not by any claim about results.',
  },
  {
    sortOrder: 3,
    slug: 'sensitivity-redness',
    name: 'Sensitivity & Redness',
    description: 'For reactive, irritated-looking skin.',
    guidance:
      'Shorter ingredient lists, fragrance-free formulas and daily sun protection are the usual starting point. Patch test anything new and introduce one product at a time. Persistent redness is worth discussing with a dermatologist.',
  },
  {
    sortOrder: 4,
    slug: 'acne-blemishes',
    name: 'Acne & Blemishes',
    description: 'For breakouts, congestion and blemish-prone skin.',
    guidance:
      'Gentle cleansing and a simple routine are easier to keep up than an aggressive one. Nordic Lux does not sell acne medication — persistent or painful breakouts are a conversation for a clinician.',
  },
  {
    sortOrder: 5,
    slug: 'fine-lines-aging',
    name: 'Fine Lines & Aging',
    description: 'For wrinkles, firmness and elasticity concerns.',
    guidance:
      'Products in this group are chosen for their textures and ingredient families. Nordic Lux makes no claims about reversing the appearance of ageing.',
  },
] as const;

/** Old concern slug → every new concern its product links are copied to. */
const PRODUCT_LINK_MAP: readonly { from: string; to: string }[] = [
  { from: 'dryness', to: 'dryness-dehydration' },
  { from: 'dehydration', to: 'dryness-dehydration' },
  { from: 'barrier-support', to: 'dryness-dehydration' },
  { from: 'barrier-support', to: 'sensitivity-redness' },
  { from: 'sensitivity', to: 'sensitivity-redness' },
  { from: 'redness', to: 'sensitivity-redness' },
  { from: 'blemishes', to: 'acne-blemishes' },
  { from: 'dullness', to: 'dullness-uneven-tone' },
  { from: 'uneven-tone', to: 'dullness-uneven-tone' },
  { from: 'uneven-tone', to: 'dark-spots-pigmentation' },
  { from: 'firmness', to: 'fine-lines-aging' },
];

/** Old concern slug → the ONE new concern a routine answer option implies. */
const ROUTINE_MAP: readonly { from: string; to: string }[] = [
  { from: 'dryness', to: 'dryness-dehydration' },
  { from: 'dehydration', to: 'dryness-dehydration' },
  { from: 'barrier-support', to: 'sensitivity-redness' },
  { from: 'sensitivity', to: 'sensitivity-redness' },
  { from: 'redness', to: 'sensitivity-redness' },
  { from: 'blemishes', to: 'acne-blemishes' },
  { from: 'dullness', to: 'dullness-uneven-tone' },
  { from: 'uneven-tone', to: 'dark-spots-pigmentation' },
  { from: 'firmness', to: 'fine-lines-aging' },
];

const OLD_SLUGS = [
  'dryness',
  'dehydration',
  'barrier-support',
  'sensitivity',
  'redness',
  'blemishes',
  'dullness',
  'uneven-tone',
  'firmness',
];

/** `IN (...)` over a JS array — see merchandising-update.ts. */
const inList = (values: readonly string[]) =>
  raw.join(
    values.map((value) => raw`${value}`),
    raw`, `,
  );

const oldHrefs = OLD_SLUGS.map((slug) => `/concern/${slug}`);
const NAV_COLUMN = 'Shop by Concern';

type Rows = Record<string, unknown>[] & { count?: number };
const changed = (rows: unknown) => (rows as Rows).count ?? 0;
const first = (rows: unknown) =>
  ((rows as { n: number }[])[0]?.n ?? 0) as number;

async function report() {
  const missing = first(
    await db.execute(raw`
      SELECT COUNT(*)::int AS n
        FROM (VALUES ${raw.join(
          NEW_CONCERNS.map((c) => raw`(${c.slug})`),
          raw`, `,
        )}) AS wanted(slug)
       WHERE NOT EXISTS (SELECT 1 FROM concerns c WHERE c.slug = wanted.slug)
    `),
  );
  const links = first(
    await db.execute(raw`
      SELECT COUNT(*)::int AS n FROM product_concerns pc
        JOIN concerns c ON c.id = pc.concern_id
       WHERE c.slug IN (${inList(OLD_SLUGS)})
    `),
  );
  const options = first(
    await db.execute(raw`
      SELECT COUNT(*)::int AS n FROM routine_answer_options o
        JOIN concerns c ON c.id = o.implies_concern_id
       WHERE c.slug IN (${inList(OLD_SLUGS)})
    `),
  );
  const toArchive = first(
    await db.execute(raw`
      SELECT COUNT(*)::int AS n FROM concerns
       WHERE slug IN (${inList(OLD_SLUGS)}) AND status <> 'archived'
    `),
  );
  const navDelete = first(
    await db.execute(raw`
      SELECT COUNT(*)::int AS n FROM navigation_items
       WHERE href IN (${inList(oldHrefs)})
    `),
  );

  console.warn('\nPlanned changes:');
  console.warn(`  new concerns to insert:           ${missing}`);
  console.warn(
    `  new concerns already present:     ${NEW_CONCERNS.length - missing} (updated only if changed)`,
  );
  console.warn(`  old product links to move:        ${links}`);
  console.warn(`  routine options to repoint:       ${options}`);
  console.warn(`  old concerns to archive:          ${toArchive}`);
  console.warn(`  old navigation links to delete:   ${navDelete}\n`);
}

/* --- A. new concerns ------------------------------------------------------ */

async function upsertConcerns(tx: typeof db) {
  for (const c of NEW_CONCERNS) {
    await tx.execute(raw`
      INSERT INTO concerns
        (name, slug, description, guidance, image_url, status, sort_order)
      VALUES
        (${c.name}, ${c.slug}, ${c.description}, ${c.guidance},
         ${`/media/editorial/concern-${c.slug}.webp`}, 'published', ${c.sortOrder})
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        guidance = EXCLUDED.guidance,
        image_url = EXCLUDED.image_url,
        status = 'published',
        sort_order = EXCLUDED.sort_order,
        updated_at = NOW()
       WHERE (concerns.name, concerns.description, concerns.guidance,
              concerns.image_url, concerns.status, concerns.sort_order)
             IS DISTINCT FROM
             (EXCLUDED.name, EXCLUDED.description, EXCLUDED.guidance,
              EXCLUDED.image_url, EXCLUDED.status, EXCLUDED.sort_order)
    `);
  }
  console.warn(`Concerns upserted: ${NEW_CONCERNS.length} new definitions.`);
}

/* --- B. product links ----------------------------------------------------- */

async function copyProductLinks(tx: typeof db) {
  let affected = 0;
  for (const { from, to } of PRODUCT_LINK_MAP) {
    // GREATEST keeps the strongest relevance when several old concerns merge
    // into one new one, and makes a re-run harmless.
    const rows = await tx.execute(raw`
      INSERT INTO product_concerns (product_id, concern_id, relevance)
      SELECT pc.product_id, nc.id, pc.relevance
        FROM product_concerns pc
        JOIN concerns oc ON oc.id = pc.concern_id AND oc.slug = ${from}
        JOIN concerns nc ON nc.slug = ${to}
      ON CONFLICT (product_id, concern_id) DO UPDATE
        SET relevance = GREATEST(product_concerns.relevance, EXCLUDED.relevance)
    `);
    affected += changed(rows);
  }
  console.warn(`Product links merged into new concerns: ${affected}.`);
}

/* --- C. routine finder ---------------------------------------------------- */

async function repointRoutineOptions(tx: typeof db) {
  let affected = 0;
  for (const { from, to } of ROUTINE_MAP) {
    const rows = await tx.execute(raw`
      UPDATE routine_answer_options o
         SET implies_concern_id = nc.id
        FROM concerns oc, concerns nc
       WHERE oc.slug = ${from} AND nc.slug = ${to}
         AND o.implies_concern_id = oc.id
    `);
    affected += changed(rows);
  }
  console.warn(`Routine answer options repointed: ${affected}.`);
}

/* --- D. retire the old concerns ------------------------------------------- */

async function retireOldConcerns(tx: typeof db) {
  const deleted = await tx.execute(raw`
    DELETE FROM product_concerns
     WHERE concern_id IN (SELECT id FROM concerns WHERE slug IN (${inList(OLD_SLUGS)}))
  `);
  const archived = await tx.execute(raw`
    UPDATE concerns SET status = 'archived', updated_at = NOW()
     WHERE slug IN (${inList(OLD_SLUGS)}) AND status <> 'archived'
  `);
  console.warn(
    `Old product links removed: ${changed(deleted)}; concerns archived: ${changed(archived)}.`,
  );
}

/* --- E. navigation -------------------------------------------------------- */

async function updateNavigation(tx: typeof db) {
  const parent = (await tx.execute(raw`
    SELECT id FROM navigation_items
     WHERE location = 'header' AND parent_id IS NULL AND label = 'Skincare'
     LIMIT 1
  `)) as unknown as { id: string }[];

  const parentId = parent[0]?.id;
  if (!parentId) {
    console.warn('No Skincare header item — navigation left untouched.');
    return;
  }

  // Read the slot the old links occupied BEFORE deleting them, so the new
  // links take the same place in the column.
  const base = first(
    await tx.execute(raw`
      SELECT COALESCE(MIN(sort_order), 0)::int AS n FROM navigation_items
       WHERE parent_id = ${parentId} AND href IN (${inList(oldHrefs)})
    `),
  );

  const deleted = await tx.execute(raw`
    DELETE FROM navigation_items WHERE href IN (${inList(oldHrefs)})
  `);

  let inserted = 0;
  for (const [index, c] of NEW_CONCERNS.entries()) {
    const href = `/concern/${c.slug}`;
    // Matched on href so a re-run, or a link an editor already added, is
    // never duplicated.
    const rows = await tx.execute(raw`
      INSERT INTO navigation_items
        (location, parent_id, label, href, column_group, enabled, sort_order)
      SELECT 'header', ${parentId}, ${c.name}, ${href}, ${NAV_COLUMN}, TRUE, ${base + index}
       WHERE NOT EXISTS (
         SELECT 1 FROM navigation_items
          WHERE parent_id = ${parentId} AND href = ${href}
       )
    `);
    inserted += changed(rows);
  }
  console.warn(
    `Navigation: ${changed(deleted)} old link(s) removed, ${inserted} new link(s) added.`,
  );
}

async function main() {
  await report();

  if (DRY_RUN) {
    console.warn('--dry-run: nothing was written.');
    await connection.end();
    return;
  }

  await db.transaction(async (tx) => {
    const t = tx as unknown as typeof db;
    await upsertConcerns(t);
    await copyProductLinks(t);
    await repointRoutineOptions(t);
    await retireOldConcerns(t);
    await updateNavigation(t);
  });

  console.warn('\nDone. Restart or revalidate the storefront to see changes.');
  await connection.end();
}

main().catch(async (error) => {
  console.error(error);
  await connection.end();
  process.exit(1);
});
