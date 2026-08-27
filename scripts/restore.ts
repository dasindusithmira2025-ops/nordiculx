/**
 * Restores a dump produced by `npm run backup`.
 *
 *   npm run restore -- --file backups/nordiclux-2026-08-18T10-00-00.dump
 *
 * DESTRUCTIVE: `--clean` drops existing objects before recreating them. The same
 * guards as db:reset apply — never with NODE_ENV=production, and never against a
 * non-local host without --force. Restoring over the wrong database is the kind
 * of mistake that ends a business.
 */
import './load-env';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const file = flag('file');
if (!file) {
  console.error('Usage: npm run restore -- --file <dump>');
  process.exit(1);
}
if (!existsSync(file)) {
  console.error(`No such file: ${file}`);
  process.exit(1);
}

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to restore with NODE_ENV=production.');
  process.exit(1);
}

const host = new URL(url).hostname;
const isLocal = ['localhost', '127.0.0.1', '::1', 'postgres'].includes(host);
if (!isLocal && !process.argv.includes('--force')) {
  console.error(
    `DATABASE_URL points at "${host}", which is not local.\n` +
      'Re-run with --force if you genuinely mean to overwrite it.',
  );
  process.exit(1);
}

const probe = spawnSync('pg_restore', ['--version'], { shell: true });
if (probe.status !== 0) {
  console.error(
    'pg_restore was not found on PATH. Install the Postgres client tools.',
  );
  process.exit(1);
}

console.warn(`Restoring ${file} into ${host}…`);

const result = spawnSync(
  'pg_restore',
  [
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    `--dbname=${url}`,
    file,
  ],
  { stdio: 'inherit', shell: true },
);

// pg_restore exits non-zero for benign "does not exist" notices under --clean,
// so the exit code alone is not a reliable verdict; the output above is.
if (result.status !== 0) {
  console.warn(
    'pg_restore reported warnings. Review the output above — under --clean these ' +
      'are usually "does not exist" notices for objects that were not there yet.',
  );
}

console.warn('Restore finished.');
