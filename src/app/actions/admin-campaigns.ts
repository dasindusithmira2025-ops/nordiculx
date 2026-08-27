'use server';

import { revalidatePath } from 'next/cache';
import { eq, ne, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { campaigns, publishStatusEnum } from '@/lib/db/schema';
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
 * Campaign scheduling.
 *
 * `/campaigns/[slug]` already resolves the publish window — a campaign outside
 * `startsAt`/`endsAt` 404s. This is the surface that sets it. Nothing here
 * re-implements the window; the storefront remains the only place it is
 * interpreted.
 *
 * Body copy is edited as text and stored as content blocks, the same as a
 * page. A campaign holding a product grid keeps it: the text form cannot
 * express one, so it is left untouched rather than silently dropped.
 */

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Give the campaign a URL')
  .max(120)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Use lowercase letters, numbers and dashes',
  );

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

const campaignSchema = z
  .object({
    id: z.string(),
    title: z.string().trim().min(1, 'Give the campaign a title').max(200),
    slug: slugSchema,
    subtitle: optionalText(300),
    heroImageUrl: optionalText(400),
    heroImageAlt: optionalText(200),
    heroDark: z.boolean(),
    status: z.enum(publishStatusEnum.enumValues),
    startsAt: optionalDate,
    endsAt: optionalDate,
    seoTitle: optionalText(200),
    seoDescription: optionalText(400),
    body: z.string().max(60_000),
  })
  .superRefine((input, ctx) => {
    if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'The end must come after the start.',
      });
    }
  });

function parse(formData: FormData) {
  return campaignSchema.safeParse({
    id: String(formData.get('id') ?? ''),
    title: String(formData.get('title') ?? ''),
    slug: String(formData.get('slug') ?? ''),
    subtitle: String(formData.get('subtitle') ?? ''),
    heroImageUrl: String(formData.get('heroImageUrl') ?? ''),
    heroImageAlt: String(formData.get('heroImageAlt') ?? ''),
    heroDark: formData.get('heroDark') === 'on',
    status: formData.get('status'),
    startsAt: String(formData.get('startsAt') ?? ''),
    endsAt: String(formData.get('endsAt') ?? ''),
    seoTitle: String(formData.get('seoTitle') ?? ''),
    seoDescription: String(formData.get('seoDescription') ?? ''),
    body: String(formData.get('body') ?? ''),
  });
}

function revalidate(slug: string) {
  revalidatePath('/admin/campaigns');
  revalidatePath(`/campaigns/${slug}`);
  // The homepage can carry a campaign banner section.
  revalidatePath('/', 'layout');
}

export async function saveCampaign(formData: FormData): Promise<ActionResult> {
  const actor = await requireStaff('campaigns.manage');

  const parsed = parse(formData);
  if (!parsed.success) {
    return actionError(
      'Check the highlighted fields.',
      toFieldErrors(parsed.error),
    );
  }

  const { id, body, ...fields } = parsed.data;
  const creating = id === '';

  if (!creating && !uuidSchema.safeParse(id).success) {
    return actionError('That campaign could not be found.');
  }

  // The slug is the public URL, so a clash would silently shadow a live page.
  const clash = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(
      creating
        ? eq(campaigns.slug, fields.slug)
        : and(eq(campaigns.slug, fields.slug), ne(campaigns.id, id)),
    )
    .limit(1);
  if (clash[0]) {
    return actionError('That URL is already taken.', {
      slug: 'That URL is already taken.',
    });
  }

  if (creating) {
    const inserted = await db
      .insert(campaigns)
      .values({ ...fields, body: textToBlocks(body) })
      .returning({ id: campaigns.id });

    await recordAudit({
      actor,
      action: 'campaign.created',
      entityType: 'campaign',
      entityId: inserted[0]!.id,
      changes: { slug: { from: null, to: fields.slug } },
    });
  } else {
    const existing = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, id))
      .limit(1);
    if (!existing[0]) return actionError('That campaign could not be found.');

    // A body carrying a product grid or an image cannot be round-tripped
    // through the text form, so it is preserved exactly as stored.
    const editable = canEditAsText(existing[0].body);

    await db
      .update(campaigns)
      .set({
        ...fields,
        body: editable ? textToBlocks(body) : existing[0].body,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, id));

    await recordAudit({
      actor,
      action: 'campaign.updated',
      entityType: 'campaign',
      entityId: id,
      changes: {
        status: { from: existing[0].status, to: fields.status },
        body: {
          from: blocksToText(existing[0].body).length,
          to: editable ? body.length : blocksToText(existing[0].body).length,
        },
      },
    });

    if (existing[0].slug !== fields.slug) revalidate(existing[0].slug);
  }

  revalidate(fields.slug);
  return actionOk();
}

/**
 * Publishes or unpublishes without touching the schedule.
 *
 * Unpublishing is a status change, not a date change: staff pulling a campaign
 * mid-flight should not lose the window they planned.
 */
export async function setCampaignStatus(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireStaff('campaigns.manage');

  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  if (
    !uuidSchema.safeParse(id).success ||
    !publishStatusEnum.enumValues.includes(
      status as (typeof publishStatusEnum.enumValues)[number],
    )
  ) {
    return actionError('That campaign could not be updated.');
  }

  const updated = await db
    .update(campaigns)
    .set({
      status: status as (typeof publishStatusEnum.enumValues)[number],
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, id))
    .returning({ id: campaigns.id, slug: campaigns.slug });

  if (!updated[0]) return actionError('That campaign could not be found.');

  await recordAudit({
    actor,
    action: 'campaign.status_changed',
    entityType: 'campaign',
    entityId: id,
    changes: { status: { from: null, to: status } },
  });

  revalidate(updated[0].slug);
  return actionOk();
}

/** Ends a running campaign now, without deleting what it was. */
export async function endCampaign(formData: FormData): Promise<ActionResult> {
  const actor = await requireStaff('campaigns.manage');

  const id = String(formData.get('id') ?? '');
  if (!uuidSchema.safeParse(id).success) {
    return actionError('That campaign could not be found.');
  }

  const now = new Date();
  const updated = await db
    .update(campaigns)
    .set({ endsAt: now, updatedAt: now })
    .where(eq(campaigns.id, id))
    .returning({ id: campaigns.id, slug: campaigns.slug });

  if (!updated[0]) return actionError('That campaign could not be found.');

  await recordAudit({
    actor,
    action: 'campaign.ended',
    entityType: 'campaign',
    entityId: id,
    changes: { endsAt: { from: null, to: now.toISOString() } },
  });

  revalidate(updated[0].slug);
  return actionOk();
}
