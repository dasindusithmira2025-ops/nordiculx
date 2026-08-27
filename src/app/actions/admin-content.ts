'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  announcements,
  faqs,
  homepageSections,
  navigationItems,
  navigationLocationEnum,
  pages,
  publishStatusEnum,
} from '@/lib/db/schema';
import { requireStaff } from '@/lib/auth';
import { recordAudit } from '@/lib/admin/audit';
import { blocksToText, canEditAsText, textToBlocks } from '@/lib/content/text';
import {
  actionError,
  actionOk,
  toFieldErrors,
  uuidSchema,
  type ActionResult,
} from '@/lib/validation';

/**
 * Storefront content management.
 *
 * Purpose-built rather than generic: each surface staff actually change —
 * homepage sections, the announcement bar, FAQ entries, policy pages,
 * navigation — gets its own schema and its own revalidation. A generic
 * table editor would be smaller to write and far easier to break a live
 * homepage with.
 *
 * What is NOT editable here is as deliberate as what is. `homepage_sections.kind`
 * and `config` decide which React component renders and what it queries; a
 * free-text edit to either produces a homepage section that throws. Staff
 * change the copy, the image, the order and whether it is shown.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value));

const optionalDate = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : new Date(value)))
  .refine((value) => value === null || !Number.isNaN(value.getTime()), {
    message: 'Enter a valid date and time.',
  });

const sortOrder = z.coerce.number().int().min(0).max(999);

/** Internal path or absolute URL — never `javascript:` or a bare word. */
const hrefSchema = z
  .string()
  .trim()
  .max(300)
  .refine((value) => value === '' || /^(\/|https?:\/\/)/.test(value), {
    message: 'Use a path starting with / or a full https:// address.',
  });

function revalidateStorefront(...paths: string[]) {
  // The announcement bar and navigation live in the storefront layout, so a
  // layout-level revalidation is what makes an edit visible everywhere.
  revalidatePath('/', 'layout');
  for (const path of paths) revalidatePath(path);
}

/* --- homepage sections ---------------------------------------------------- */

const homepageSectionSchema = z.object({
  id: uuidSchema,
  eyebrow: optionalText(120),
  title: optionalText(200),
  description: optionalText(600),
  ctaLabel: optionalText(60),
  ctaHref: hrefSchema,
  imageUrl: optionalText(400),
  imageAlt: optionalText(200),
  dark: z.boolean(),
  enabled: z.boolean(),
  sortOrder,
});

export async function saveHomepageSection(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireStaff('content.manage');

  const parsed = homepageSectionSchema.safeParse({
    id: String(formData.get('id') ?? ''),
    eyebrow: String(formData.get('eyebrow') ?? ''),
    title: String(formData.get('title') ?? ''),
    description: String(formData.get('description') ?? ''),
    ctaLabel: String(formData.get('ctaLabel') ?? ''),
    ctaHref: String(formData.get('ctaHref') ?? ''),
    imageUrl: String(formData.get('imageUrl') ?? ''),
    imageAlt: String(formData.get('imageAlt') ?? ''),
    dark: formData.get('dark') === 'on',
    enabled: formData.get('enabled') === 'on',
    sortOrder: String(formData.get('sortOrder') ?? '0'),
  });
  if (!parsed.success) {
    return actionError(
      'Check the highlighted fields.',
      toFieldErrors(parsed.error),
    );
  }

  const { id, ctaHref, ...rest } = parsed.data;
  const updated = await db
    .update(homepageSections)
    .set({
      ...rest,
      ctaHref: ctaHref === '' ? null : ctaHref,
      updatedAt: new Date(),
    })
    .where(eq(homepageSections.id, id))
    .returning({ id: homepageSections.id });

  if (!updated[0]) return actionError('That section could not be found.');

  await recordAudit({
    actor,
    action: 'content.homepage_section_saved',
    entityType: 'homepage_section',
    entityId: id,
    changes: { enabled: { from: null, to: rest.enabled } },
  });

  revalidateStorefront('/');
  return actionOk();
}

/* --- announcements -------------------------------------------------------- */

const announcementSchema = z.object({
  id: z.string(),
  message: z.string().trim().min(1, 'Write the message').max(200),
  href: hrefSchema,
  enabled: z.boolean(),
  startsAt: optionalDate,
  endsAt: optionalDate,
  sortOrder,
});

