import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let available = false;
let database: typeof import('@/lib/db').db;
let connection: typeof import('@/lib/db').sql;
let schema: typeof import('@/lib/db/schema');
let confirmPayment: typeof import('@/lib/checkout/confirm-payment').confirmPayment;
let cancelExpiredPayment: typeof import('@/lib/checkout/cancel-payment').cancelExpiredPayment;

beforeAll(async () => {
  try {
    const dbModule = await import('@/lib/db');
    database = dbModule.db;
    connection = dbModule.sql;
    await database.execute((await import('drizzle-orm')).sql`SELECT 1`);
    schema = await import('@/lib/db/schema');
    ({ confirmPayment } = await import('@/lib/checkout/confirm-payment'));
    ({ cancelExpiredPayment } = await import('@/lib/checkout/cancel-payment'));
    available = true;
  } catch {
    available = false;
  }
});

describe('payment confirmation transaction', () => {
  it('confirms a verified payment exactly once without duplicating ledger rows', async () => {
    if (!available) {
      console.warn('skipped (no database): payment confirmation transaction');
      return;
    }

    const orderId = randomUUID();
    const reference = `NL-TEST-${randomUUID().slice(0, 8).toUpperCase()}`;
    const address = {
      recipientName: 'Stripe Test',
      phone: '+10000000000',
      line1: 'Test address',
      city: 'Test city',
      country: 'US',
    };

    await database.insert(schema.orders).values({
      id: orderId,
      reference,
      email: 'stripe-payment@example.test',
      status: 'pending_payment',
      paymentStatus: 'pending',
      currency: 'USD',
      subtotal: 1999,
      grandTotal: 1999,
      shippingAddress: address,
      billingAddress: address,
    });
    await database.insert(schema.payments).values({
      orderId,
      provider: 'stripe',
      amount: 1999,
      currency: 'USD',
      providerPayload: { checkoutSessionId: 'cs_test_idempotent' },
    });

    try {
      const mismatch = await confirmPayment({
        orderId,
        reference,
        status: 'paid',
        provider: 'stripe',
        providerReference: 'pi_test_idempotent',
        checkoutReference: 'cs_test_idempotent',
        eventId: 'evt_wrong_amount',
        amount: 2000,
        currency: 'USD',
      });
      expect(mismatch).toEqual({ ok: false, reason: 'amount_mismatch' });

      const first = await confirmPayment({
        orderId,
        reference,
        status: 'paid',
        provider: 'stripe',
        providerReference: 'pi_test_idempotent',
        checkoutReference: 'cs_test_idempotent',
        eventId: 'evt_paid_once',
        amount: 1999,
        currency: 'USD',
      });
      const duplicate = await confirmPayment({
        orderId,
        reference,
        status: 'paid',
        provider: 'stripe',
        providerReference: 'pi_test_idempotent',
        checkoutReference: 'cs_test_idempotent',
        eventId: 'evt_paid_once',
        amount: 1999,
        currency: 'USD',
      });

      expect(first).toMatchObject({ ok: true, changed: true });
      expect(duplicate).toMatchObject({ ok: true, changed: false });

      const [order] = await database
        .select({
          status: schema.orders.status,
          paymentStatus: schema.orders.paymentStatus,
        })
        .from(schema.orders)
        .where((await import('drizzle-orm')).eq(schema.orders.id, orderId));
      expect(order).toEqual({ status: 'confirmed', paymentStatus: 'paid' });

      const confirmedEvents = await database
        .select({ id: schema.trackingEvents.id })
        .from(schema.trackingEvents)
        .where(
          (await import('drizzle-orm')).eq(
            schema.trackingEvents.orderId,
            orderId,
          ),
        );
      expect(confirmedEvents).toHaveLength(1);

      const ledgerRows = await database
        .select({ id: schema.inventoryMovements.id })
        .from(schema.inventoryMovements)
        .where(
          (await import('drizzle-orm')).eq(
            schema.inventoryMovements.referenceId,
            orderId,
          ),
        );
      expect(ledgerRows).toHaveLength(0);
    } finally {
      await database
        .delete(schema.orders)
        .where((await import('drizzle-orm')).eq(schema.orders.id, orderId));
    }
  });

  it('releases an expired checkout reservation and its ledger exactly once', async () => {
    if (!available) {
      console.warn('skipped (no database): expired payment release');
      return;
    }

    const { eq, sql } = await import('drizzle-orm');
    const candidates = await database
      .select({
        variantId: schema.inventoryItems.variantId,
        onHand: schema.inventoryItems.onHand,
        reserved: schema.inventoryItems.reserved,
      })
      .from(schema.inventoryItems)
      .where(
        sql`${schema.inventoryItems.onHand} > ${schema.inventoryItems.reserved}`,
      )
      .limit(1);
    const inventory = candidates[0];
    if (!inventory) {
      console.warn('skipped (no available inventory): expired payment release');
      return;
    }

    const orderId = randomUUID();
    const reference = `NL-EXPIRE-${randomUUID().slice(0, 6).toUpperCase()}`;
    const address = {
      recipientName: 'Stripe Expiry Test',
      phone: '+10000000000',
      line1: 'Test address',
      city: 'Test city',
      country: 'US',
    };

    await database
      .update(schema.inventoryItems)
      .set({ reserved: inventory.reserved + 1 })
      .where(eq(schema.inventoryItems.variantId, inventory.variantId));
    await database.insert(schema.orders).values({
      id: orderId,
      reference,
      email: 'stripe-expiry@example.test',
      status: 'pending_payment',
      paymentStatus: 'pending',
      currency: 'USD',
      subtotal: 1999,
      grandTotal: 1999,
      shippingAddress: address,
      billingAddress: address,
    });
    await database.insert(schema.orderItems).values({
      orderId,
      variantId: inventory.variantId,
      productName: 'Stripe expiry fixture',
      variantName: 'Test variant',
      brandName: 'Nordic Lux',
      sku: `TEST-${orderId}`,
      unitPrice: 1999,
      quantity: 1,
      lineTotal: 1999,
    });
    await database.insert(schema.payments).values({
      orderId,
      provider: 'stripe',
      amount: 1999,
      currency: 'USD',
      providerPayload: { checkoutSessionId: 'cs_test_expired' },
    });

    try {
      const first = await cancelExpiredPayment({
        reference,
        provider: 'stripe',
        providerReference: null,
        eventId: 'evt_expired_once',
      });
      const duplicate = await cancelExpiredPayment({
        reference,
        provider: 'stripe',
        providerReference: null,
        eventId: 'evt_expired_once',
      });
      expect(first).toMatchObject({ ok: true, changed: true });
      expect(duplicate).toMatchObject({ ok: true, changed: false });

      const [after] = await database
        .select({ reserved: schema.inventoryItems.reserved })
        .from(schema.inventoryItems)
        .where(eq(schema.inventoryItems.variantId, inventory.variantId));
      expect(after?.reserved).toBe(inventory.reserved);

      const releases = await database
        .select({ id: schema.inventoryMovements.id })
        .from(schema.inventoryMovements)
        .where(eq(schema.inventoryMovements.referenceId, orderId));
      expect(releases).toHaveLength(1);
    } finally {
      await database
        .delete(schema.inventoryMovements)
        .where(eq(schema.inventoryMovements.referenceId, orderId));
      await database.delete(schema.orders).where(eq(schema.orders.id, orderId));
      await database
        .update(schema.inventoryItems)
        .set({ reserved: inventory.reserved })
        .where(eq(schema.inventoryItems.variantId, inventory.variantId));
    }
  });
});

afterAll(async () => {
  if (available && connection) await connection.end();
});
