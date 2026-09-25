import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  index,
  uniqueIndex,
  jsonb,
  pgEnum,
  check,
} from 'drizzle-orm/pg-core';
import { sql, relations } from 'drizzle-orm';
import { users } from './identity';
import { products, productVariants } from './catalogue';

/* ==========================================================================
   COMMERCE — carts, wishlists, promotions, orders, payments, fulfilment,
   returns.

   Two rules run through this whole file:

   1. Money is integer cents, and every total on an order is a value the
      SERVER computed and stored. Nothing submitted by a browser is ever
      trusted as a price. The cart carries no totals at all — they are derived
      on read — so a stale cart cannot lock in an old price.

   2. Order rows snapshot what was bought (name, brand, sku, unit price) at the
      moment of purchase. Renaming a product or changing its price must never
      rewrite somebody's order history or their invoice.
   ========================================================================== */

/* --- carts ---------------------------------------------------------------- */

export const carts = pgTable(
  'carts',
  {
    id: uuid().primaryKey().defaultRandom(),

    /** Null for a guest cart, which is identified by the cart cookie alone. */
    userId: uuid().references(() => users.id, { onDelete: 'cascade' }),

    /** Hash of the opaque cart cookie value. Never the raw token. */
    tokenHash: text().notNull(),

    /** Applied promotion code, revalidated server-side on every price read. */
    promotionCode: text(),

    /** Guest carts are swept after this instant; extended on every touch. */
    expiresAt: timestamp({ withTimezone: true }).notNull(),

    /** Set when the cart converts, so it is never reused or re-priced. */
    convertedOrderId: uuid(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('carts_token_hash_unique').on(t.tokenHash),
    index('carts_user_id_idx').on(t.userId),
    index('carts_expires_at_idx').on(t.expiresAt),
  ],
);

export const cartItems = pgTable(
  'cart_items',
  {
    id: uuid().primaryKey().defaultRandom(),
    cartId: uuid()
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),

    quantity: integer().notNull(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Adding the same variant twice increments the existing line instead of
    // creating a duplicate one.
    uniqueIndex('cart_items_cart_variant_unique').on(t.cartId, t.variantId),
    check('cart_items_quantity_positive', sql`${t.quantity} > 0`),
  ],
);

/* --- wishlist ------------------------------------------------------------- */

export const wishlistItems = pgTable(
  'wishlist_items',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    /** Optional: the customer saved a specific size. */
    variantId: uuid().references(() => productVariants.id, {
      onDelete: 'cascade',
    }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('wishlist_user_product_unique').on(t.userId, t.productId),
    index('wishlist_user_idx').on(t.userId, t.createdAt),
  ],
);

/* --- promotions ----------------------------------------------------------- */

export const promotionTypeEnum = pgEnum('promotion_type', [
  'percentage',
  'fixed_amount',
  'free_shipping',
]);

export const promotionScopeEnum = pgEnum('promotion_scope', [
  'order',
  'product',
  'category',
  'collection',
  'brand',
]);

export const promotions = pgTable(
  'promotions',
  {
    id: uuid().primaryKey().defaultRandom(),

    /** Uppercase, no spaces. Null for an automatic promotion with no code. */
    code: text(),
    name: text().notNull(),
    description: text(),

    type: promotionTypeEnum().notNull(),
    scope: promotionScopeEnum().notNull().default('order'),

    /** Whole percent for `percentage`; cents for `fixed_amount`. */
    value: integer().notNull().default(0),

    /** Minimum eligible subtotal in cents. */
    minimumSubtotal: integer().notNull().default(0),
    /** Ceiling on the discount a percentage promotion can produce, in cents. */
    maximumDiscount: integer(),

    /** Target ids for a scoped promotion. Empty for scope = 'order'. */
    targetIds: uuid().array().notNull().default([]),

    startsAt: timestamp({ withTimezone: true }),
    endsAt: timestamp({ withTimezone: true }),

    /** Null means unlimited. Enforced transactionally at order creation. */
    usageLimit: integer(),
    usageLimitPerCustomer: integer(),
    usageCount: integer().notNull().default(0),

    enabled: boolean().notNull().default(false),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('promotions_code_unique').on(t.code),
    index('promotions_enabled_window_idx').on(t.enabled, t.startsAt, t.endsAt),
    check('promotions_value_non_negative', sql`${t.value} >= 0`),
  ],
);

/* --- orders --------------------------------------------------------------- */

export const orderStatusEnum = pgEnum('order_status', [
  'pending_payment',
  'confirmed',
  'preparing',
  'packed',
  'dispatched',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'returned',
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'authorised',
  'paid',
  'failed',
  'refunded',
  'partially_refunded',
]);

export const orders = pgTable(
  'orders',
  {
    id: uuid().primaryKey().defaultRandom(),

    /**
     * Customer-facing order number, e.g. "NL-8KQ3-M7XZ". Random, not
     * sequential: order numbers are shown in emails and support chats, and a
     * sequential number would let anybody enumerate the shop's whole order
     * book and infer its volume. Access control still applies on top — knowing
     * a reference is not authorisation. See docs/SECURITY.md § IDOR.
     */
    reference: text().notNull(),

    /** Null for a guest checkout; the order is then reachable by email + token. */
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),

    /** Hash of the token emailed to guests for order lookup. */
    guestAccessTokenHash: text(),

    email: text().notNull(),
    phone: text(),
    /** Legacy preference retained for compatibility; checkout no longer writes it. */
    whatsappOptIn: boolean().notNull().default(false),

    status: orderStatusEnum().notNull().default('pending_payment'),
    paymentStatus: paymentStatusEnum().notNull().default('pending'),

    currency: text().notNull().default('LKR'),

    /* --- server-computed totals, all in cents --------------------------- */
    subtotal: integer().notNull(),
    discountTotal: integer().notNull().default(0),
    shippingTotal: integer().notNull().default(0),
    taxTotal: integer().notNull().default(0),
    grandTotal: integer().notNull(),

    promotionId: uuid().references(() => promotions.id, {
      onDelete: 'set null',
    }),
    promotionCode: text(),

    /**
     * Addresses are COPIED onto the order, not referenced. A customer editing
     * or deleting a saved address must not alter where a past order was sent.
     */
    shippingAddress: jsonb()
      .$type<{
        recipientName: string;
        phone: string;
        line1: string;
        line2?: string | null;
        city: string;
        district?: string | null;
        postalCode?: string | null;
        country: string;
      }>()
      .notNull(),
    billingAddress: jsonb().$type<{
      recipientName: string;
      phone: string;
      line1: string;
      line2?: string | null;
      city: string;
      district?: string | null;
      postalCode?: string | null;
      country: string;
    }>(),

    shippingMethod: text(),
    customerNote: text(),
    /** Staff-only. Never returned by any customer-facing query. */
    internalNote: text(),

    /**
     * Idempotency key from the checkout submission. The unique index makes a
     * double-clicked "Place order" a no-op rather than two orders.
     */
    idempotencyKey: text(),

    placedAt: timestamp({ withTimezone: true }),
    cancelledAt: timestamp({ withTimezone: true }),
    deliveredAt: timestamp({ withTimezone: true }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('orders_reference_unique').on(t.reference),
    uniqueIndex('orders_idempotency_key_unique').on(t.idempotencyKey),
    index('orders_user_id_idx').on(t.userId, t.createdAt),
    index('orders_status_idx').on(t.status),
    index('orders_email_idx').on(t.email),
    index('orders_created_at_idx').on(t.createdAt),
    check('orders_grand_total_non_negative', sql`${t.grandTotal} >= 0`),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    /** Kept for reporting. `set null` so deleting a product never eats an order. */
    productId: uuid().references(() => products.id, { onDelete: 'set null' }),
    variantId: uuid().references(() => productVariants.id, {
      onDelete: 'set null',
    }),

    /* --- purchase-time snapshot ----------------------------------------- */
    productName: text().notNull(),
    variantName: text().notNull(),
    brandName: text().notNull(),
    sku: text().notNull(),
    imageUrl: text(),

    unitPrice: integer().notNull(),
    quantity: integer().notNull(),
    /** unitPrice * quantity, before order-level discount apportionment. */
    lineTotal: integer().notNull(),
    /** Share of the order discount attributed to this line, for refunds. */
    lineDiscount: integer().notNull().default(0),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('order_items_order_id_idx').on(t.orderId),
    index('order_items_product_id_idx').on(t.productId),
    check('order_items_quantity_positive', sql`${t.quantity} > 0`),
  ],
);

/* --- payments ------------------------------------------------------------- */

export const payments = pgTable(
  'payments',
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    /** Provider key: 'mock', 'payhere', ... */
    provider: text().notNull(),
    /** The provider's own transaction id, for reconciliation. */
    providerReference: text(),

    status: paymentStatusEnum().notNull().default('pending'),
    amount: integer().notNull(),
    currency: text().notNull().default('LKR'),

    /**
     * Display-only remnants: last four digits and card brand. Storing a full
     * PAN, CVV or expiry is prohibited — see docs/SECURITY.md § Payments.
     */
    method: text(),
    last4: text(),

    /** Provider callback payload, with any card data stripped before write. */
    providerPayload: jsonb().$type<Record<string, unknown>>(),

    failureReason: text(),

    authorisedAt: timestamp({ withTimezone: true }),
    capturedAt: timestamp({ withTimezone: true }),
    refundedAt: timestamp({ withTimezone: true }),
    refundedAmount: integer().notNull().default(0),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payments_order_id_idx').on(t.orderId),
    uniqueIndex('payments_provider_reference_unique').on(
      t.provider,
      t.providerReference,
    ),
  ],
);

