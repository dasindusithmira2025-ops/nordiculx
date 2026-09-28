import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let available = false;
let database: typeof import('@/lib/db').db;
let connection: typeof import('@/lib/db').sql;
let schema: typeof import('@/lib/db/schema');
let reset: typeof import('@/lib/auth/password-reset');

beforeAll(async () => {
  try {
    const dbModule = await import('@/lib/db');
    database = dbModule.db;
    connection = dbModule.sql;
    await database.execute((await import('drizzle-orm')).sql`SELECT 1`);
    schema = await import('@/lib/db/schema');
    reset = await import('@/lib/auth/password-reset');
    available = true;
  } catch {
    available = false;
  }
});

describe('password reset tokens', () => {
  it('are single-use, and a newer link revokes an older one', async () => {
    if (!available) {
      console.warn('skipped (no database): password reset tokens');
      return;
    }

    const { eq } = await import('drizzle-orm');
    const email = `reset-${randomUUID()}@example.test`;
    const [user] = await database
      .insert(schema.users)
      .values({ email, passwordHash: 'old-hash', failedLoginCount: 5 })
      .returning({ id: schema.users.id });

    try {
      expect(
        await reset.issuePasswordResetToken('nobody@example.test'),
      ).toBeNull();

      const older = await reset.issuePasswordResetToken(email);
      const newer = await reset.issuePasswordResetToken(email);
      expect(older).toBeTruthy();
      expect(newer).toBeTruthy();

      expect(await reset.passwordResetTokenIsValid(older!)).toBe(false);
      expect(await reset.passwordResetTokenIsValid(newer!)).toBe(true);
      expect(await reset.consumePasswordResetToken(older!, 'x')).toBeNull();

      expect(await reset.consumePasswordResetToken(newer!, 'new-hash')).toBe(
        user!.id,
      );
      expect(await reset.consumePasswordResetToken(newer!, 'again')).toBeNull();

      const [after] = await database
        .select({
          passwordHash: schema.users.passwordHash,
          failedLoginCount: schema.users.failedLoginCount,
        })
        .from(schema.users)
        .where(eq(schema.users.id, user!.id));
      expect(after).toEqual({ passwordHash: 'new-hash', failedLoginCount: 0 });
    } finally {
      await database.delete(schema.users).where(eq(schema.users.id, user!.id));
    }
  });
});

afterAll(async () => {
  if (available && connection) await connection.end();
});
