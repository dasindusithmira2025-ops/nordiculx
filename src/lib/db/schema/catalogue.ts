import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  index,
  uniqueIndex,
  primaryKey,
  jsonb,
  pgEnum,
  real,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/* ==========================================================================
   CATALOGUE — brands, taxonomy, products, variants, media

   Pricing lives on the VARIANT, never on the product: a 30ml and a 100ml of
   the same serum are different prices and different stock. A product with one
   size still has exactly one variant, so every code path reads prices from the
   same place and there is no "does this product have variants?" branch.

   All money is an integer number of cents (see src/lib/money.ts).
   ========================================================================== */

export const publishStatusEnum = pgEnum('publish_status', [
  'draft',
  'published',
  'archived',
]);

/* --- brands --------------------------------------------------------------- */

export const brands = pgTable(
  'brands',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    slug: text().notNull(),

    tagline: text(),
    description: text(),
    /** Long-form brand story rendered on the brand landing page. */
    story: text(),

    logoUrl: text(),
    heroImageUrl: text(),
    originCountry: text(),

    status: publishStatusEnum().notNull().default('draft'),
    featured: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),

    /**
     * Merchandising pin for the Top Selling Brands row.
     *
     * NULL — the default and the usual case — means "rank this brand on what
     * it has actually sold". A number pins it to that slot regardless of the
     * order book, for a launch or an exclusivity window that sales data cannot
     * know about.
     *
     * Deliberately NOT `sortOrder`, which the seed fills with an arbitrary
     * index for every brand: overloading it would mean every brand read as
     * pinned and the sales ranking would never apply to anything.
     */
    merchandisingRank: integer(),

    seoTitle: text(),
    seoDescription: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('brands_slug_unique').on(t.slug),
    index('brands_status_idx').on(t.status),
  ],
);

/* --- categories (hierarchical) -------------------------------------------- */

export const categories = pgTable(
  'categories',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    slug: text().notNull(),

    // Self-reference builds the tree. Two levels are used in navigation
    // (Skincare > Serums); deeper nesting is permitted but not surfaced.
    parentId: uuid().references((): AnyPgColumn => categories.id, {
      onDelete: 'set null',
    }),

    description: text(),
    imageUrl: text(),
    /** Wide editorial image used on the category landing page hero. */
    heroImageUrl: text(),

    status: publishStatusEnum().notNull().default('draft'),
    showInNavigation: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),

    seoTitle: text(),
    seoDescription: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('categories_slug_unique').on(t.slug),
    index('categories_parent_id_idx').on(t.parentId),
    index('categories_status_idx').on(t.status),
  ],
);

/* --- collections (merchandised groupings) --------------------------------- */

/**
 * A collection is an editorial grouping ("The Winter Edit", "Gifts under
 * 10,000") and is orthogonal to the category tree. Membership is explicit.
 */
export const collections = pgTable(
  'collections',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    slug: text().notNull(),
    description: text(),
    imageUrl: text(),
    heroImageUrl: text(),

    status: publishStatusEnum().notNull().default('draft'),
    featured: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),

    seoTitle: text(),
    seoDescription: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('collections_slug_unique').on(t.slug),
    index('collections_status_idx').on(t.status),
  ],
);

/* --- concerns and skin types ---------------------------------------------- */

/** A skin/hair concern used for "Shop by Concern" and the Routine Finder. */
export const concerns = pgTable(
  'concerns',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    slug: text().notNull(),
    description: text(),
    /** Customer-facing explanation shown on the concern landing page. */
    guidance: text(),
    imageUrl: text(),
    status: publishStatusEnum().notNull().default('published'),
    sortOrder: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('concerns_slug_unique').on(t.slug)],
);

export const skinTypeEnum = pgEnum('skin_type', [
  'normal',
  'dry',
  'oily',
  'combination',
  'sensitive',
  'all',
]);

/** Where a product sits in a routine — drives the Routine Finder result. */
export const routineStepEnum = pgEnum('routine_step', [
  'cleanse',
  'tone',
  'treat',
  'moisturise',
  'protect',
  'mask',
  'body',
  'hair',
  'fragrance',
  'wellness',
]);

/* --- ingredients ---------------------------------------------------------- */

