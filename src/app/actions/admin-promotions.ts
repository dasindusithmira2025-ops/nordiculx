'use server';

import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  promotions,
  promotionScopeEnum,
  promotionTypeEnum,
} from '@/lib/db/schema';
import { requireStaff } from '@/lib/auth';
import { diff, recordAudit } from '@/lib/admin/audit';
import { parseMoneyInput } from '@/lib/money';
import {
  actionError,
  actionOk,
  toFieldErrors,
  uuidSchema,
  type ActionResult,
} from '@/lib/validation';

/**
 * Promotion management.
 *
 * The discount engine (`src/lib/cart/pricing.ts`) already decides what a
 * promotion is worth and whether it may be applied; nothing here re-implements
 * that. This is the operational surface that was missing: until now the only
 * way to create a code was to edit the seed script.
 *
 * `usageCount` is deliberately not editable. It is the counter checkout
 * enforces limits against, incremented transactionally at order creation, and
 * letting staff type over it would let a spent code be silently re-armed.
 */

const money = z
  .string()
  .trim()
  .transform((value) => (value === '' ? 0 : parseMoneyInput(value)))
  .refine((value): value is number => Number.isInteger(value) && value! >= 0, {
    message: 'Enter a valid LKR amount.',
  });

const optionalMoney = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : parseMoneyInput(value)))
  .refine(
    (value) => value === null || (Number.isInteger(value) && value >= 0),
    { message: 'Enter a valid LKR amount.' },
  );

const optionalCount = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : Number(value)))
  .refine(
    (value) => value === null || (Number.isInteger(value) && value >= 1),
    {
      message: 'Enter a whole number of uses, or leave blank for unlimited.',
    },
  );

/**
 * `datetime-local` submits wall-clock time with no zone, so parsing it through
 * `new Date()` reads it in the server's own zone — which is what staff mean
 * when they schedule a sale.
 */
const optionalDate = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : new Date(value)))
  .refine((value) => value === null || !Number.isNaN(value.getTime()), {
    message: 'Enter a valid date and time.',
  });

/** Uppercased on the way in, matching how checkout looks a code up. */
const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .max(40, 'That code is too long')
  .regex(
    /^[A-Z0-9._-]*$/,
    'Use letters, numbers, dot, dash or underscore only',
  );

const promotionSchema = z
  .object({
    code: codeSchema,
    name: z.string().trim().min(1, 'Give the promotion a name').max(120),
    description: z.string().trim().max(500),
    type: z.enum(promotionTypeEnum.enumValues),
    scope: z.enum(promotionScopeEnum.enumValues),
    percentage: z.coerce.number().int().min(0).max(100),
    amount: money,
    minimumSubtotal: money,
    maximumDiscount: optionalMoney,
    targetIds: z.array(uuidSchema),
    startsAt: optionalDate,
    endsAt: optionalDate,
    usageLimit: optionalCount,
    usageLimitPerCustomer: optionalCount,
    enabled: z.boolean(),
  })
  .superRefine((input, ctx) => {
    if (input.type === 'percentage' && input.percentage < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['percentage'],
        message: 'A percentage promotion needs a value of at least 1%.',
      });
    }
    if (input.type === 'fixed_amount' && input.amount < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['amount'],
        message: 'A fixed-amount promotion needs a value above zero.',
      });
    }
    if (input.scope !== 'order' && input.targetIds.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['targetIds'],
        message: 'Choose at least one thing for this promotion to apply to.',
      });
    }
    if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'The end must come after the start.',
      });
    }
  });

function parse(formData: FormData) {
  return promotionSchema.safeParse({
    code: String(formData.get('code') ?? ''),
    name: String(formData.get('name') ?? ''),
    description: String(formData.get('description') ?? ''),
    type: formData.get('type'),
    scope: formData.get('scope'),
    percentage: String(formData.get('percentage') ?? '0'),
    amount: String(formData.get('amount') ?? ''),
    minimumSubtotal: String(formData.get('minimumSubtotal') ?? ''),
    maximumDiscount: String(formData.get('maximumDiscount') ?? ''),
    targetIds: formData.getAll('targetIds').map(String).filter(Boolean),
    startsAt: String(formData.get('startsAt') ?? ''),
    endsAt: String(formData.get('endsAt') ?? ''),
    usageLimit: String(formData.get('usageLimit') ?? ''),
    usageLimitPerCustomer: String(formData.get('usageLimitPerCustomer') ?? ''),
    enabled: formData.get('enabled') === 'on',
  });
}

/** The stored shape, with the two value inputs collapsed into one column. */
function toRow(input: z.infer<typeof promotionSchema>) {
  return {
    code: input.code === '' ? null : input.code,
    name: input.name,
    description: input.description === '' ? null : input.description,
    type: input.type,
    scope: input.scope,
    value:
      input.type === 'percentage'
        ? input.percentage
        : input.type === 'fixed_amount'
          ? input.amount
          : 0,
    minimumSubtotal: input.minimumSubtotal,
    maximumDiscount: input.maximumDiscount,
    // A promotion scoped to the whole order has nothing to target, so stored
    // ids would be dead data the pricing engine never reads.
    targetIds: input.scope === 'order' ? [] : input.targetIds,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    usageLimit: input.usageLimit,
    usageLimitPerCustomer: input.usageLimitPerCustomer,
    enabled: input.enabled,
    updatedAt: new Date(),
  };
}

