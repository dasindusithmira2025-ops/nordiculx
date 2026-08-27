/**
 * Creates or promotes a staff account.
 *
 *   npm run staff:create -- --email owner@example.com --role owner
 *   npm run staff:create -- --email a@b.com --role support --password 'secret…'
 *
 * With no --password, one is generated and printed ONCE. It is never stored in
 * plaintext and never logged again, so it has to be copied out of this output.
 *
 * Promoting an existing account revokes its sessions: a role change must not
 * leave an old session running with the permissions it had a moment ago.
 */
import './load-env';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../src/lib/auth/password';
import { sessions, staffRoleEnum, users } from '../src/lib/db/schema';

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const email = flag('email')?.trim().toLowerCase();
const role = flag('role')?.trim();
const givenPassword = flag('password');

const roles = staffRoleEnum.enumValues;

if (!email || !role) {
  console.error(
    'Usage: npm run staff:create -- --email <email> --role <role> [--password <password>]\n' +
      `Roles: ${roles.join(', ')}`,
  );
  process.exit(1);
}

if (!roles.includes(role as (typeof roles)[number])) {
  console.error(`Unknown role "${role}". Roles: ${roles.join(', ')}`);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

// A generated password is long and random rather than memorable: it is meant to
// be pasted into a password manager and changed, not remembered.
const password = givenPassword ?? randomBytes(18).toString('base64url');

const client = postgres(url, { max: 1 });
// `casing: 'snake_case'` must match src/lib/db/index.ts. Without it Drizzle
// emits the camelCase property names as column names and every write fails.
const db = drizzle(client, { casing: 'snake_case' });

try {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const passwordHash = await hashPassword(password);

  if (existing[0]) {
    await db
      .update(users)
      .set({
        staffRole: role as (typeof roles)[number],
        ...(givenPassword ? { passwordHash } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing[0].id));

    // Any session issued before the role change carries the old permissions.
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.userId, existing[0].id));

    console.warn(
      `Updated ${email} to role "${role}" and revoked its sessions.`,
    );
    if (givenPassword) console.warn('Password updated.');
  } else {
    await db.insert(users).values({
      email,
      passwordHash,
      staffRole: role as (typeof roles)[number],
      emailVerifiedAt: new Date(),
    });

    console.warn(`Created ${email} with role "${role}".`);
    if (!givenPassword) {
      console.warn(`\n  Password: ${password}\n`);
      console.warn(
        'Copy it now — it is not recoverable and will not be shown again.',
      );
    }
  }
} catch (error) {
  console.error('Failed:', error);
  process.exitCode = 1;
} finally {
  await client.end();
}
