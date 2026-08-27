'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { orders, returnItems, returnRequests } from '@/lib/db/schema';
import { currentUser, requireStaff } from '@/lib/auth';
import { recordAudit } from '@/lib/admin/audit';
import { generateReference } from '@/lib/tokens';
import { rateLimit } from '@/lib/rate-limit';
import { nextStatuses, RETURN_REASONS, returnEligibility } from '@/lib/returns';
import { returnStatusEnum } from '@/lib/db/schema';
import {
  actionError,
  actionOk,
  uuidSchema,
  type ActionResult,
} from '@/lib/validation';

/**
 * Return requests.
 *
 * Ownership is established by loading the order for the signed-in customer —
 * a request never trusts an order id or a return id it was handed. Quantities
 * are re-checked against `returnEligibility` inside the write, so two tabs
 * submitting at once cannot claim the same unit twice.
 */

const requestSchema = z.object({
  reference: z.string().trim().min(1),
  reason: z.enum(RETURN_REASONS),
  note: z.string().trim().max(1000),
});

export async function requestReturn(
  _previous: ActionResult<{ reference: string } | undefined> | null,
  formData: FormData,
): Promise<ActionResult<{ reference: string }>> {
  const user = await currentUser();
  if (!user) return actionError('Sign in to request a return.');

  const limit = await rateLimit('return', {
    limit: 10,
    windowSeconds: 3600,
    key: user.id,
  });
  if (!limit.allowed) {
    return actionError('Too many requests just now. Please try again later.');
  }

  const parsed = requestSchema.safeParse({
    reference: String(formData.get('reference') ?? ''),
    reason: formData.get('reason'),
    note: String(formData.get('note') ?? ''),
  });
  if (!parsed.success) {
    return actionError('Choose a reason for the return.');
  }

  // The ownership check: the order is matched on reference AND user id, so a
  // guessed reference belonging to somebody else simply does not exist here.
  const owned = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.reference, parsed.data.reference),
        eq(orders.userId, user.id),
      ),
    )
    .limit(1);
  const order = owned[0];
  if (!order) return actionError('That order could not be found.');

  // Quantities are read from the form but bounded by what is actually
  // returnable — a hand-edited quantity is clamped, never trusted.
  const eligibility = await returnEligibility(order.id);
  if (!eligibility.eligible) {
    return actionError(
      eligibility.reason === 'window_closed'
        ? 'The return window for this order has closed.'
        : eligibility.reason === 'nothing_left'
          ? 'Everything on this order has already been returned.'
          : 'Returns open once an order has been delivered.',
    );
  }

  const lines = eligibility.items.flatMap((item) => {
    const raw = Number(formData.get(`qty:${item.orderItemId}`) ?? 0);
    const quantity = Math.min(
      item.returnable,
      Number.isInteger(raw) && raw > 0 ? raw : 0,
    );
    return quantity > 0 ? [{ orderItemId: item.orderItemId, quantity }] : [];
  });

  if (lines.length === 0) {
    return actionError('Choose at least one item to return.');
  }

  const reference = generateReference('NLR');

  await db.transaction(async (tx) => {
    const [request] = await tx
      .insert(returnRequests)
      .values({
        reference,
        orderId: order.id,
        userId: user.id,
        reason: parsed.data.reason,
        customerNote: parsed.data.note || null,
        status: 'requested',
      })
      .returning({ id: returnRequests.id });

    await tx
      .insert(returnItems)
      .values(lines.map((line) => ({ ...line, returnRequestId: request!.id })));
  });

  revalidatePath(`/account/orders/${parsed.data.reference}`);
  revalidatePath('/admin/returns');
  return actionOk({ reference });
}

/* --- admin ---------------------------------------------------------------- */

const decisionSchema = z.object({
  id: uuidSchema,
  status: z.enum(returnStatusEnum.enumValues),
  staffNote: z.string().trim().max(1000),
  refundAmount: z
    .string()
    .trim()
    .transform((value) =>
      value === '' ? null : Math.round(Number(value) * 100),
    )
    .refine(
      (value) => value === null || (Number.isInteger(value) && value >= 0),
      { message: 'Enter a valid refund amount.' },
    ),
});

/** Moves a return along its workflow. */
export async function decideReturn(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireStaff('returns.manage');

  const parsed = decisionSchema.safeParse({
    id: String(formData.get('id') ?? ''),
    status: formData.get('status'),
    staffNote: String(formData.get('staffNote') ?? ''),
    refundAmount: String(formData.get('refundAmount') ?? ''),
  });
  if (!parsed.success) {
    return actionError('That return could not be updated.');
  }

  const rows = await db
    .select({
      id: returnRequests.id,
      status: returnRequests.status,
      orderId: returnRequests.orderId,
    })
    .from(returnRequests)
    .where(eq(returnRequests.id, parsed.data.id))
    .limit(1);
  const request = rows[0];
  if (!request) return actionError('That return could not be found.');

  // The transition table is the authority, not the form: a rejected or
  // refunded return is terminal, so a stale page cannot refund one twice.
  if (!nextStatuses(request.status).includes(parsed.data.status)) {
    return actionError(
      `A ${request.status} return cannot be moved to ${parsed.data.status}.`,
    );
  }

  const now = new Date();
  await db
    .update(returnRequests)
    .set({
      status: parsed.data.status,
      staffNote: parsed.data.staffNote || null,
      reviewedBy: actor.id,
      reviewedAt: now,
      refundAmount: parsed.data.refundAmount,
      refundedAt: parsed.data.status === 'refunded' ? now : null,
      updatedAt: now,
    })
    .where(eq(returnRequests.id, request.id));

  await recordAudit({
    actor,
    action: 'return.status_changed',
    entityType: 'return_request',
    entityId: request.id,
    changes: { status: { from: request.status, to: parsed.data.status } },
  });

  const order = await db
    .select({ reference: orders.reference })
    .from(orders)
    .where(eq(orders.id, request.orderId))
    .limit(1);

  revalidatePath('/admin/returns');
  if (order[0]) revalidatePath(`/account/orders/${order[0].reference}`);
  return actionOk();
}
