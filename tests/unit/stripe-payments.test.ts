import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import {
  constructStripeEvent,
  stripeEventToTransition,
  validateStripeTransition,
} from '@/lib/payments/stripe';

const webhookSecret = 'whsec_nordiclux_unit_test';

function signedEvent(type: string, object: Record<string, unknown>) {
  const payload = JSON.stringify({
    id: `evt_${type.replaceAll('.', '_')}`,
    object: 'event',
    type,
    data: { object },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret,
  });
  return constructStripeEvent(payload, signature, webhookSecret);
}

const checkoutSession = {
  id: 'cs_test_nordiclux',
  object: 'checkout.session',
  metadata: { orderId: 'order-1', orderReference: 'NL-TEST-0001' },
  payment_intent: 'pi_test_nordiclux',
  payment_status: 'paid',
  amount_total: 1999,
  currency: 'usd',
};

describe('Stripe webhook boundary', () => {
  it('verifies the exact raw payload with Stripe official signing helpers', () => {
    const event = signedEvent('checkout.session.completed', checkoutSession);
    expect(event.type).toBe('checkout.session.completed');
  });

  it('rejects an invalid webhook signature', () => {
    expect(() =>
      constructStripeEvent('{}', 't=1,v1=invalid', webhookSecret),
    ).toThrow();
  });

  it('maps a paid Checkout Session to a server-verifiable transition', () => {
    const transition = stripeEventToTransition(
      signedEvent('checkout.session.completed', checkoutSession),
    );
    expect(transition).toMatchObject({
      kind: 'paid',
      orderId: 'order-1',
      reference: 'NL-TEST-0001',
      checkoutSessionId: 'cs_test_nordiclux',
      paymentIntentId: 'pi_test_nordiclux',
      amount: 1999,
      currency: 'USD',
    });
  });

  it('does not treat an unpaid success redirect event as payment', () => {
    const transition = stripeEventToTransition(
      signedEvent('checkout.session.completed', {
        ...checkoutSession,
        payment_status: 'unpaid',
      }),
    );
    expect(transition?.kind).toBe('pending');
  });

  it('maps declined PaymentIntents and expired sessions safely', () => {
    const failed = stripeEventToTransition(
      signedEvent('payment_intent.payment_failed', {
        id: 'pi_failed',
        object: 'payment_intent',
        metadata: { orderId: 'order-1', orderReference: 'NL-TEST-0001' },
        amount: 1999,
        currency: 'usd',
      }),
    );
    const expired = stripeEventToTransition(
      signedEvent('checkout.session.expired', checkoutSession),
    );
    expect(failed?.kind).toBe('failed');
    expect(expired?.kind).toBe('cancelled');
  });

  it('rejects amount, currency, order, and Checkout Session mismatches', () => {
    const transition = stripeEventToTransition(
      signedEvent('checkout.session.completed', checkoutSession),
    )!;
    const expected = {
      orderId: 'order-1',
      reference: 'NL-TEST-0001',
      amount: 1999,
      currency: 'USD',
      checkoutSessionId: 'cs_test_nordiclux',
    };
    expect(validateStripeTransition(transition, expected)).toBeNull();
    expect(
      validateStripeTransition(transition, { ...expected, amount: 2000 }),
    ).toBe('amount mismatch');
    expect(
      validateStripeTransition(transition, { ...expected, currency: 'LKR' }),
    ).toBe('currency mismatch');
    expect(
      validateStripeTransition(transition, { ...expected, orderId: 'other' }),
    ).toBe('order mismatch');
    expect(
      validateStripeTransition(transition, {
        ...expected,
        checkoutSessionId: 'cs_test_other',
      }),
    ).toBe('checkout session mismatch');
  });
});
