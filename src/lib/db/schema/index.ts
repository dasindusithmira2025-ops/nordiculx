/**
 * The complete Nordic Lux database schema.
 *
 * drizzle-kit reads this file to generate migrations, and the runtime client
 * passes it to `drizzle()` so relational queries work. Anything not re-exported
 * here does not exist as far as migrations are concerned.
 */
export * from './identity';
export * from './catalogue';
export * from './inventory';
export * from './commerce';
export * from './content';
export * from './engagement';