export async function saveAnnouncement(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireStaff('content.manage');

  const parsed = announcementSchema.safeParse({
    id: String(formData.get('id') ?? ''),
    message: String(formData.get('message') ?? ''),
    href: String(formData.get('href') ?? ''),
    enabled: formData.get('enabled') === 'on',
    startsAt: String(formData.get('startsAt') ?? ''),
    endsAt: String(formData.get('endsAt') ?? ''),
    sortOrder: String(formData.get('sortOrder') ?? '0'),
  });
  if (!parsed.success) {
    return actionError(
      'Check the highlighted fields.',
      toFieldErrors(parsed.error),
    );
  }

  const { id, href, ...rest } = parsed.data;
  const row = { ...rest, href: href === '' ? null : href };

  // A blank id is the "new" row at the bottom of the list.
  if (id === '') {
    const inserted = await db
      .insert(announcements)
      .values(row)
      .returning({ id: announcements.id });
    await recordAudit({
      actor,
      action: 'content.announcement_created',
      entityType: 'announcement',
      entityId: inserted[0]!.id,
    });
  } else {
    if (!uuidSchema.safeParse(id).success) {
      return actionError('That announcement could not be found.');
    }
    const updated = await db
      .update(announcements)
      .set(row)
      .where(eq(announcements.id, id))
      .returning({ id: announcements.id });
    if (!updated[0])
      return actionError('That announcement could not be found.');
    await recordAudit({
      actor,
      action: 'content.announcement_saved',
      entityType: 'announcement',
      entityId: id,
    });
  }

  revalidateStorefront();
  return actionOk();
}

export async function deleteAnnouncement(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireStaff('content.manage');
  const id = String(formData.get('id') ?? '');
  if (!uuidSchema.safeParse(id).success) {
    return actionError('That announcement could not be found.');
  }

  await db.delete(announcements).where(eq(announcements.id, id));
  await recordAudit({
    actor,
    action: 'content.announcement_deleted',
    entityType: 'announcement',
    entityId: id,
  });

  revalidateStorefront();
  return actionOk();
}

/* --- FAQ ------------------------------------------------------------------ */

const faqSchema = z.object({
  id: z.string(),
  question: z.string().trim().min(1, 'Write the question').max(300),
  answer: z.string().trim().min(1, 'Write the answer').max(4000),
  category: z.string().trim().min(1).max(60),
  enabled: z.boolean(),
  sortOrder,
});

export async function saveFaq(formData: FormData): Promise<ActionResult> {
  const actor = await requireStaff('content.manage');

  const parsed = faqSchema.safeParse({
    id: String(formData.get('id') ?? ''),
    question: String(formData.get('question') ?? ''),
    answer: String(formData.get('answer') ?? ''),
    category: String(formData.get('category') ?? 'general'),
    enabled: formData.get('enabled') === 'on',
    sortOrder: String(formData.get('sortOrder') ?? '0'),
  });
  if (!parsed.success) {
    return actionError(
      'Check the highlighted fields.',
      toFieldErrors(parsed.error),
    );
  }

  const { id, ...row } = parsed.data;

  if (id === '') {
    const inserted = await db
      .insert(faqs)
      .values(row)
      .returning({ id: faqs.id });
    await recordAudit({
      actor,
      action: 'content.faq_created',
      entityType: 'faq',
      entityId: inserted[0]!.id,
    });
  } else {
    if (!uuidSchema.safeParse(id).success) {
      return actionError('That entry could not be found.');
    }
    const updated = await db
      .update(faqs)
      .set({ ...row, updatedAt: new Date() })
      .where(eq(faqs.id, id))
      .returning({ id: faqs.id });
    if (!updated[0]) return actionError('That entry could not be found.');
    await recordAudit({
      actor,
      action: 'content.faq_saved',
      entityType: 'faq',
      entityId: id,
    });
  }

  revalidateStorefront('/faq');
  return actionOk();
}

export async function deleteFaq(formData: FormData): Promise<ActionResult> {
  const actor = await requireStaff('content.manage');
  const id = String(formData.get('id') ?? '');
  if (!uuidSchema.safeParse(id).success) {
    return actionError('That entry could not be found.');
  }

  await db.delete(faqs).where(eq(faqs.id, id));
  await recordAudit({
    actor,
    action: 'content.faq_deleted',
    entityType: 'faq',
    entityId: id,
  });

  revalidateStorefront('/faq');
  return actionOk();
}

/* --- pages ---------------------------------------------------------------- */

const pageSchema = z.object({
  id: uuidSchema,
  title: z.string().trim().min(1, 'Give the page a title').max(200),
  status: z.enum(publishStatusEnum.enumValues),
  requiresLegalReview: z.boolean(),
  seoTitle: optionalText(200),
  seoDescription: optionalText(400),
  body: z.string().max(60_000),
});

