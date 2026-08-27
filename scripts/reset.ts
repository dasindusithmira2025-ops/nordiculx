/**
 * Drops every table and re-applies migrations, then optionally re-seeds.
 *
 *   npm run db:reset            drop, migrate
 *   npm run db:reset -- --seed                       drop, migrate, seed
 *   npm run db:reset -- --seed --no-demo-catalogue   ...without sample products
 *
 * DESTRUCTIVE. Refuses to run against a production database, and refuses when
 * NODE_ENV is production, because "reset the database" is not a mistake anybody
 * recovers from. It also refuses a non-local host unless --force is passed, so a
 * stray DATABASE_URL pointing at staging does not wipe it.
 */
import './load-env';
import { execFileSync } from 'node:child_process';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const args = process.argv.slice(2);
const withSeed = args.includes('--seed');
const force = args.includes('--force');

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to reset the database with NODE_ENV=production.');
  process.exit(1);
}

const host = new URL(url).hostname;
const isLocal = ['localhost', '127.0.0.1', '::1', 'postgres'].includes(host);
if (!isLocal && !force) {
  console.error(
    `DATABASE_URL points at "${host}", which is not local.\n` +
      'Re-run with --force if you genuinely mean to wipe it.',
  );
  process.exit(1);
}

const client = postgres(url, { max: 1 });

try {
  console.warn(`Resetting ${host}…`);

  // Dropping and recreating the schema is faster and more complete than
  // truncating: it also removes types, sequences and the migration ledger, so
  // the next migrate run starts from genuinely nothing.
  await client.unsafe('DROP SCHEMA IF EXISTS public CASCADE');
  await client.unsafe('CREATE SCHEMA public');
  await client.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE');
  console.warn('Schema dropped.');
} catch (error) {
  console.error('Reset failed:', error);
  process.exitCode = 1;
} finally {
  await client.end();
}

if (process.exitCode) process.exit(process.exitCode);

const run = (
  script: string,
  nodeArgs: string[] = [],
  scriptArgs: string[] = [],
) => {
  execFileSync('npx', ['tsx', ...nodeArgs, script, ...scriptArgs], {
    stdio: 'inherit',
    shell: true,
  });
};

run('scripts/migrate.ts');
// `seed.ts` reaches `@/lib/db` → `@/lib/env` → `server-only`, whose default
// entry point throws by design. Node picks the harmless entry only when the
// `react-server` condition is set, which Next does for us and a bare CLI does
// not. Same flag as the `db:seed` script.
if (withSeed) {
  // Pass the catalogue flag through: `--no-demo-catalogue` seeds everything
  // except the fictional sample products, for a database that holds only the
  // real Nordic Lux catalogue.
  run(
    'scripts/seed.ts',
    ['--conditions=react-server'],
    args.filter((a) => a === '--no-demo-catalogue'),
  );
}

console.warn(`Reset complete${withSeed ? ' and seeded' : ''}.`);
