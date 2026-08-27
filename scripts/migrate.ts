/**
 * Applies pending migrations, then exits.
 *
 * Safe to run repeatedly and on every deploy: drizzle records applied
 * migrations in `drizzle.__drizzle_migrations` and skips them.
 *
 *   npm run db:migrate
 */
import './load-env';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env first.');
  process.exit(1);
}

// `max: 1` — migrations must run serially on one connection.
const client = postgres(url, { max: 1 });

try {
  const started = Date.now();
  await migrate(drizzle(client), {
    migrationsFolder: './src/lib/db/migrations',
  });
  console.warn(`Migrations applied in ${Date.now() - started}ms`);
} catch (error) {
  console.error('Migration failed:', error);
  process.exitCode = 1;
} finally {
  await client.end();
}