export async function savePage(formData: FormData): Promise<ActionResult> {
  const actor = await requireStaff('content.manage');

  const parsed = pageSchema.safeParse({
    id: String(formData.get('id') ?? ''),
    title: String(formData.get('title') ?? ''),
    status: formData.get('status'),
    requiresLegalReview: formData.get('requiresLegalReview') === 'on',
    seoTitle: String(formData.get('seoTitle') ?? ''),
    seoDescription: String(formData.get('seoDescription') ?? ''),
    body: String(formData.get('body') ?? ''),
  });
  if (!parsed.success) {
    return actionError(
      'Check the highlighted fields.',
      toFieldErrors(parsed.error),
    );
  }

  const existing = await db
    .select()
    .from(pages)
    .where(eq(pages.id, parsed.data.id))
    .limit(1);
  if (!existing[0]) return actionError('That page could not be found.');

  // The textarea can only express prose blocks. If the stored body holds an
  // image or a product grid, saving from text would delete it — so the body is
  // left exactly as it is and only the metadata moves.
  const editable = canEditAsText(existing[0].body);
  const body = editable ? textToBlocks(parsed.data.body) : existing[0].body;

  await db
    .update(pages)
    .set({
      title: parsed.data.title,
      status: parsed.data.status,
      requiresLegalReview: parsed.data.requiresLegalReview,
      seoTitle: parsed.data.seoTitle,
      seoDescription: parsed.data.seoDescription,
      body,
      updatedAt: new Date(),
    })
    .where(eq(pages.id, parsed.data.id));

  await recordAudit({
    actor,
    action: 'content.page_saved',
    entityType: 'page',
    entityId: parsed.data.id,
    changes: {
      status: { from: existing[0].status, to: parsed.data.status },
      body: {
        from: blocksToText(existing[0].body).length,
        to: blocksToText(body).length,
      },
    },
  });

  revalidateStorefront(`/${existing[0].slug}`);
  return actionOk();
}

/* --- navigation ----------------------------------------------------------- */

const navigationSchema = z.object({
  id: z.string(),
  location: z.enum(navigationLocationEnum.enumValues),
  label: z.string().trim().min(1, 'Give the link a label').max(80),
  href: hrefSchema.refine((value) => value !== '', {
    message: 'A link needs a destination.',
  }),
  badge: optionalText(20),
  columnGroup: optionalText(60),
  enabled: z.boolean(),
  sortOrder,
});

export async function saveNavigationItem(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireStaff('content.manage');

  const parsed = navigationSchema.safeParse({
    id: String(formData.get('id') ?? ''),
    location: formData.get('location'),
    label: String(formData.get('label') ?? ''),
    href: String(formData.get('href') ?? ''),
    badge: String(formData.get('badge') ?? ''),
    columnGroup: String(formData.get('columnGroup') ?? ''),
    enabled: formData.get('enabled') === 'on',
    sortOrder: String(formData.get('sortOrder') ?? '0'),
  });
  if (!parsed.success) {
    return actionError(
      'Check the highlighted fields.',
      toFieldErrors(parsed.error),
    );
  }

  const { id, ...row } = parsed.data;

  if (id === '') {
    const inserted = await db
      .insert(navigationItems)
      .values(row)
      .returning({ id: navigationItems.id });
    await recordAudit({
      actor,
      action: 'content.navigation_created',
      entityType: 'navigation_item',
      entityId: inserted[0]!.id,
    });
  } else {
    if (!uuidSchema.safeParse(id).success) {
      return actionError('That link could not be found.');
    }
    const updated = await db
      .update(navigationItems)
      // `parentId` is untouched: re-parenting a mega-menu column from a flat
      // table is how a nav ends up as an orphaned cycle.
      .set({ ...row, updatedAt: new Date() })
      .where(eq(navigationItems.id, id))
      .returning({ id: navigationItems.id });
    if (!updated[0]) return actionError('That link could not be found.');
    await recordAudit({
      actor,
      action: 'content.navigation_saved',
      entityType: 'navigation_item',
      entityId: id,
    });
  }

  revalidateStorefront();
  return actionOk();
}

export async function deleteNavigationItem(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireStaff('content.manage');
  const id = String(formData.get('id') ?? '');
  if (!uuidSchema.safeParse(id).success) {
    return actionError('That link could not be found.');
  }

  // Children cascade in the schema, so deleting a mega-menu parent takes its
  // column with it rather than stranding the entries.
  await db.delete(navigationItems).where(eq(navigationItems.id, id));
  await recordAudit({
    actor,
    action: 'content.navigation_deleted',
    entityType: 'navigation_item',
    entityId: id,
  });

  revalidateStorefront();
  return actionOk();
}
