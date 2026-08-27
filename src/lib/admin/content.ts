import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  announcements,
  campaigns,
  faqs,
  homepageSections,
  navigationItems,
  pages,
} from '@/lib/db/schema';

/**
 * Content read models for the admin.
 *
 * Deliberately narrow: these are lists staff edit, not a generic CMS query
 * layer. Every one returns the whole (small) table in display order, because
 * paginating a nine-row homepage is more chrome than help.
 *
 * Authorisation happens in the caller (`requireStaff('content.manage')`).
 */

export function listHomepageSections() {
  return db
    .select()
    .from(homepageSections)
    .orderBy(asc(homepageSections.sortOrder));
}

export function listAnnouncements() {
  return db
    .select()
    .from(announcements)
    .orderBy(asc(announcements.sortOrder), asc(announcements.createdAt));
}

export function listFaqs() {
  return db
    .select()
    .from(faqs)
    .orderBy(asc(faqs.category), asc(faqs.sortOrder));
}

export function listPages() {
  return db
    .select({
      id: pages.id,
      title: pages.title,
      slug: pages.slug,
      status: pages.status,
      requiresLegalReview: pages.requiresLegalReview,
      updatedAt: pages.updatedAt,
    })
    .from(pages)
    .orderBy(asc(pages.slug));
}

export async function getPage(id: string) {
  const rows = await db.select().from(pages).where(eq(pages.id, id)).limit(1);
  return rows[0] ?? null;
}

export function listNavigationItems() {
  return db
    .select()
    .from(navigationItems)
    .orderBy(
      asc(navigationItems.location),
      asc(navigationItems.sortOrder),
      asc(navigationItems.label),
    );
}

export function listCampaigns() {
  return db
    .select({
      id: campaigns.id,
      title: campaigns.title,
      slug: campaigns.slug,
      subtitle: campaigns.subtitle,
      status: campaigns.status,
      startsAt: campaigns.startsAt,
      endsAt: campaigns.endsAt,
      updatedAt: campaigns.updatedAt,
    })
    .from(campaigns)
    .orderBy(asc(campaigns.startsAt), asc(campaigns.title));
}

export async function getCampaign(id: string) {
  const rows = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, id))
    .limit(1);
  return rows[0] ?? null;
}