/* --- fulfilment ----------------------------------------------------------- */

export const shipments = pgTable(
  'shipments',
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    /** Courier key, e.g. 'domex', 'pronto'. Abstracted in src/lib/shipping. */
    carrier: text(),
    trackingNumber: text(),
    trackingUrl: text(),

    dispatchedAt: timestamp({ withTimezone: true }),
    deliveredAt: timestamp({ withTimezone: true }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('shipments_order_id_idx').on(t.orderId)],
);

/**
 * Tracking timeline. Written by staff status changes today and by a courier
 * webhook later — the shape does not change when that lands.
 */
export const trackingEvents = pgTable(
  'tracking_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    shipmentId: uuid().references(() => shipments.id, { onDelete: 'cascade' }),

    status: orderStatusEnum().notNull(),
    /** Customer-facing line, e.g. "Left our Weboda studio". */
    message: text(),
    location: text(),

    /** 'staff' | 'system' | 'carrier' — who reported this event. */
    source: text().notNull().default('staff'),

    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('tracking_events_order_idx').on(t.orderId, t.occurredAt)],
);

/** Transactional notification outbox. Payment settlement writes these rows in
 * the same transaction, so a process restart cannot lose a paid-order send. */
export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    orderReference: text().notNull(),
    channel: text().notNull(),
    status: text().notNull().default('pending'),
    attemptCount: integer().notNull().default(0),
    nextAttemptAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastError: text(),
    sentAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('notification_deliveries_order_channel_unique').on(
      t.orderId,
      t.channel,
    ),
    index('notification_deliveries_ready_idx').on(t.status, t.nextAttemptAt),
    check(
      'notification_deliveries_channel_valid',
      sql`${t.channel} IN ('email', 'whatsapp')`,
    ),
    check(
      'notification_deliveries_status_valid',
      sql`${t.status} IN ('pending', 'sending', 'sent', 'failed')`,
    ),
    check(
      'notification_deliveries_attempts_non_negative',
      sql`${t.attemptCount} >= 0`,
    ),
  ],
);

