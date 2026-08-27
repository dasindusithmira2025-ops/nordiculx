/**
 * Refreshes search indexes.
 *
 *   npm run search:reindex
 *
 * With SEARCH_DRIVER=postgres (the default and the only implementation today)
 * search is computed at query time from `to_tsvector`, so there is no document
 * store to rebuild. What genuinely helps is rebuilding the indexes those queries
 * use and refreshing the planner statistics: after a large seed or import,
 * Postgres is still planning against stale row counts and picks bad plans.
 *
 * With SEARCH_DRIVER=meilisearch this exits non-zero. `src/lib/catalogue/search.ts`
 * has no Meilisearch implementation yet, so pretending to reindex would report
 * success for work that did not happen.
 */
import './load-env';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const driver = process.env.SEARCH_DRIVER ?? 'postgres';

if (driver === 'meilisearch') {
  console.error(
    'SEARCH_DRIVER=meilisearch, but no Meilisearch indexer exists yet.\n' +
      'Search still runs against Postgres — see src/lib/catalogue/search.ts.\n' +
      'Nothing was reindexed.',
  );
  process.exit(1);
}

/** The tables the storefront search actually reads. */
const TABLES = [
  'products',
  'brands',
  'categories',
  'concerns',
  'articles',
] as const;

const client = postgres(url, { max: 1 });

try {
  const started = Date.now();

  for (const table of TABLES) {
    // REINDEX rebuilds bloated indexes; ANALYZE updates the statistics the
    // planner uses to choose between them. Both are online and safe to repeat.
    await client.unsafe(`REINDEX TABLE ${table}`);
    await client.unsafe(`ANALYZE ${table}`);
    console.warn(`  reindexed ${table}`);
  }

  console.warn(`Search indexes refreshed in ${Date.now() - started}ms.`);
} catch (error) {
  console.error('Reindex failed:', error);
  process.exitCode = 1;
} finally {
  await client.end();
}
