import 'server-only';
import { cache } from 'react';
import { and, asc, desc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import { PAID_SALE } from './sales';
import {
  announcements,
  articleProducts,
  articles,
  articleTopics,
  brands,
  campaigns,
  categories,
  collections,
  concerns,
  faqs,
  homepageSections,
  navigationItems,
  pages,
} from '@/lib/db/schema';

/**
 * Taxonomy, navigation and content queries.
 *
 * Everything here is wrapped in React `cache()`: the header, footer and page
 * body all need navigation, and without deduping a single render would issue
 * the same query three times.
 */

/**
 * A record is live when it is published AND inside its schedule window.
 *
 * Typed against `AnyPgColumn` so the same helper serves campaigns, homepage
 * sections and announcements — three tables with identical scheduling
 * semantics and, before this, three chances to get the comparison backwards.
 */
function withinWindow(startsAt: AnyPgColumn, endsAt: AnyPgColumn) {
  const now = new Date();
  return and(
    or(isNull(startsAt), lte(startsAt, now)),
    or(isNull(endsAt), gt(endsAt, now)),
  );
}

/* --- brands --------------------------------------------------------------- */

export const getBrands = cache(async () => {
  return db
    .select({
      id: brands.id,
      name: brands.name,
      slug: brands.slug,
      tagline: brands.tagline,
      description: brands.description,
      originCountry: brands.originCountry,
      logoUrl: brands.logoUrl,
      heroImageUrl: brands.heroImageUrl,
      featured: brands.featured,
      // The outer column is written literally as `brands.id`, NOT interpolated
      // as ${brands.id}. Drizzle renders an interpolated column unqualified
      // ("id") when the outer query has a single table, and inside a subquery
      // that introduces `products p` the bare "id" silently resolves to
      // products.id — matching nothing and returning 0 with no error.
      productCount: sql<number>`(
        SELECT COUNT(*)::int FROM products p
        WHERE p.brand_id = brands.id
          AND p.status = 'published' AND p.deleted_at IS NULL
      )`,
    })
    .from(brands)
    .where(eq(brands.status, 'published'))
    .orderBy(asc(brands.name));
});

/**
 * Brands ordered by what customers have actually bought.
 *
 * Three tiers, in this order:
 *
 *   1. a manual merchandising pin — `brands.merchandising_rank`, set on
 *      /admin/brands and NULL for almost every brand. Merchandising sometimes
 *      needs a brand at the front for a reason the order book cannot know (a
 *      launch, an exclusivity window), and the honest way to allow that is an
 *      explicit pin rather than a fudged sales number;
 *   2. units sold on paid, un-cancelled, un-returned orders;
 *   3. featured, then alphabetical.
 *
 * Tier 3 is what makes this safe on a store with no sales history: the row
 * still fills, it simply falls back to the editorial order instead of
 * rendering empty or inventing figures. Nothing here is ever shown to a
 * customer as a number — the sales data decides the ORDER, and only that.
 */
export const getTopSellingBrands = cache(async (limit = 8) => {
  const rows = (await db.execute(sql`
    SELECT b.id, b.name, b.slug, b.tagline, b.logo_url, b.hero_image_url,
           b.featured, b.merchandising_rank,
           COALESCE(sales.units, 0)::int AS units,
           (SELECT COUNT(*)::int FROM products p
             WHERE p.brand_id = b.id
               AND p.status = 'published' AND p.deleted_at IS NULL
           ) AS product_count
      FROM brands b
      LEFT JOIN LATERAL (
        SELECT SUM(oi.quantity)::int AS units
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          JOIN products p ON p.id = oi.product_id
         WHERE p.brand_id = b.id AND ${PAID_SALE}
      ) sales ON TRUE
     WHERE b.status = 'published'
     ORDER BY b.merchandising_rank ASC NULLS LAST,
              COALESCE(sales.units, 0) DESC,
              b.featured DESC,
              b.name ASC
     LIMIT ${limit}
  `)) as unknown as {
    id: string;
    name: string;
    slug: string;
    tagline: string | null;
    logo_url: string | null;
    hero_image_url: string | null;
    featured: boolean;
    merchandising_rank: number | null;
    units: number;
    product_count: number;
  }[];

  // A brand with nothing published links to an empty page, so it is dropped
  // rather than shown — the row is a shortcut into the catalogue, not a
  // directory of every supplier.
  return rows
    .filter((r) => r.product_count > 0)
    .map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      tagline: r.tagline,
      logoUrl: r.logo_url,
      heroImageUrl: r.hero_image_url,
      featured: r.featured,
      productCount: r.product_count,
    }));
});

export const getBrandBySlug = cache(async (slug: string) => {
  const rows = await db
    .select()
    .from(brands)
    .where(and(eq(brands.slug, slug), eq(brands.status, 'published')))
    .limit(1);
  return rows[0] ?? null;
});

/* --- categories ----------------------------------------------------------- */