/* --- returns -------------------------------------------------------------- */

export const returnStatusEnum = pgEnum('return_status', [
  'requested',
  'approved',
  'rejected',
  'in_transit',
  'received',
  'refunded',
  'cancelled',
]);

export const returnRequests = pgTable(
  'return_requests',
  {
    id: uuid().primaryKey().defaultRandom(),
    reference: text().notNull(),

    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),

    status: returnStatusEnum().notNull().default('requested'),
    reason: text().notNull(),
    customerNote: text(),
    /** Uploaded evidence, validated and re-encoded before storage. */
    evidenceUrls: text().array().notNull().default([]),

    staffNote: text(),
    reviewedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp({ withTimezone: true }),

    refundAmount: integer(),
    refundedAt: timestamp({ withTimezone: true }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('return_requests_reference_unique').on(t.reference),
    index('return_requests_order_idx').on(t.orderId),
    index('return_requests_status_idx').on(t.status),
  ],
);

export const returnItems = pgTable(
  'return_items',
  {
    id: uuid().primaryKey().defaultRandom(),
    returnRequestId: uuid()
      .notNull()
      .references(() => returnRequests.id, { onDelete: 'cascade' }),
    orderItemId: uuid()
      .notNull()
      .references(() => orderItems.id, { onDelete: 'cascade' }),

    quantity: integer().notNull(),
    /** Whether this specific item was accepted back into sellable stock. */
    restocked: boolean().notNull().default(false),
  },
  (t) => [
    index('return_items_request_idx').on(t.returnRequestId),
    check('return_items_quantity_positive', sql`${t.quantity} > 0`),
  ],
);

