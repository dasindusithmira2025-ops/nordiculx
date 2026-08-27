import { defineConfig } from 'drizzle-kit';

// Read directly from process.env — drizzle-kit runs outside the app runtime,
// so it must not pull in src/lib/env.ts and its production invariants.
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is required to run drizzle-kit');
}

export default defineConfig({
  schema: './src/lib/db/schema/index.ts',
  out: './src/lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  casing: 'snake_case',
  verbose: true,
  strict: true,
});
