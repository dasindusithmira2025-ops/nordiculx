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
import { products, concerns, skinTypeEnum, routineStepEnum } from './catalogue';
import { orders, orderItems } from './commerce';

/* ==========================================================================
   ENGAGEMENT — reviews, newsletter, support, live chat, Routine Finder
   ========================================================================== */

/* --- reviews -------------------------------------------------------------- */

export const reviewStatusEnum = pgEnum('review_status', [
  'pending',
  'approved',
  'rejected',
]);

export const reviews = pgTable(
  'reviews',
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    rating: integer().notNull(),
    title: text(),
    body: text().notNull(),

    /**
     * Set by the SERVER when it finds a delivered order containing this
     * product for this user. A client can never assert it — the column is
     * written from `verifiedOrderItemId`, which is looked up, not submitted.
     */
    verifiedPurchase: boolean().notNull().default(false),
    verifiedOrderItemId: uuid().references(() => orderItems.id, {
      onDelete: 'set null',
    }),

    status: reviewStatusEnum().notNull().default('pending'),
    moderatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    moderatedAt: timestamp({ withTimezone: true }),
    moderationNote: text(),

    /** Customer reports, for triage. Not visible to other customers. */
    reportCount: integer().notNull().default(0),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One review per customer per product; editing updates the same row.
    uniqueIndex('reviews_product_user_unique').on(t.productId, t.userId),
    index('reviews_product_status_idx').on(t.productId, t.status, t.createdAt),
    index('reviews_status_idx').on(t.status),
    check('reviews_rating_range', sql`${t.rating} BETWEEN 1 AND 5`),
  ],
);

/* --- newsletter ----------------------------------------------------------- */

export const newsletterSubscribers = pgTable(
  'newsletter_subscribers',
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull(),

    /** Explicit consent timestamp — the record that consent was given. */
    consentedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    source: text().notNull().default('footer'),

    unsubscribeTokenHash: text().notNull(),
    unsubscribedAt: timestamp({ withTimezone: true }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Re-subscribing is idempotent: the same email updates the same row.
    uniqueIndex('newsletter_email_unique').on(t.email),
    uniqueIndex('newsletter_token_unique').on(t.unsubscribeTokenHash),
  ],
);

/* --- support and live chat ------------------------------------------------ */

export const conversationStatusEnum = pgEnum('conversation_status', [
  'open',
  'pending',
  'closed',
]);

/**
 * A live-chat conversation. Guests get one keyed by an opaque cookie token;
 * signed-in customers get one linked to their account. Staff reply from the
 * admin support workspace against the same rows.
 */
export const chatConversations = pgTable(
  'chat_conversations',
  {
    id: uuid().primaryKey().defaultRandom(),

    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** Hash of the visitor cookie for guest conversations. */
    visitorTokenHash: text(),

    /** Contact fallback captured when nobody is online to answer. */
    guestName: text(),
    guestEmail: text(),

    subject: text(),
    status: conversationStatusEnum().notNull().default('open'),

    /** Page the conversation was started from, for staff context. */
    originPath: text(),
    /** Order the customer is asking about, when they started from one. */
    orderId: uuid().references(() => orders.id, { onDelete: 'set null' }),

    assignedTo: uuid().references(() => users.id, { onDelete: 'set null' }),

    lastMessageAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Separate counters so each side sees its own unread state. */
    unreadForStaff: integer().notNull().default(0),
    unreadForCustomer: integer().notNull().default(0),

    closedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('chat_conversations_visitor_token_unique').on(
      t.visitorTokenHash,
    ),
    index('chat_conversations_status_idx').on(t.status, t.lastMessageAt),
    index('chat_conversations_user_idx').on(t.userId),
  ],
);

export const chatAuthorRoleEnum = pgEnum('chat_author_role', [
  'customer',
  'staff',
  'system',
]);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid().primaryKey().defaultRandom(),
    conversationId: uuid()
      .notNull()
      .references(() => chatConversations.id, { onDelete: 'cascade' }),

    authorRole: chatAuthorRoleEnum().notNull(),
    authorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    authorName: text(),

    /** Plain text only. Rendered as text, never as markup. */
    body: text().notNull(),

    readAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('chat_messages_conversation_idx').on(t.conversationId, t.createdAt),
  ],
);

export const supportTickets = pgTable(
  'support_tickets',
  {
    id: uuid().primaryKey().defaultRandom(),
    reference: text().notNull(),

    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    name: text().notNull(),
    email: text().notNull(),
    phone: text(),

    subject: text().notNull(),
    message: text().notNull(),
    orderReference: text(),

    status: conversationStatusEnum().notNull().default('open'),
    assignedTo: uuid().references(() => users.id, { onDelete: 'set null' }),
    staffNote: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('support_tickets_reference_unique').on(t.reference),
    index('support_tickets_status_idx').on(t.status, t.createdAt),
  ],
);

/* --- Routine Finder ------------------------------------------------------- */

export const routineQuestionKindEnum = pgEnum('routine_question_kind', [
  'single',
  'multiple',
  'scale',
]);

/**
 * The questionnaire is data, not code. Questions, options and the rules that
 * turn answers into products are all editable in the admin, so merchandising
 * can retune recommendations without a deploy.
 */
