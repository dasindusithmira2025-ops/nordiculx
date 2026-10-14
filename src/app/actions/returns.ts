'use server';

import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  orderItems,
  orders,
  returnItems,
  returnRequests,
} from '@/lib/db/schema';
import { currentUser, requireStaff } from '@/lib/auth';
import { recordAudit } from '@/lib/admin/audit';
import { generateReference } from '@/lib/tokens';
import { rateLimit } from '@/lib/rate-limit';
import { nextStatuses, RETURN_REASONS, returnEligibility } from '@/lib/returns';
import { returnStatusEnum } from '@/lib/db/schema';
import {
  actionError,
  actionOk,
  toFieldErrors,
  uuidSchema,
  type ActionResult,
} from '@/lib/validation';
import { parseMoneyInput } from '@/lib/money';
import {
  RefundAccountingError,
  recordCompletedRefund,
} from '@/lib/payments/refunds';

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

  // The order row lock serialises return claims for a single order. The
  // eligibility read follows that lock, so a second tab sees the first request
  // before it can insert overlapping return items.
  const result:
    | { ok: true; reference: string; orderReference: string }
    | { ok: false; error: string } = await db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.reference, parsed.data.reference),
          eq(orders.userId, user.id),
        ),
      )
      .for('update')
      .limit(1);
    const order = owned[0];
    if (!order) return { ok: false, error: 'That order could not be found.' };

    const eligibility = await returnEligibility(order.id);
    if (!eligibility.eligible) {
      return {
        ok: false,
        error:
          eligibility.reason === 'window_closed'
            ? 'The return window for this order has closed.'
            : eligibility.reason === 'nothing_left'
              ? 'Everything on this order has already been returned.'
              : 'Returns open once an order has been delivered.',
      };
    }

    // Quantities are read from the form but bounded by what is actually
    // returnable — a hand-edited quantity is clamped, never trusted.
    const lines = eligibility.items.flatMap((item) => {
      const raw = Number(formData.get(`qty:${item.orderItemId}`) ?? 0);
      const quantity = Math.min(
        item.returnable,
        Number.isInteger(raw) && raw > 0 ? raw : 0,
      );
      return quantity > 0 ? [{ orderItemId: item.orderItemId, quantity }] : [];
    });
    if (lines.length === 0) {
      return { ok: false, error: 'Choose at least one item to return.' };
    }

    const reference = generateReference('NLR');
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
    if (!request) throw new Error('Return request could not be created.');

    await tx
      .insert(returnItems)
      .values(lines.map((line) => ({ ...line, returnRequestId: request.id })));
    return { ok: true, reference, orderReference: parsed.data.reference };
  });

  if (!result.ok) return actionError(result.error);
  revalidatePath(`/account/orders/${result.orderReference}`);
  revalidatePath('/admin/returns');
  return actionOk({ reference: result.reference });
}

/* --- admin ---------------------------------------------------------------- */

const decisionSchema = z
  .object({
    id: uuidSchema,
    status: z.enum(returnStatusEnum.enumValues),
    staffNote: z.string().trim().max(1000),
    refundAmount: z
      .string()
      .trim()
      .transform((value) => (value === '' ? null : parseMoneyInput(value)))
      .refine(
        (value) => value === null || (Number.isInteger(value) && value > 0),
        { message: 'Enter a valid refund amount.' },
      ),
  })
  .superRefine((value, context) => {
    if (value.status === 'refunded' && value.refundAmount === null) {
      context.addIssue({
        code: 'custom',
        path: ['refundAmount'],
        message:
          'Enter the amount already refunded through the payment provider.',
      });
    }
  });

