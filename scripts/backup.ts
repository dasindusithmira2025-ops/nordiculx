/**
 * Writes a compressed logical backup to ./backups.
 *
 *   npm run backup
 *   npm run backup -- --out /path/to/dir
 *
 * Shells out to `pg_dump` rather than reimplementing it: a hand-rolled dump gets
 * ordering, extensions and large objects subtly wrong, and a backup you cannot
 * restore is worse than none. Uses the custom format (-Fc), which restores
 * selectively and in parallel.
 *
 * The connection string is passed through the environment, never on the command
 * line, so the password does not appear in the process list.
 */
import './load-env';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const outDir = flag('out') ?? 'backups';
mkdirSync(outDir, { recursive: true });

// Sortable, filename-safe, and unambiguous about when it was taken.
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const file = join(outDir, `nordiclux-${stamp}.dump`);

const probe = spawnSync('pg_dump', ['--version'], { shell: true });
if (probe.status !== 0) {
  console.error(
    'pg_dump was not found on PATH.\n' +
      'Install the Postgres client tools, or run it inside the container:\n' +
      '  docker exec nordiclux-postgres pg_dump -Fc -U nordiclux nordiclux > backup.dump',
  );
  process.exit(1);
}

const result = spawnSync(
  'pg_dump',
  ['--format=custom', '--no-owner', '--no-privileges', `--file=${file}`, url],
  { stdio: 'inherit', shell: true },
);

if (result.status !== 0) {
  console.error('Backup failed.');
  process.exit(result.status ?? 1);
}

console.warn(`Backup written to ${file}`);
console.warn(
  'Verify it restores before relying on it: npm run restore -- --file ' + file,
);
