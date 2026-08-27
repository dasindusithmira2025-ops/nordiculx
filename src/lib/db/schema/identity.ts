import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  index,
  uniqueIndex,
  jsonb,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/* ==========================================================================
   IDENTITY — accounts, sessions, staff authorisation, addresses, audit trail

   One `users` table holds both customers and staff. `staffRole` being non-null
   is what makes an account staff; there is no separate login surface backed by
   a different table, which removes a whole class of "which table am I checking"
   authorisation bugs. Staff sessions have their own shorter TTL and are marked
   on the session row itself.
   ========================================================================== */

/**
 * Staff roles, most privileged first. Permissions are derived from the role in
 * src/lib/auth/permissions.ts — never stored per-user — so a role change takes
 * effect everywhere at once.
 */
export const staffRoleEnum = pgEnum('staff_role', [
  'owner',
  'administrator',
  'product_manager',
  'order_manager',
  'content_editor',
  'support',
]);

export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey().defaultRandom(),

    // Stored lowercased and trimmed. The unique index below is what actually
    // prevents duplicate accounts; application checks are advisory.
    email: text().notNull(),
    emailVerifiedAt: timestamp({ withTimezone: true }),

    // scrypt hash, encoded as `scrypt$N$r$p$salt$hash`. Never plaintext,
    // never reversible. See src/lib/auth/password.ts.
    passwordHash: text().notNull(),

    firstName: text(),
    lastName: text(),
    phone: text(),

    staffRole: staffRoleEnum(),

    // Multi-factor for privileged staff. Base32 TOTP secret, encrypted at rest.
    mfaSecret: text(),
    mfaEnabledAt: timestamp({ withTimezone: true }),

    marketingOptInAt: timestamp({ withTimezone: true }),

    // Brute-force throttling state. Reset on any successful authentication.
    failedLoginCount: integer().notNull().default(0),
    lockedUntil: timestamp({ withTimezone: true }),

    lastLoginAt: timestamp({ withTimezone: true }),

    // Soft delete. A deleted customer keeps their orders (legal/accounting
    // requirement) but the personal fields are scrubbed by the deletion job.
    deletedAt: timestamp({ withTimezone: true }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Case-insensitive uniqueness: emails are normalised before write, and this
    // index guarantees it even if a code path forgets.
    uniqueIndex('users_email_unique').on(t.email),
    index('users_staff_role_idx').on(t.staffRole),
    index('users_deleted_at_idx').on(t.deletedAt),
  ],
);

/**
 * Server-side sessions.
 *
 * The cookie carries an opaque random token; only its SHA-256 hash is stored,
 * so a database leak does not hand an attacker live sessions. Sessions are
 * revocable individually or per user (password change revokes all).
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    tokenHash: text().notNull(),

    // A session minted through the staff login surface. Staff sessions expire
    // far sooner and are re-checked against the current role on every request.
    isStaff: boolean().notNull().default(false),

    ipAddress: text(),
    userAgent: text(),

    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_unique').on(t.tokenHash),
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
);

/**
 * Single-use tokens for password reset, email verification and back-in-stock
 * unsubscribe. Same hashing discipline as sessions.
 */
export const verificationTokenPurposeEnum = pgEnum(
  'verification_token_purpose',
  ['password_reset', 'email_verification', 'email_change'],
);

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: verificationTokenPurposeEnum().notNull(),
    tokenHash: text().notNull(),
    // For email_change: the address being moved to, verified before it applies.
    payload: text(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    consumedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('verification_tokens_hash_unique').on(t.tokenHash),
    index('verification_tokens_user_purpose_idx').on(t.userId, t.purpose),
  ],
);

export const addressTypeEnum = pgEnum('address_type', ['shipping', 'billing']);

export const addresses = pgTable(
  'addresses',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    label: text(),
    type: addressTypeEnum().notNull().default('shipping'),

    recipientName: text().notNull(),
    phone: text().notNull(),
    line1: text().notNull(),
    line2: text(),
    city: text().notNull(),
    district: text(),
    postalCode: text(),
    country: text().notNull().default('LK'),

    isDefault: boolean().notNull().default(false),

    deletedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('addresses_user_id_idx').on(t.userId)],
);

/**
 * Append-only audit trail for anything a staff member does that changes money,
 * stock, permissions or customer data. Never updated, never deleted.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid().primaryKey().defaultRandom(),

    // Null when the actor is the system (scheduled job, webhook).
    actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    actorEmail: text(),
    actorRole: staffRoleEnum(),

    // e.g. "order.status_changed", "product.deleted", "user.role_changed"
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text(),

    // Before/after snapshot of the changed fields only, never whole rows.
    changes: jsonb().$type<Record<string, { from: unknown; to: unknown }>>(),

    ipAddress: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    index('audit_logs_actor_idx').on(t.actorId),
    index('audit_logs_created_at_idx').on(t.createdAt),
  ],
);

/* --- relations ----------------------------------------------------------- */

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  addresses: many(addresses),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const addressesRelations = relations(addresses, ({ one }) => ({
  user: one(users, { fields: [addresses.userId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Address = typeof addresses.$inferSelect;
export type StaffRole = (typeof staffRoleEnum.enumValues)[number];