export type CategoryNode = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  heroImageUrl: string | null;
  children: CategoryNode[];
};

export const getCategoryTree = cache(async (): Promise<CategoryNode[]> => {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
      heroImageUrl: categories.heroImageUrl,
      parentId: categories.parentId,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .where(eq(categories.status, 'published'))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  const byId = new Map<string, CategoryNode>(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        name: r.name,
        slug: r.slug,
        description: r.description,
        heroImageUrl: r.heroImageUrl,
        children: [],
      },
    ]),
  );

  const roots: CategoryNode[] = [];
  for (const row of rows) {
    const node = byId.get(row.id)!;
    if (row.parentId) {
      byId.get(row.parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
});

export const getCategoryBySlug = cache(async (slug: string) => {
  const rows = await db
    .select()
    .from(categories)
    .where(and(eq(categories.slug, slug), eq(categories.status, 'published')))
    .limit(1);
  return rows[0] ?? null;
});

/* --- concerns and collections --------------------------------------------- */

export const getConcerns = cache(async () => {
  return db
    .select({
      id: concerns.id,
      name: concerns.name,
      slug: concerns.slug,
      description: concerns.description,
      guidance: concerns.guidance,
      imageUrl: concerns.imageUrl,
      // Literal `concerns.id`, not ${concerns.id} — see the note in getBrands.
      productCount: sql<number>`(
        SELECT COUNT(*)::int FROM product_concerns pc
        JOIN products p ON p.id = pc.product_id
        WHERE pc.concern_id = concerns.id
          AND p.status = 'published' AND p.deleted_at IS NULL
      )`,
    })
    .from(concerns)
    .where(eq(concerns.status, 'published'))
    .orderBy(asc(concerns.sortOrder));
});

export const getConcernBySlug = cache(async (slug: string) => {
  const rows = await db
    .select()
    .from(concerns)
    .where(and(eq(concerns.slug, slug), eq(concerns.status, 'published')))
    .limit(1);
  return rows[0] ?? null;
});

export const getCollections = cache(async () => {
  return db
    .select()
    .from(collections)
    .where(eq(collections.status, 'published'))
    .orderBy(asc(collections.sortOrder));
});

export const getCollectionBySlug = cache(async (slug: string) => {
  const rows = await db
    .select()
    .from(collections)
    .where(and(eq(collections.slug, slug), eq(collections.status, 'published')))
    .limit(1);
  return rows[0] ?? null;
});

/* --- navigation ----------------------------------------------------------- */

export type NavItem = {
  id: string;
  label: string;
  href: string;
  badge: string | null;
  columnGroup: string | null;
  children: NavItem[];
};

const buildNav = (
  rows: {
    id: string;
    label: string;
    href: string;
    badge: string | null;
    columnGroup: string | null;
    parentId: string | null;
  }[],
): NavItem[] => {
  const byId = new Map<string, NavItem>(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        label: r.label,
        href: r.href,
        badge: r.badge,
        columnGroup: r.columnGroup,
        children: [],
      },
    ]),
  );
  const roots: NavItem[] = [];
  for (const row of rows) {
    const node = byId.get(row.id)!;
    if (row.parentId) byId.get(row.parentId)?.children.push(node);
    else roots.push(node);
  }
  return roots;
};

/**
 * Published category slugs that actually have something to show.
 *
 * The rule matches `listProducts` exactly — a category counts its children, so
 * "Skincare" is not empty just because nothing is filed directly under it.
 * Anything else and the menu would disagree with the page it links to.
 */
const liveCategorySlugs = cache(async () => {
  const rows = (await db.execute(sql`
    SELECT c.slug FROM categories c
    WHERE c.status = 'published' AND EXISTS (
      SELECT 1 FROM products p
      JOIN categories filed ON filed.id = p.category_id
      WHERE (filed.id = c.id OR filed.parent_id = c.id)
        AND p.status = 'published' AND p.deleted_at IS NULL
    )
  `)) as unknown as { slug: string }[];
  return new Set(rows.map((r) => r.slug));
});

