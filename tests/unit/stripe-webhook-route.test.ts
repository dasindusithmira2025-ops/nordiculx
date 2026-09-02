import Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const confirmPayment = vi.fn();

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('PAYMENT_DRIVER', 'stripe');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_route_test');
  vi.stubEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'pk_test_route_test');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_route_test');

  vi.doMock('@/lib/checkout/payment-state', () => ({
    getStripePaymentContext: vi.fn().mockResolvedValue({
      orderId: 'order-route',
      reference: 'NL-ROUTE-0001',
      amount: 1999,
      currency: 'USD',
      provider: 'stripe',
      checkoutSessionId: 'cs_test_route',
    }),
  }));
  vi.doMock('@/lib/checkout/confirm-payment', () => ({
    confirmPayment,
  }));
  vi.doMock('@/lib/checkout/cancel-payment', () => ({
    cancelExpiredPayment: vi.fn(),
  }));
  vi.doMock('@/lib/orders', () => ({
    getOrderByReference: vi.fn().mockResolvedValue(null),
  }));
  vi.doMock('@/lib/mail', () => ({ sendMail: vi.fn() }));
  vi.doMock('@/lib/mail/templates', () => ({
    orderConfirmationEmail: vi.fn(),
  }));
});

function signedRequest(signatureOverride?: string) {
  const payload = JSON.stringify({
    id: 'evt_route_delivery',
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_route',
        object: 'checkout.session',
        metadata: {
          orderId: 'order-route',
          orderReference: 'NL-ROUTE-0001',
        },
        payment_intent: 'pi_test_route',
        payment_status: 'paid',
        amount_total: 1999,
        currency: 'usd',
      },
    },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: 'whsec_route_test',
  });
  return new Request('http://localhost/api/payments/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': signatureOverride ?? signature },
    body: payload,
  });
}

describe('Stripe webhook route', () => {
  it('delivers a verified event to the authoritative confirmation boundary', async () => {
    confirmPayment.mockResolvedValue({
      ok: true,
      orderId: 'order-route',
      changed: false,
    });
    const { POST } = await import('@/app/api/payments/stripe/webhook/route');
    const response = await POST(signedRequest());
    expect(response.status).toBe(200);
    expect(confirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-route',
        reference: 'NL-ROUTE-0001',
        status: 'paid',
        amount: 1999,
        currency: 'USD',
        eventId: 'evt_route_delivery',
      }),
    );
  });

  it('rejects an invalid signature before confirmation', async () => {
    const { POST } = await import('@/app/api/payments/stripe/webhook/route');
    const response = await POST(signedRequest('t=1,v1=invalid'));
    expect(response.status).toBe(400);
    expect(confirmPayment).not.toHaveBeenCalled();
  });
});