/** Moves a return along its workflow and records an already-completed refund. */
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
    return actionError(
      'That return could not be updated.',
      toFieldErrors(parsed.error),
    );
  }

  let result: { ok: true; reference: string } | { ok: false; error: string };
  try {
    result = await db.transaction(async (tx) => {
      const requests = await tx
        .select({
          id: returnRequests.id,
          status: returnRequests.status,
          orderId: returnRequests.orderId,
          refundAmount: returnRequests.refundAmount,
          refundedAt: returnRequests.refundedAt,
        })
        .from(returnRequests)
        .where(eq(returnRequests.id, parsed.data.id))
        .for('update')
        .limit(1);
      const request = requests[0];
      if (!request) {
        return { ok: false, error: 'That return could not be found.' };
      }
      if (!nextStatuses(request.status).includes(parsed.data.status)) {
        return {
          ok: false,
          error: `A ${request.status} return cannot be moved to ${parsed.data.status}.`,
        };
      }

      const orderRows = await tx
        .select({ reference: orders.reference })
        .from(orders)
        .where(eq(orders.id, request.orderId))
        .for('update')
        .limit(1);
      const order = orderRows[0];
      if (!order) return { ok: false, error: 'Order not found.' };

      if (parsed.data.status === 'refunded') {
        const eligibleRows = await tx
          .select({
            value: sql<number>`COALESCE(SUM(${returnItems.quantity} * ${orderItems.unitPrice}), 0)::int`,
          })
          .from(returnItems)
          .innerJoin(orderItems, eq(orderItems.id, returnItems.orderItemId))
          .where(eq(returnItems.returnRequestId, request.id));
        const eligibleAmount = eligibleRows[0]?.value ?? 0;
        if (parsed.data.refundAmount! > eligibleAmount) {
          return {
            ok: false,
            error: 'The refund cannot exceed the returned items’ value.',
          };
        }
        await recordCompletedRefund(tx, {
          orderId: request.orderId,
          amount: parsed.data.refundAmount!,
        });
      }

      const now = new Date();
      await tx
        .update(returnRequests)
        .set({
          status: parsed.data.status,
          staffNote: parsed.data.staffNote || null,
          reviewedBy: actor.id,
          reviewedAt: now,
          refundAmount:
            parsed.data.status === 'refunded'
              ? parsed.data.refundAmount
              : request.refundAmount,
          refundedAt:
            parsed.data.status === 'refunded' ? now : request.refundedAt,
          updatedAt: now,
        })
        .where(eq(returnRequests.id, request.id));

      await recordAudit({
        actor,
        action: 'return.status_changed',
        entityType: 'return_request',
        entityId: request.id,
        changes: {
          status: { from: request.status, to: parsed.data.status },
          ...(parsed.data.status === 'refunded'
            ? {
                refundAmount: {
                  from: request.refundAmount,
                  to: parsed.data.refundAmount,
                },
              }
            : {}),
        },
        tx,
      });

      return { ok: true, reference: order.reference };
    });
  } catch (error) {
    if (error instanceof RefundAccountingError) {
      return actionError(error.message);
    }
    throw error;
  }

  if (!result.ok) return actionError(result.error);
  revalidatePath('/admin/returns');
  revalidatePath(`/account/orders/${result.reference}`);
  return actionOk();
}

const cancelledOrderRefundSchema = z.object({
  reference: z.string().trim().min(1).max(40),
  refundAmount: z
    .string()
    .trim()
    .transform((value) => parseMoneyInput(value))
    .refine(
      (value): value is number =>
        value !== null && Number.isInteger(value) && value > 0,
      { message: 'Enter a refund amount greater than zero.' },
    ),
});

/**
 * Records a refund completed in the payment provider for a cancelled order.
 * Provider refund APIs are intentionally not invoked here: only a verified
 * provider result may be represented as money returned to the customer.
 */
export async function recordCancelledOrderRefund(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireStaff('returns.manage');
  const parsed = cancelledOrderRefundSchema.safeParse({
    reference: String(formData.get('reference') ?? ''),
    refundAmount: String(formData.get('refundAmount') ?? ''),
  });
  if (!parsed.success) {
    return actionError(
      'That refund could not be recorded.',
      toFieldErrors(parsed.error),
    );
  }

  try {
    const result:
      { ok: true; reference: string } | { ok: false; error: string } =
      await db.transaction(async (tx) => {
        const orderRows = await tx
          .select({
            id: orders.id,
            status: orders.status,
            paymentStatus: orders.paymentStatus,
          })
          .from(orders)
          .where(eq(orders.reference, parsed.data.reference))
          .for('update')
          .limit(1);
        const order = orderRows[0];
        if (!order) return { ok: false, error: 'Order not found.' };
        if (order.status !== 'cancelled') {
          return {
            ok: false,
            error: 'Only a cancelled order can be refunded from this screen.',
          };
        }

        const refund = await recordCompletedRefund(tx, {
          orderId: order.id,
          amount: parsed.data.refundAmount,
        });
        await recordAudit({
          actor,
          action: 'order.refund_recorded',
          entityType: 'order',
          entityId: order.id,
          changes: {
            paymentStatus: {
              from: order.paymentStatus,
              to: refund.paymentStatus,
            },
            refundedAmount: {
              from: refund.previousRefundedAmount,
              to: refund.refundedAmount,
            },
          },
          tx,
        });
        return { ok: true, reference: refund.reference };
      });

    if (!result.ok) return actionError(result.error);
    revalidatePath('/admin/orders');
    revalidatePath(`/admin/orders/${result.reference}`);
    revalidatePath(`/account/orders/${result.reference}`);
    return actionOk();
  } catch (error) {
    if (error instanceof RefundAccountingError) {
      return actionError(error.message);
    }
    throw error;
  }
}