/* --- relations ------------------------------------------------------------ */

export const cartsRelations = relations(carts, ({ one, many }) => ({
  user: one(users, { fields: [carts.userId], references: [users.id] }),
  items: many(cartItems),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, { fields: [cartItems.cartId], references: [carts.id] }),
  variant: one(productVariants, {
    fields: [cartItems.variantId],
    references: [productVariants.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  items: many(orderItems),
  payments: many(payments),
  shipments: many(shipments),
  trackingEvents: many(trackingEvents),
  notificationDeliveries: many(notificationDeliveries),
  returnRequests: many(returnRequests),
  promotion: one(promotions, {
    fields: [orders.promotionId],
    references: [promotions.id],
  }),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
  variant: one(productVariants, {
    fields: [orderItems.variantId],
    references: [productVariants.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
}));

export const shipmentsRelations = relations(shipments, ({ one, many }) => ({
  order: one(orders, { fields: [shipments.orderId], references: [orders.id] }),
  events: many(trackingEvents),
}));

export const trackingEventsRelations = relations(trackingEvents, ({ one }) => ({
  order: one(orders, {
    fields: [trackingEvents.orderId],
    references: [orders.id],
  }),
}));

export const returnRequestsRelations = relations(
  returnRequests,
  ({ one, many }) => ({
    order: one(orders, {
      fields: [returnRequests.orderId],
      references: [orders.id],
    }),
    items: many(returnItems),
  }),
);

export const returnItemsRelations = relations(returnItems, ({ one }) => ({
  request: one(returnRequests, {
    fields: [returnItems.returnRequestId],
    references: [returnRequests.id],
  }),
  orderItem: one(orderItems, {
    fields: [returnItems.orderItemId],
    references: [orderItems.id],
  }),
}));

export const wishlistItemsRelations = relations(wishlistItems, ({ one }) => ({
  user: one(users, { fields: [wishlistItems.userId], references: [users.id] }),
  product: one(products, {
    fields: [wishlistItems.productId],
    references: [products.id],
  }),
}));

export type Cart = typeof carts.$inferSelect;
export type CartItem = typeof cartItems.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Shipment = typeof shipments.$inferSelect;
export type TrackingEvent = typeof trackingEvents.$inferSelect;
export type ReturnRequest = typeof returnRequests.$inferSelect;
export type Promotion = typeof promotions.$inferSelect;
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];
export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number];
export type ReturnStatus = (typeof returnStatusEnum.enumValues)[number];
export type PromotionType = (typeof promotionTypeEnum.enumValues)[number];
export type PromotionScope = (typeof promotionScopeEnum.enumValues)[number];