export const routineQuestions = pgTable(
  'routine_questions',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Stable machine key referenced by rules, e.g. "skin_type". */
    key: text().notNull(),

    prompt: text().notNull(),
    helpText: text(),
    kind: routineQuestionKindEnum().notNull().default('single'),

    required: boolean().notNull().default(true),
    enabled: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('routine_questions_key_unique').on(t.key)],
);

export const routineAnswerOptions = pgTable(
  'routine_answer_options',
  {
    id: uuid().primaryKey().defaultRandom(),
    questionId: uuid()
      .notNull()
      .references(() => routineQuestions.id, { onDelete: 'cascade' }),

    /** Stable machine value referenced by rules, e.g. "combination". */
    value: text().notNull(),
    label: text().notNull(),
    description: text(),

    /** Optional links so an answer can imply a skin type or a concern. */
    impliesSkinType: skinTypeEnum(),
    impliesConcernId: uuid().references(() => concerns.id, {
      onDelete: 'set null',
    }),

    sortOrder: integer().notNull().default(0),
  },
  (t) => [
    uniqueIndex('routine_answer_options_question_value_unique').on(
      t.questionId,
      t.value,
    ),
    index('routine_answer_options_question_idx').on(t.questionId, t.sortOrder),
  ],
);

/**
 * A recommendation rule: "when these answers are given, this product is a
 * candidate for this routine step, with this weight". The engine evaluates all
 * matching rules, sums weights per product, and picks the best in-stock
 * candidate for each step. Documented in docs/PRODUCT.md § Routine Finder.
 */
export const routineRecommendationRules = pgTable(
  'routine_recommendation_rules',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),

    step: routineStepEnum().notNull(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),

    /**
     * All conditions must hold for the rule to fire. `answers` maps a question
     * key to the option values that satisfy it.
     */
    conditions: jsonb()
      .$type<{
        answers?: Record<string, string[]>;
        excludeAnswers?: Record<string, string[]>;
      }>()
      .notNull()
      .default({}),

    weight: integer().notNull().default(10),
    /** Shown to the customer as the reason this product was chosen. */
    rationale: text(),

    enabled: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('routine_rules_step_idx').on(t.step, t.enabled),
    index('routine_rules_product_idx').on(t.productId),
  ],
);

export const routineResults = pgTable(
  'routine_results',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Short shareable code so a customer can return to their routine. */
    reference: text().notNull(),

    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    email: text(),

    answers: jsonb().$type<Record<string, string[]>>().notNull().default({}),
    /** Resolved product per step, snapshotted so the result is stable. */
    recommendations: jsonb()
      .$type<{ step: string; productId: string; rationale?: string }[]>()
      .notNull()
      .default([]),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('routine_results_reference_unique').on(t.reference),
    index('routine_results_user_idx').on(t.userId),
  ],
);

/* --- analytics ------------------------------------------------------------ */

/**
 * First-party, privacy-conscious event log. No third-party script, no
 * cross-site identifier. The visitor key is a rotating salted hash, never a
 * durable cookie id, and no PII or order value detail is written here.
 * See docs/ARCHITECTURE.md § Analytics.
 */
export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    path: text(),

    visitorKey: text(),
    /** Present only for signed-in sessions, for funnel analysis. */
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),

    /** Bounded, non-identifying properties. Validated before write. */
    properties: jsonb().$type<Record<string, string | number | boolean>>(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('analytics_events_name_created_idx').on(t.name, t.createdAt),
    index('analytics_events_created_idx').on(t.createdAt),
  ],
);

/* --- relations ------------------------------------------------------------ */

export const reviewsRelations = relations(reviews, ({ one }) => ({
  product: one(products, {
    fields: [reviews.productId],
    references: [products.id],
  }),
  user: one(users, { fields: [reviews.userId], references: [users.id] }),
}));

export const chatConversationsRelations = relations(
  chatConversations,
  ({ one, many }) => ({
    user: one(users, {
      fields: [chatConversations.userId],
      references: [users.id],
    }),
    messages: many(chatMessages),
  }),
);

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(chatConversations, {
    fields: [chatMessages.conversationId],
    references: [chatConversations.id],
  }),
}));

export const routineQuestionsRelations = relations(
  routineQuestions,
  ({ many }) => ({
    options: many(routineAnswerOptions),
  }),
);

export const routineAnswerOptionsRelations = relations(
  routineAnswerOptions,
  ({ one }) => ({
    question: one(routineQuestions, {
      fields: [routineAnswerOptions.questionId],
      references: [routineQuestions.id],
    }),
  }),
);

export type Review = typeof reviews.$inferSelect;
export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type RoutineQuestion = typeof routineQuestions.$inferSelect;
export type RoutineAnswerOption = typeof routineAnswerOptions.$inferSelect;
export type RoutineRecommendationRule =
  typeof routineRecommendationRules.$inferSelect;
export type RoutineResult = typeof routineResults.$inferSelect;
export type ReviewStatus = (typeof reviewStatusEnum.enumValues)[number];
export type ConversationStatus =
  (typeof conversationStatusEnum.enumValues)[number];
