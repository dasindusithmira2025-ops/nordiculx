import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  index,
  uniqueIndex,
  primaryKey,
  jsonb,
  pgEnum,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './identity';
import { products, publishStatusEnum } from './catalogue';

/* ==========================================================================
   CONTENT — editorial, campaigns, homepage composition, navigation, policies

   Rich content is stored as a typed block array rather than raw HTML. Blocks
   are rendered by a fixed component map, so a compromised or careless editor
   account cannot inject script into the storefront — there is no path from
   stored content to `dangerouslySetInnerHTML`. See docs/SECURITY.md § XSS.
   ========================================================================== */

/** Every block shape the editorial renderer knows how to draw. */
export type ContentBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'quote'; text: string; attribution?: string }
  | {
      type: 'image';
      url: string;
      alt: string;
      caption?: string;
      ratio?: string;
    }
  | { type: 'image_pair'; images: { url: string; alt: string }[] }
  | { type: 'list'; ordered?: boolean; items: string[] }
  | { type: 'product'; productId: string; note?: string }
  | { type: 'product_grid'; productIds: string[]; title?: string }
  | { type: 'divider' }
  | { type: 'callout'; title?: string; text: string };

/* --- editorial: The Nordic Lux Edit --------------------------------------- */

export const articleLocaleEnum = pgEnum('article_locale', ['en', 'si']);

export const articleTopics = pgTable(
  'article_topics',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    slug: text().notNull(),
    description: text(),
    sortOrder: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('article_topics_slug_unique').on(t.slug)],
);

export const articles = pgTable(
  'articles',
  {
    id: uuid().primaryKey().defaultRandom(),

    title: text().notNull(),
    slug: text().notNull(),
    /** Standfirst shown under the title and in listings. */
    excerpt: text(),

    topicId: uuid().references(() => articleTopics.id, {
      onDelete: 'set null',
    }),
    locale: articleLocaleEnum().notNull().default('en'),

    heroImageUrl: text(),
    heroImageAlt: text(),
    /** Renders the hero on the dark editorial surface instead of paper. */
    heroDark: boolean().notNull().default(false),

    body: jsonb().$type<ContentBlock[]>().notNull().default([]),

    authorName: text(),
    readingMinutes: integer(),

    status: publishStatusEnum().notNull().default('draft'),
    featured: boolean().notNull().default(false),
    publishedAt: timestamp({ withTimezone: true }),

    seoTitle: text(),
    seoDescription: text(),

    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('articles_slug_unique').on(t.slug),
    index('articles_status_published_idx').on(t.status, t.publishedAt),
    index('articles_topic_idx').on(t.topicId),
  ],
);

/** Products explicitly shopped from an article ("Shop the story"). */
export const articleProducts = pgTable(
  'article_products',
  {
    articleId: uuid()
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    sortOrder: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.articleId, t.productId] }),
    index('article_products_article_idx').on(t.articleId, t.sortOrder),
  ],
);

/* --- campaigns ------------------------------------------------------------ */

/**
 * A campaign is a scheduled landing page. Publishing is a function of
 * (status, startsAt, endsAt) evaluated at request time — there is no cron job
 * that flips a boolean, so a campaign can never be left live past its window
 * because a worker was down.
 */
export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid().primaryKey().defaultRandom(),

    title: text().notNull(),
    slug: text().notNull(),
    subtitle: text(),

    heroImageUrl: text(),
    heroImageAlt: text(),
    heroVideoUrl: text(),
    /** Campaign heroes default to the dark editorial surface. */
    heroDark: boolean().notNull().default(true),

    body: jsonb().$type<ContentBlock[]>().notNull().default([]),

    status: publishStatusEnum().notNull().default('draft'),
    startsAt: timestamp({ withTimezone: true }),
    endsAt: timestamp({ withTimezone: true }),

    seoTitle: text(),
    seoDescription: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('campaigns_slug_unique').on(t.slug),
    index('campaigns_window_idx').on(t.status, t.startsAt, t.endsAt),
  ],
);

/* --- homepage composition ------------------------------------------------- */

export const homepageSectionKindEnum = pgEnum('homepage_section_kind', [
  'hero',
  'featured_products',
  'collection_spotlight',
  'category_grid',
  'brand_marquee',
  'concern_grid',
  'editorial_split',
  'campaign_banner',
  'article_row',
  'routine_finder_promo',
  'assurance_row',
  'newsletter',
]);

/**
 * The homepage is composed from ordered, individually schedulable sections
 * rather than hardcoded in a page component, so merchandising changes do not
 * require a deploy.
 */
