import 'server-only';
import Stripe from 'stripe';
import { env, isProduction } from '@/lib/env';

let stripeClient: Stripe | null = null;
let stripeWebhookClient: Stripe | null = null;

function client(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error(
      'Stripe is selected but STRIPE_SECRET_KEY is not configured',
    );
  }
  if (
    !isProduction &&
    !env.STRIPE_SECRET_KEY.startsWith('sk_test_') &&
    !env.STRIPE_SECRET_KEY.startsWith('rk_test_')
  ) {
    throw new Error('Stripe sandbox requires a test-mode API key');
  }
  stripeClient ??= new Stripe(env.STRIPE_SECRET_KEY);
  return stripeClient;
}

export type StripeCheckoutRequest = {
  orderId: string;
  reference: string;
  amount: number;
  currency: string;
  customerEmail: string;
  returnUrl: string;
  cancelUrl: string;
};

export async function createStripeCheckoutSession(
  request: StripeCheckoutRequest,
) {
  const session = await client().checkout.sessions.create(
    {
      mode: 'payment',
      customer_email: request.customerEmail,
      client_reference_id: request.orderId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: request.currency.toLowerCase(),
            unit_amount: request.amount,
            product_data: { name: `Nordic Lux order ${request.reference}` },
          },
        },
      ],
      metadata: {
        orderId: request.orderId,
        orderReference: request.reference,
      },
      payment_intent_data: {
        metadata: {
          orderId: request.orderId,
          orderReference: request.reference,
        },
      },
      success_url: `${request.returnUrl}?stripe_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${request.cancelUrl}?payment=cancelled`,
    },
    { idempotencyKey: `nordiclux-checkout-${request.orderId}` },
  );

  if (!session.url) throw new Error('Stripe did not return a Checkout URL');

  return {
    url: session.url,
    sessionId: session.id,
    paymentIntentId:
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null),
  };
}

export function constructStripeEvent(
  payload: string | Buffer,
  signature: string,
  secret = env.STRIPE_WEBHOOK_SECRET,
): Stripe.Event {
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  // Signature verification is local cryptography and does not call Stripe. A
  // webhook may therefore be verified even if the API key is temporarily
  // unavailable; Checkout creation still requires the real sandbox key.
  stripeWebhookClient ??= new Stripe(
    env.STRIPE_SECRET_KEY ?? 'sk_test_webhook_signature_verification_only',
  );
  return stripeWebhookClient.webhooks.constructEvent(
    payload,
    signature,
    secret,
  );
}

export type StripePaymentTransition = {
  eventId: string;
  kind: 'paid' | 'failed' | 'pending' | 'cancelled';
  orderId: string;
  reference: string;
  checkoutSessionId: string | null;
  paymentIntentId: string | null;
  amount: number | null;
  currency: string | null;
  method: string | null;
};

function metadataIdentity(metadata: Stripe.Metadata | null | undefined) {
  const orderId = metadata?.orderId;
  const reference = metadata?.orderReference;
  if (!orderId || !reference) return null;
  return { orderId, reference };
}

function paymentIntentId(
  value: string | Stripe.PaymentIntent | null,
): string | null {
  return typeof value === 'string' ? value : (value?.id ?? null);
}

/**
 * Reduces only the Stripe events Nordic Lux acts on to a provider-neutral
 * transition. Returning null acknowledges unrelated events without touching an
 * order. The route still verifies the Stripe signature before calling this.
 */
export function stripeEventToTransition(
  event: Stripe.Event,
): StripePaymentTransition | null {
  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded' ||
    event.type === 'checkout.session.async_payment_failed' ||
    event.type === 'checkout.session.expired'
  ) {
    const session = event.data.object;
    const identity = metadataIdentity(session.metadata);
    if (!identity) return null;

    let kind: StripePaymentTransition['kind'];
    if (event.type === 'checkout.session.expired') kind = 'cancelled';
    else if (event.type === 'checkout.session.async_payment_failed')
      kind = 'failed';
    else if (session.payment_status === 'paid') kind = 'paid';
    else kind = 'pending';

    return {
      eventId: event.id,
      kind,
      ...identity,
      checkoutSessionId: session.id,
      paymentIntentId: paymentIntentId(session.payment_intent),
      amount: session.amount_total,
      currency: session.currency?.toUpperCase() ?? null,
      method: null,
    };
  }

  if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object;
    const identity = metadataIdentity(intent.metadata);
    if (!identity) return null;
    return {
      eventId: event.id,
      kind: 'failed',
      ...identity,
      checkoutSessionId: null,
      paymentIntentId: intent.id,
      amount: intent.amount,
      currency: intent.currency.toUpperCase(),
      method: null,
    };
  }

  return null;
}

export function validateStripeTransition(
  transition: StripePaymentTransition,
  expected: {
    orderId: string;
    reference: string;
    amount: number;
    currency: string;
    checkoutSessionId?: string | null;
  },
): string | null {
  if (
    transition.orderId !== expected.orderId ||
    transition.reference !== expected.reference
  ) {
    return 'order mismatch';
  }
  if (transition.amount == null || transition.amount !== expected.amount) {
    return 'amount mismatch';
  }
  if (
    !transition.currency ||
    transition.currency.toUpperCase() !== expected.currency.toUpperCase()
  ) {
    return 'currency mismatch';
  }
  if (
    transition.checkoutSessionId &&
    expected.checkoutSessionId &&
    transition.checkoutSessionId !== expected.checkoutSessionId
  ) {
    return 'checkout session mismatch';
  }
  return null;
}