/** `/category/sun-care?sort=newest` -> `sun-care`; anything else -> null. */
const categorySlugOf = (href: string) =>
  href.startsWith('/category/')
    ? (href.slice('/category/'.length).split(/[?#]/)[0] ?? null)
    : null;

export const getNavigation = cache(
  async (location: 'header' | 'footer' | 'mobile' = 'header') => {
    const rows = await db
      .select({
        id: navigationItems.id,
        label: navigationItems.label,
        href: navigationItems.href,
        badge: navigationItems.badge,
        columnGroup: navigationItems.columnGroup,
        parentId: navigationItems.parentId,
      })
      .from(navigationItems)
      .where(
        and(
          eq(navigationItems.location, location),
          eq(navigationItems.enabled, true),
        ),
      )
      .orderBy(asc(navigationItems.sortOrder));

    // A menu entry pointing at a category that is unpublished, deleted or
    // simply carries no products is a dead end — and the catalogue changes far
    // more often than the menu does. Dropping them here rather than in the
    // header covers every caller (header, footer, mobile) and leaves the rows
    // in place, so merchandising still sees them in the admin and they come
    // back on their own once the category has stock. Orphaned children fall
    // out of `buildNav` along with their dropped parent.
    const live = await liveCategorySlugs();
    const reachable = rows.filter((row) => {
      const slug = categorySlugOf(row.href);
      return slug === null || live.has(slug);
    });
    return buildNav(reachable);
  },
);

export const getAnnouncements = cache(async () => {
  return db
    .select({
      id: announcements.id,
      message: announcements.message,
      href: announcements.href,
    })
    .from(announcements)
    .where(
      and(
        eq(announcements.enabled, true),
        withinWindow(announcements.startsAt, announcements.endsAt),
      ),
    )
    .orderBy(asc(announcements.sortOrder));
});

/* --- homepage ------------------------------------------------------------- */

export const getHomepageSections = cache(async () => {
  return db
    .select()
    .from(homepageSections)
    .where(
      and(
        eq(homepageSections.enabled, true),
        withinWindow(homepageSections.startsAt, homepageSections.endsAt),
      ),
    )
    .orderBy(asc(homepageSections.sortOrder));
});

/* --- editorial ------------------------------------------------------------ */

export const getArticles = cache(
  async (
    options: {
      limit?: number;
      topicSlug?: string;
      featuredOnly?: boolean;
    } = {},
  ) => {
    const conditions = [
      eq(articles.status, 'published'),
      lte(articles.publishedAt, new Date()),
    ];
    if (options.featuredOnly) conditions.push(eq(articles.featured, true));

    const query = db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        excerpt: articles.excerpt,
        heroImageUrl: articles.heroImageUrl,
        heroImageAlt: articles.heroImageAlt,
        heroDark: articles.heroDark,
        readingMinutes: articles.readingMinutes,
        publishedAt: articles.publishedAt,
        topicName: articleTopics.name,
        topicSlug: articleTopics.slug,
      })
      .from(articles)
      .leftJoin(articleTopics, eq(articleTopics.id, articles.topicId))
      .where(
        options.topicSlug
          ? and(...conditions, eq(articleTopics.slug, options.topicSlug))
          : and(...conditions),
      )
      .orderBy(desc(articles.publishedAt));

    return options.limit ? query.limit(options.limit) : query;
  },
);

export const getArticleBySlug = cache(async (slug: string) => {
  const rows = await db
    .select({
      article: articles,
      topicName: articleTopics.name,
      topicSlug: articleTopics.slug,
    })
    .from(articles)
    .leftJoin(articleTopics, eq(articleTopics.id, articles.topicId))
    .where(
      and(
        eq(articles.slug, slug),
        eq(articles.status, 'published'),
        lte(articles.publishedAt, new Date()),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
});

export const getArticleTopics = cache(async () => {
  return db.select().from(articleTopics).orderBy(asc(articleTopics.sortOrder));
});

/**
 * Product ids explicitly attached to an article ("Shop the story"), in the
 * editor's order.
 *
 * Returns ids rather than products so the caller can hand them to
 * `getProductsByIds`, which already resolves prices, stock and imagery in one
 * statement — there is no second product-card query to keep in sync.
 */
export const getArticleProductIds = cache(async (articleId: string) => {
  const rows = await db
    .select({ productId: articleProducts.productId })
    .from(articleProducts)
    .where(eq(articleProducts.articleId, articleId))
    .orderBy(asc(articleProducts.sortOrder));
  return rows.map((r) => r.productId);
});

/* --- campaigns ------------------------------------------------------------ */

/** Live campaigns only — the publish window is evaluated at request time. */
export const getLiveCampaigns = cache(async () => {
  return db
    .select()
    .from(campaigns)
    .where(
      and(
        eq(campaigns.status, 'published'),
        withinWindow(campaigns.startsAt, campaigns.endsAt),
      ),
    )
    .orderBy(desc(campaigns.startsAt));
});

export const getCampaignBySlug = cache(async (slug: string) => {
  const rows = await db
    .select()
    .from(campaigns)
    .where(
      and(
        eq(campaigns.slug, slug),
        eq(campaigns.status, 'published'),
        withinWindow(campaigns.startsAt, campaigns.endsAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
});

/* --- static content ------------------------------------------------------- */

export const getPageBySlug = cache(async (slug: string) => {
  const rows = await db
    .select()
    .from(pages)
    .where(and(eq(pages.slug, slug), eq(pages.status, 'published')))
    .limit(1);
  return rows[0] ?? null;
});

export const getFaqs = cache(async () => {
  return db
    .select()
    .from(faqs)
    .where(eq(faqs.enabled, true))
    .orderBy(asc(faqs.category), asc(faqs.sortOrder));
});