function revalidate() {
  revalidatePath('/admin/promotions');
  // The bag and checkout both display an applied promotion, so a code turned
  // off has to stop working on the next render, not at the next deploy.
  revalidatePath('/cart');
  revalidatePath('/checkout');
}

export async function createPromotion(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const actor = await requireStaff('promotions.manage');

  const parsed = parse(formData);
  if (!parsed.success) {
    return actionError(
      'Check the highlighted fields.',
      toFieldErrors(parsed.error),
    );
  }

  const row = toRow(parsed.data);
  if (row.code) {
    const clash = await db
      .select({ id: promotions.id })
      .from(promotions)
      .where(eq(promotions.code, row.code))
      .limit(1);
    if (clash[0]) {
      return actionError('That code is already in use.', {
        code: 'That code is already in use.',
      });
    }
  }

  const inserted = await db
    .insert(promotions)
    .values(row)
    .returning({ id: promotions.id });

  await recordAudit({
    actor,
    action: 'promotion.created',
    entityType: 'promotion',
    entityId: inserted[0]!.id,
    changes: {
      code: { from: null, to: row.code },
      name: { from: null, to: row.name },
    },
  });

  revalidate();
  return actionOk({ id: inserted[0]!.id });
}

export async function updatePromotion(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireStaff('promotions.manage');

  const id = String(formData.get('id') ?? '');
  if (!uuidSchema.safeParse(id).success) {
    return actionError('That promotion could not be found.');
  }

  const parsed = parse(formData);
  if (!parsed.success) {
    return actionError(
      'Check the highlighted fields.',
      toFieldErrors(parsed.error),
    );
  }

  const before = await db
    .select()
    .from(promotions)
    .where(eq(promotions.id, id))
    .limit(1);
  if (!before[0]) return actionError('That promotion could not be found.');

  const row = toRow(parsed.data);
  if (row.code && row.code !== before[0].code) {
    const clash = await db
      .select({ id: promotions.id })
      .from(promotions)
      .where(eq(promotions.code, row.code))
      .limit(1);
    if (clash[0]) {
      return actionError('That code is already in use.', {
        code: 'That code is already in use.',
      });
    }
  }

  await db.update(promotions).set(row).where(eq(promotions.id, id));

  await recordAudit({
    actor,
    action: 'promotion.updated',
    entityType: 'promotion',
    entityId: id,
    changes: diff(before[0] as unknown as Record<string, unknown>, {
      code: row.code,
      name: row.name,
      type: row.type,
      scope: row.scope,
      value: row.value,
      enabled: row.enabled,
    }),
  });

  revalidate();
  return actionOk();
}

/** Turns a promotion on or off without touching its schedule or usage. */
export async function setPromotionEnabled(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireStaff('promotions.manage');

  const id = String(formData.get('id') ?? '');
  const enabled = formData.get('enabled') === 'true';
  if (!uuidSchema.safeParse(id).success) {
    return actionError('That promotion could not be found.');
  }

  const updated = await db
    .update(promotions)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(promotions.id, id))
    .returning({ id: promotions.id });

  if (!updated[0]) return actionError('That promotion could not be found.');

  await recordAudit({
    actor,
    action: enabled ? 'promotion.enabled' : 'promotion.disabled',
    entityType: 'promotion',
    entityId: id,
    changes: { enabled: { from: !enabled, to: enabled } },
  });

  revalidate();
  return actionOk();
}

/**
 * Ends a promotion now.
 *
 * Closes the window rather than deleting the row: orders reference
 * `promotion_id`, and deleting would orphan the discount on every order that
 * used it. Disabling as well as dating it out means it stops applying even if
 * someone later widens the window back open.
 */
export async function expirePromotion(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireStaff('promotions.manage');

  const id = String(formData.get('id') ?? '');
  if (!uuidSchema.safeParse(id).success) {
    return actionError('That promotion could not be found.');
  }

  const now = new Date();
  const updated = await db
    .update(promotions)
    .set({
      enabled: false,
      endsAt: sql`LEAST(COALESCE(${promotions.endsAt}, ${now}), ${now})`,
      updatedAt: now,
    })
    .where(eq(promotions.id, id))
    .returning({ id: promotions.id });

  if (!updated[0]) return actionError('That promotion could not be found.');

  await recordAudit({
    actor,
    action: 'promotion.expired',
    entityType: 'promotion',
    entityId: id,
    changes: { endsAt: { from: null, to: now.toISOString() } },
  });

  revalidate();
  return actionOk();
}