export const homepageSections = pgTable(
  'homepage_sections',
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: homepageSectionKindEnum().notNull(),

    eyebrow: text(),
    title: text(),
    description: text(),
    ctaLabel: text(),
    ctaHref: text(),

    imageUrl: text(),
    imageAlt: text(),
    /** Renders this section on the dark editorial surface. */
    dark: boolean().notNull().default(false),

    /** Slugs/ids the section resolves at render time (collection, concern...). */
    config: jsonb().$type<Record<string, unknown>>().notNull().default({}),

    enabled: boolean().notNull().default(true),
    startsAt: timestamp({ withTimezone: true }),
    endsAt: timestamp({ withTimezone: true }),
    sortOrder: integer().notNull().default(0),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('homepage_sections_order_idx').on(t.enabled, t.sortOrder)],
);

/* --- navigation ----------------------------------------------------------- */

export const navigationLocationEnum = pgEnum('navigation_location', [
  'header',
  'footer',
  'mobile',
]);

export const navigationItems = pgTable(
  'navigation_items',
  {
    id: uuid().primaryKey().defaultRandom(),
    location: navigationLocationEnum().notNull().default('header'),

    parentId: uuid().references((): AnyPgColumn => navigationItems.id, {
      onDelete: 'cascade',
    }),

    label: text().notNull(),
    href: text().notNull(),
    /** Optional editorial tile shown inside a mega-menu column. */
    imageUrl: text(),
    imageAlt: text(),
    /** e.g. "New" — a small marker beside the label. */
    badge: text(),

    /** Groups top-level items into mega-menu columns. */
    columnGroup: text(),

    enabled: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('navigation_items_location_idx').on(
      t.location,
      t.enabled,
      t.sortOrder,
    ),
    index('navigation_items_parent_idx').on(t.parentId),
  ],
);

/* --- announcements -------------------------------------------------------- */

export const announcements = pgTable(
  'announcements',
  {
    id: uuid().primaryKey().defaultRandom(),
    message: text().notNull(),
    href: text(),
    enabled: boolean().notNull().default(false),
    startsAt: timestamp({ withTimezone: true }),
    endsAt: timestamp({ withTimezone: true }),
    sortOrder: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('announcements_window_idx').on(t.enabled, t.startsAt, t.endsAt),
  ],
);

/* --- static pages and FAQ ------------------------------------------------- */

/**
 * Policy and information pages. `requiresLegalReview` marks copy that is a
 * DRAFT pending client/legal approval — the storefront renders a visible
 * notice for those, so placeholder wording can never be mistaken for an
 * authoritative policy. See docs/PRODUCT.md § Content safety.
 */
export const pages = pgTable(
  'pages',
  {
    id: uuid().primaryKey().defaultRandom(),
    title: text().notNull(),
    slug: text().notNull(),
    body: jsonb().$type<ContentBlock[]>().notNull().default([]),

    status: publishStatusEnum().notNull().default('draft'),
    requiresLegalReview: boolean().notNull().default(false),

    seoTitle: text(),
    seoDescription: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('pages_slug_unique').on(t.slug)],
);

export const faqs = pgTable(
  'faqs',
  {
    id: uuid().primaryKey().defaultRandom(),
    question: text().notNull(),
    answer: text().notNull(),
    category: text().notNull().default('general'),
    enabled: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('faqs_category_idx').on(t.category, t.enabled, t.sortOrder)],
);

/* --- relations ------------------------------------------------------------ */

export const articlesRelations = relations(articles, ({ one, many }) => ({
  topic: one(articleTopics, {
    fields: [articles.topicId],
    references: [articleTopics.id],
  }),
  products: many(articleProducts),
}));

export const articleProductsRelations = relations(
  articleProducts,
  ({ one }) => ({
    article: one(articles, {
      fields: [articleProducts.articleId],
      references: [articles.id],
    }),
    product: one(products, {
      fields: [articleProducts.productId],
      references: [products.id],
    }),
  }),
);

export const articleTopicsRelations = relations(articleTopics, ({ many }) => ({
  articles: many(articles),
}));

export const navigationItemsRelations = relations(
  navigationItems,
  ({ one, many }) => ({
    parent: one(navigationItems, {
      fields: [navigationItems.parentId],
      references: [navigationItems.id],
      relationName: 'navigation_parent',
    }),
    children: many(navigationItems, { relationName: 'navigation_parent' }),
  }),
);

export type Article = typeof articles.$inferSelect;
export type ArticleTopic = typeof articleTopics.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type HomepageSection = typeof homepageSections.$inferSelect;
export type HomepageSectionKind =
  (typeof homepageSectionKindEnum.enumValues)[number];
export type NavigationItem = typeof navigationItems.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type Page = typeof pages.$inferSelect;
export type Faq = typeof faqs.$inferSelect;
