import 'server-only';
import { and, eq, inArray, lt, lte, or, sql } from 'drizzle-orm';
import { createOrderInvoicePdf } from '@/lib/invoices/order-invoice';
import { db } from '@/lib/db';
import { notificationDeliveries } from '@/lib/db/schema';
import { sendMail } from '@/lib/mail';
import { orderConfirmationEmail } from '@/lib/mail/templates';
import { getOrderByReference } from '@/lib/orders';

const MAX_ATTEMPTS = 8;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
const CLAIM_LEASE_MS = 2 * 60_000;

type ClaimedDelivery = {
  id: string;
  orderReference: string;
  channel: string;
  attemptCount: number;
};

async function claimDeliveries(limit: number, orderReference?: string) {
  return db.transaction(async (tx) => {
    const now = new Date();
    const abandonedBefore = new Date(now.getTime() - CLAIM_LEASE_MS);
    const ready = or(
      and(
        eq(notificationDeliveries.status, 'pending'),
        lte(notificationDeliveries.nextAttemptAt, now),
      ),
      and(
        eq(notificationDeliveries.status, 'sending'),
        lt(notificationDeliveries.updatedAt, abandonedBefore),
      ),
    );
    const filter = orderReference
      ? and(ready, eq(notificationDeliveries.orderReference, orderReference))
      : ready;

    const rows = await tx
      .select({
        id: notificationDeliveries.id,
        orderReference: notificationDeliveries.orderReference,
        channel: notificationDeliveries.channel,
        attemptCount: notificationDeliveries.attemptCount,
      })
      .from(notificationDeliveries)
      .where(filter)
      .orderBy(notificationDeliveries.createdAt)
      .limit(limit)
      .for('update', { skipLocked: true });

    if (rows.length === 0) return [] as ClaimedDelivery[];

    const claimedAt = new Date();
    await tx
      .update(notificationDeliveries)
      .set({
        status: 'sending',
        attemptCount: sql`${notificationDeliveries.attemptCount} + 1`,
        updatedAt: claimedAt,
      })
      .where(
        inArray(
          notificationDeliveries.id,
          rows.map((row) => row.id),
        ),
      );

    return rows.map((row) => ({
      ...row,
      attemptCount: row.attemptCount + 1,
    }));
  });
}

async function recordAttempt(
  delivery: ClaimedDelivery,
  sent: boolean,
  reason?: string,
) {
  const now = new Date();
  const exhausted = !sent && delivery.attemptCount >= MAX_ATTEMPTS;
  const delay =
    RETRY_DELAYS_MS[
      Math.min(delivery.attemptCount - 1, RETRY_DELAYS_MS.length - 1)
    ]!;

  await db
    .update(notificationDeliveries)
    .set({
      status: sent ? 'sent' : exhausted ? 'failed' : 'pending',
      sentAt: sent ? now : null,
      nextAttemptAt: sent || exhausted ? now : new Date(now.getTime() + delay),
      lastError: sent ? null : (reason ?? 'delivery failed').slice(0, 500),
      updatedAt: now,
    })
    .where(eq(notificationDeliveries.id, delivery.id));

  if (!sent) {
    console.error(
      `[notification] ${delivery.channel} delivery ${exhausted ? 'gave up' : 'will retry'} for order ${delivery.orderReference} (attempt ${delivery.attemptCount}/${MAX_ATTEMPTS})`,
    );
  }
}

/** Dispatches due paid-order confirmations. A scheduled call recovers failures. */
export async function dispatchPaidOrderNotifications(options?: {
  orderReference?: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(options?.limit ?? 20, 50));
  const deliveries = await claimDeliveries(limit, options?.orderReference);
  const invoiceCache = new Map<string, Promise<Buffer>>();
  let sent = 0;
  let failed = 0;

  for (let start = 0; start < deliveries.length; start += 5) {
    const batch = deliveries.slice(start, start + 5);
    const outcomes = await Promise.all(
      batch.map(async (delivery) => {
        try {
          if (delivery.channel !== 'email') {
            const now = new Date();
            await db
              .update(notificationDeliveries)
              .set({
                status: 'failed',
                nextAttemptAt: now,
                lastError: 'WhatsApp notifications were disabled',
                updatedAt: now,
              })
              .where(eq(notificationDeliveries.id, delivery.id));
            return false;
          }

          const order = await getOrderByReference(delivery.orderReference);
          if (!order || order.paymentStatus !== 'paid') {
            throw new Error('paid order snapshot is unavailable');
          }

          let invoice = invoiceCache.get(delivery.orderReference);
          if (!invoice) {
            invoice = createOrderInvoicePdf(order);
            invoiceCache.set(delivery.orderReference, invoice);
          }
          const pdf = await invoice;
          const filename = `${order.reference}-invoice.pdf`;

          const result = await sendMail({
            ...orderConfirmationEmail(order),
            attachments: [
              {
                filename,
                content: pdf,
                contentType: 'application/pdf',
              },
            ],
          });

          await recordAttempt(delivery, result.sent, result.reason);
          return result.sent;
        } catch (error) {
          await recordAttempt(
            delivery,
            false,
            error instanceof Error ? error.message : 'delivery failed',
          );
          return false;
        }
      }),
    );
    sent += outcomes.filter(Boolean).length;
    failed += outcomes.filter((outcome) => !outcome).length;
  }

  return { claimed: deliveries.length, sent, failed };
}