export const ingredients = pgTable(
  'ingredients',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    slug: text().notNull(),
    /** INCI name, when it differs from the marketing name. */
    inciName: text(),
    description: text(),
    /**
     * What this ingredient does, in plain language. Editorial copy supplied by
     * Nordic Lux — never generated, never a medical claim. See docs/PRODUCT.md
     * § Content safety.
     */
    benefitSummary: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('ingredients_slug_unique').on(t.slug)],
);

/* --- products ------------------------------------------------------------- */

export const products = pgTable(
  'products',
  {
    id: uuid().primaryKey().defaultRandom(),

    name: text().notNull(),
    slug: text().notNull(),

    brandId: uuid()
      .notNull()
      .references(() => brands.id, { onDelete: 'restrict' }),
    categoryId: uuid().references(() => categories.id, {
      onDelete: 'set null',
    }),

    /** One-line positioning shown under the name on the PDP. */
    subtitle: text(),
    /** Short description used on cards and in search results. */
    excerpt: text(),
    description: text(),

    /** Bulleted benefits. Plain strings — no HTML, no markup injection route. */
    benefits: jsonb().$type<string[]>().notNull().default([]),
    howToUse: text(),
    /** Full INCI list as supplied by the brand, verbatim. */
    ingredientsList: text(),

    suitableSkinTypes: skinTypeEnum().array().notNull().default([]),
    routineStep: routineStepEnum(),

    status: publishStatusEnum().notNull().default('draft'),
    featured: boolean().notNull().default(false),
    /**
     * Merchandising pin for the Best Sellers listing. It is an editorial
     * override, NOT a sales figure: the listing orders flagged products first
     * and then by units actually sold on paid orders, so an unflagged product
     * that genuinely outsells everything still ranks.
     */
    bestSeller: boolean().notNull().default(false),
    /** Surfaces the product in "New & Noteworthy" until this date passes. */
    newUntil: timestamp({ withTimezone: true }),

    /**
     * Denormalised review aggregates. Recomputed inside the same transaction
     * that approves or hides a review, so they can never drift from the rows
     * they summarise.
     */
    ratingAverage: real().notNull().default(0),
    ratingCount: integer().notNull().default(0),

    seoTitle: text(),
    seoDescription: text(),

    deletedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('products_slug_unique').on(t.slug),
    index('products_brand_id_idx').on(t.brandId),
    index('products_category_id_idx').on(t.categoryId),
    // The PLP's hot path: published, not deleted, newest first.
    index('products_status_created_idx').on(t.status, t.deletedAt, t.createdAt),
    index('products_featured_idx').on(t.featured),
    index('products_best_seller_idx').on(t.bestSeller),
  ],
);

/* --- variants ------------------------------------------------------------- */

export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),

    /** Human SKU, printed on picking slips. Globally unique. */
    sku: text().notNull(),

    /** Variant label as shown to the customer: "30ml", "Deep Sand". */
    name: text().notNull(),
    /** Optional second axis, e.g. size + shade. */
    optionLabel: text(),

    /** List price in cents. Never null — this is the price of record. */
    price: integer().notNull(),
    /** Active sale price in cents. Null means not on sale. */
    salePrice: integer(),
    /** Struck-through RRP for comparison, when the brand publishes one. */
    compareAtPrice: integer(),

    /** Grams — used by shipping rate calculation. */
    weightGrams: integer(),
    /** Millilitres or grams of product, for the "per 100ml" unit price. */
    volumeMl: real(),

    barcode: text(),
    imageUrl: text(),

    status: publishStatusEnum().notNull().default('published'),
    isDefault: boolean().notNull().default(false),
    sortOrder: integer().notNull().default(0),

    deletedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('product_variants_sku_unique').on(t.sku),
    index('product_variants_product_id_idx').on(t.productId),
    index('product_variants_price_idx').on(t.price),
  ],
);

/* --- media ---------------------------------------------------------------- */

export const mediaKindEnum = pgEnum('media_kind', ['image', 'video']);

export const productMedia = pgTable(
  'product_media',
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    /** Null means the asset represents the product as a whole. */
    variantId: uuid().references(() => productVariants.id, {
      onDelete: 'cascade',
    }),

    kind: mediaKindEnum().notNull().default('image'),
    url: text().notNull(),
    /** Poster frame for video assets. */
    posterUrl: text(),

    /**
     * Alt text is NOT optional for images. An empty string is only valid for a
     * decorative asset and must be set deliberately in the admin.
     */
    alt: text().notNull().default(''),

    width: integer(),
    height: integer(),
    sortOrder: integer().notNull().default(0),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('product_media_product_id_idx').on(t.productId, t.sortOrder),
    index('product_media_variant_id_idx').on(t.variantId),
  ],
);

