import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { env, isProduction } from '@/lib/env';
import { createStripeCheckoutSession } from './stripe';

/**
 * Payment drivers.
 *
 * Three implementations behind one shape:
 *
 *   mock     development only. Authorises immediately so the whole order flow
 *            can be exercised without credentials. `src/lib/env.ts` refuses to
 *            start with this in production.
 *   payhere  the real provider. The customer is redirected to PayHere, and the
 *            authoritative result arrives as a server-to-server notification —
 *            NOT from the browser being redirected back.
 *   stripe   Stripe-hosted Checkout. Nordic Lux creates the amount from its
 *            stored order and Stripe hosts every card-entry surface.
 *
 * The rule that matters: a payment is only ever marked paid from a verified
 * provider callback. The return URL the customer lands on is a convenience and
 * carries no authority, because anyone can request it with any query string.
 *
 * This module never sees or stores a card number. See docs/SECURITY.md §
 * Payments.
 */

export type PaymentIntent = {
  provider: string;
  /** Where to send the customer, or null when nothing is needed (mock). */
  redirectUrl: string | null;
  /** Fields to POST to `redirectUrl`, for providers that expect a form. */
  fields?: Record<string, string>;
  /** Immediate status. Real providers stay `pending` until their callback. */
  status: 'pending' | 'authorised';
  providerReference: string | null;
  /** Hosted-checkout id, distinct from the eventual payment transaction id. */
  checkoutReference?: string | null;
};

export type PaymentRequest = {
  orderId: string;
  reference: string;
  /** Cents. */
  amount: number;
  currency: string;
  customerEmail: string;
  customerPhone: string | null;
  customerFirstName: string;
  customerLastName: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
};

/** Major units, two decimals — the format PayHere signs and expects. */
function majorUnits(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * PayHere's checkout hash.
 *
 * md5 is not our choice; it is what the provider specifies. It is a shared-secret
 * integrity check on values we already know, not a password hash, so its
 * weaknesses do not apply here. The secret itself is never sent.
 */
function payhereCheckoutHash(options: {
  merchantId: string;
  reference: string;
  amount: string;
  currency: string;
  secret: string;
}): string {
  const secretHash = createHash('md5')
    .update(options.secret)
    .digest('hex')
    .toUpperCase();

  return createHash('md5')
    .update(
      options.merchantId +
        options.reference +
        options.amount +
        options.currency +
        secretHash,
    )
    .digest('hex')
    .toUpperCase();
}

export async function createPaymentIntent(
  request: PaymentRequest,
): Promise<PaymentIntent> {
  if (env.PAYMENT_DRIVER === 'mock') {
    // Authorised on the spot. The order flow then behaves exactly as it would
    // after a real provider's callback, so checkout is testable end to end.
    return {
      provider: 'mock',
      redirectUrl: null,
      status: 'authorised',
      providerReference: `mock_${request.reference}`,
    };
  }

  if (env.PAYMENT_DRIVER === 'stripe') {
    const session = await createStripeCheckoutSession(request);
    return {
      provider: 'stripe',
      redirectUrl: session.url,
      status: 'pending',
      providerReference: session.paymentIntentId,
      checkoutReference: session.sessionId,
    };
  }

  const merchantId = env.PAYHERE_MERCHANT_ID;
  const secret = env.PAYHERE_MERCHANT_SECRET;
  if (!merchantId || !secret) {
    // Reached only if the production invariants were bypassed; failing here is
    // still better than silently treating an order as paid.
    throw new Error('PayHere is selected but not configured');
  }

  const amount = majorUnits(request.amount);

  return {
    provider: 'payhere',
    redirectUrl: env.PAYHERE_SANDBOX
      ? 'https://sandbox.payhere.lk/pay/checkout'
      : 'https://www.payhere.lk/pay/checkout',
    status: 'pending',
    providerReference: null,
    fields: {
      merchant_id: merchantId,
      return_url: request.returnUrl,
      cancel_url: request.cancelUrl,
      notify_url: request.notifyUrl,
      order_id: request.reference,
      items: `Order ${request.reference}`,
      currency: request.currency,
      amount,
      first_name: request.customerFirstName,
      last_name: request.customerLastName,
      email: request.customerEmail,
      phone: request.customerPhone ?? '',
      hash: payhereCheckoutHash({
        merchantId,
        reference: request.reference,
        amount,
        currency: request.currency,
        secret,
      }),
    },
  };
}

export type NotificationResult =
  | {
      valid: true;
      reference: string;
      providerReference: string | null;
      status: 'paid' | 'failed' | 'pending';
      amount: string;
      method: string | null;
    }
  | { valid: false; reason: string };

/** PayHere's status codes. 2 = success, 0 = pending, everything else failed. */
function statusFromCode(code: string): 'paid' | 'failed' | 'pending' {
  if (code === '2') return 'paid';
  if (code === '0') return 'pending';
  return 'failed';
}

/**
 * Verifies a provider notification.
 *
 * An unverified callback is the single most dangerous input in a shop: accept it
 * and anybody can mark any order paid by POSTing to the endpoint. The signature
 * is compared in constant time, and a failure returns a reason rather than
 * throwing so the route can log and answer 400.
 */
export function verifyNotification(
  params: Record<string, string>,
): NotificationResult {
  if (env.PAYMENT_DRIVER !== 'payhere') {
    // The mock driver has no callback; anything arriving here is not ours.
    return {
      valid: false,
      reason: `${env.PAYMENT_DRIVER} driver accepts no PayHere notifications`,
    };
  }

  const secret = env.PAYHERE_MERCHANT_SECRET;
  const merchantId = env.PAYHERE_MERCHANT_ID;
  if (!secret || !merchantId) {
    return { valid: false, reason: 'provider not configured' };
  }

  const {
    merchant_id: incomingMerchant,
    order_id: reference,
    payhere_amount: amount,
    payhere_currency: currency,
    status_code: statusCode,
    md5sig: signature,
  } = params;

  if (!reference || !amount || !currency || !statusCode || !signature) {
    return { valid: false, reason: 'missing fields' };
  }
  if (incomingMerchant !== merchantId) {
    return { valid: false, reason: 'merchant mismatch' };
  }

  const secretHash = createHash('md5')
    .update(secret)
    .digest('hex')
    .toUpperCase();

  const expected = createHash('md5')
    .update(
      merchantId + reference + amount + currency + statusCode + secretHash,
    )
    .digest('hex')
    .toUpperCase();

  const a = Buffer.from(expected);
  const b = Buffer.from(signature.toUpperCase());
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: 'signature mismatch' };
  }

  return {
    valid: true,
    reference,
    providerReference: params.payment_id ?? null,
    status: statusFromCode(statusCode),
    amount,
    method: params.method ?? null,
  };
}

export const paymentProvider = env.PAYMENT_DRIVER;

/** True when payments are simulated. Surfaced in the admin and on checkout. */
export const paymentsAreMocked = env.PAYMENT_DRIVER === 'mock';

/** Mock payments in production are refused at startup; this documents why. */
export const paymentsRequireConfiguration = !isProduction && paymentsAreMocked;
