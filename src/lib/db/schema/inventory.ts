import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  index,
  uniqueIndex,
  pgEnum,
  check,
} from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';
import { productVariants } from './catalogue';
import { users } from './identity';

/* ==========================================================================
   INVENTORY

   One row per variant. `onHand` is physical stock; `reserved` is stock claimed
   by orders that are placed but not yet dispatched. Sellable stock is
   `onHand - reserved`, never `onHand` alone.

   Concurrency: stock is only ever changed by a conditional UPDATE whose WHERE
   clause re-asserts availability, executed inside the order transaction:

     UPDATE inventory_items
        SET reserved = reserved + $qty
      WHERE variant_id = $id AND on_hand - reserved >= $qty

   Zero rows updated means somebody else took the last unit and the whole order
   rolls back. This needs no explicit lock and cannot go negative — the CHECK
   constraints below make that a database-level guarantee rather than a
   convention. See docs/ARCHITECTURE.md § Inventory concurrency.
   ========================================================================== */

export const inventoryItems = pgTable(
  'inventory_items',
  {
    id: uuid().primaryKey().defaultRandom(),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),

    onHand: integer().notNull().default(0),
    reserved: integer().notNull().default(0),

    lowStockThreshold: integer().notNull().default(5),

    /** Lets a variant keep selling past zero (pre-order, made to order). */
    allowBackorder: boolean().notNull().default(false),

    /** Set when a stock take is performed, for reconciliation reporting. */
    lastCountedAt: timestamp({ withTimezone: true }),

    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('inventory_items_variant_unique').on(t.variantId),
    // Integrity enforced by the database, not by React and not by a service.
    check('inventory_on_hand_non_negative', sql`${t.onHand} >= 0`),
    check('inventory_reserved_non_negative', sql`${t.reserved} >= 0`),
  ],
);

/**
 * Append-only ledger. Every change to `onHand` or `reserved` writes a movement
 * in the same transaction, so current stock is always explainable. Rows are
 * never updated or deleted.
 */
export const inventoryMovementReasonEnum = pgEnum('inventory_movement_reason', [
  'received',
  'order_reserved',
  'order_released',
  'order_fulfilled',
  'return_restocked',
  'damaged',
  'lost',
  'stock_take',
  'manual_adjustment',
]);

export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: uuid().primaryKey().defaultRandom(),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),

    reason: inventoryMovementReasonEnum().notNull(),

    /** Signed delta applied to onHand. Zero for pure reservation movements. */
    onHandDelta: integer().notNull().default(0),
    /** Signed delta applied to reserved. */
    reservedDelta: integer().notNull().default(0),

    /** Resulting values, captured so history reads without replaying sums. */
    onHandAfter: integer().notNull(),
    reservedAfter: integer().notNull(),

    /** Order id, return id, or null for a manual adjustment. */
    referenceType: text(),
    referenceId: text(),

    note: text(),
    actorId: uuid().references(() => users.id, { onDelete: 'set null' }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('inventory_movements_variant_idx').on(t.variantId, t.createdAt),
    index('inventory_movements_reference_idx').on(
      t.referenceType,
      t.referenceId,
    ),
  ],
);

/**
 * Back-in-stock notification requests.
 *
 * Keyed by variant so a customer waiting on the 100ml is not told the 30ml
 * returned. The unsubscribe token is hashed like every other token in the
 * system, so the mailed link cannot be reconstructed from a database dump.
 */
export const backInStockSubscriptions = pgTable(
  'back_in_stock_subscriptions',
  {
    id: uuid().primaryKey().defaultRandom(),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),

    /** Null for a guest request; the email is then the only identity. */
    userId: uuid().references(() => users.id, { onDelete: 'cascade' }),
    email: text().notNull(),

    unsubscribeTokenHash: text().notNull(),

    notifiedAt: timestamp({ withTimezone: true }),
    unsubscribedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One live request per email per variant; re-requesting is idempotent.
    uniqueIndex('back_in_stock_variant_email_unique').on(t.variantId, t.email),
    uniqueIndex('back_in_stock_token_unique').on(t.unsubscribeTokenHash),
    index('back_in_stock_pending_idx').on(t.variantId, t.notifiedAt),
  ],
);

export const inventoryItemsRelations = relations(inventoryItems, ({ one }) => ({
  variant: one(productVariants, {
    fields: [inventoryItems.variantId],
    references: [productVariants.id],
  }),
}));

export const inventoryMovementsRelations = relations(
  inventoryMovements,
  ({ one }) => ({
    variant: one(productVariants, {
      fields: [inventoryMovements.variantId],
      references: [productVariants.id],
    }),
  }),
);

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type InventoryMovementReason =
  (typeof inventoryMovementReasonEnum.enumValues)[number];