/* --- join tables ---------------------------------------------------------- */

export const productConcerns = pgTable(
  'product_concerns',
  {
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    concernId: uuid()
      .notNull()
      .references(() => concerns.id, { onDelete: 'cascade' }),
    /** 1–10 relevance, used to rank results on a concern landing page. */
    relevance: integer().notNull().default(5),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.concernId] }),
    index('product_concerns_concern_idx').on(t.concernId, t.relevance),
  ],
);

export const productIngredients = pgTable(
  'product_ingredients',
  {
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    ingredientId: uuid()
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
    /** Marks the two or three ingredients worth calling out on the PDP. */
    isKeyIngredient: boolean().notNull().default(false),
    concentration: text(),
    sortOrder: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.ingredientId] }),
    index('product_ingredients_ingredient_idx').on(t.ingredientId),
  ],
);

export const productCollections = pgTable(
  'product_collections',
  {
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    collectionId: uuid()
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    sortOrder: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.collectionId] }),
    index('product_collections_collection_idx').on(t.collectionId, t.sortOrder),
  ],
);

/**
 * Curated cross-sell. `kind` separates "Complete the Routine" (the next step
 * in a regimen) from generic "You may also like", so the PDP can render them
 * as two distinct, honestly-labelled modules.
 */
export const productRelationKindEnum = pgEnum('product_relation_kind', [
  'routine',
  'related',
  'frequently_paired',
]);

export const productRelations = pgTable(
  'product_relations',
  {
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    relatedProductId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    kind: productRelationKindEnum().notNull().default('related'),
    sortOrder: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.relatedProductId, t.kind] }),
    index('product_relations_product_kind_idx').on(t.productId, t.kind),
  ],
);

/* --- relations ------------------------------------------------------------ */

export const brandsRelations = relations(brands, ({ many }) => ({
  products: many(products),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: 'category_parent',
  }),
  children: many(categories, { relationName: 'category_parent' }),
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  brand: one(brands, { fields: [products.brandId], references: [brands.id] }),
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  variants: many(productVariants),
  media: many(productMedia),
  concerns: many(productConcerns),
  ingredients: many(productIngredients),
  collections: many(productCollections),
}));

export const productVariantsRelations = relations(
  productVariants,
  ({ one }) => ({
    product: one(products, {
      fields: [productVariants.productId],
      references: [products.id],
    }),
  }),
);

export const productMediaRelations = relations(productMedia, ({ one }) => ({
  product: one(products, {
    fields: [productMedia.productId],
    references: [products.id],
  }),
}));

export const productConcernsRelations = relations(
  productConcerns,
  ({ one }) => ({
    product: one(products, {
      fields: [productConcerns.productId],
      references: [products.id],
    }),
    concern: one(concerns, {
      fields: [productConcerns.concernId],
      references: [concerns.id],
    }),
  }),
);

export const productIngredientsRelations = relations(
  productIngredients,
  ({ one }) => ({
    product: one(products, {
      fields: [productIngredients.productId],
      references: [products.id],
    }),
    ingredient: one(ingredients, {
      fields: [productIngredients.ingredientId],
      references: [ingredients.id],
    }),
  }),
);

export const productCollectionsRelations = relations(
  productCollections,
  ({ one }) => ({
    product: one(products, {
      fields: [productCollections.productId],
      references: [products.id],
    }),
    collection: one(collections, {
      fields: [productCollections.collectionId],
      references: [collections.id],
    }),
  }),
);

export const collectionsRelations = relations(collections, ({ many }) => ({
  products: many(productCollections),
}));

export const concernsRelations = relations(concerns, ({ many }) => ({
  products: many(productConcerns),
}));

export type Brand = typeof brands.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Collection = typeof collections.$inferSelect;
export type Concern = typeof concerns.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductVariant = typeof productVariants.$inferSelect;
export type ProductMedia = typeof productMedia.$inferSelect;
export type Ingredient = typeof ingredients.$inferSelect;
export type MediaKind = (typeof mediaKindEnum.enumValues)[number];
export type PublishStatus = (typeof publishStatusEnum.enumValues)[number];
export type SkinType = (typeof skinTypeEnum.enumValues)[number];
export type RoutineStep = (typeof routineStepEnum.enumValues)[number];
