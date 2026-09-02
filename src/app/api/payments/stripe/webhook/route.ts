import { confirmPayment } from '@/lib/checkout/confirm-payment';
import { cancelExpiredPayment } from '@/lib/checkout/cancel-payment';
import { getStripePaymentContext } from '@/lib/checkout/payment-state';
import { getOrderByReference } from '@/lib/orders';
import { sendMail } from '@/lib/mail';
import { orderConfirmationEmail } from '@/lib/mail/templates';
import {
  constructStripeEvent,
  stripeEventToTransition,
  validateStripeTransition,
} from '@/lib/payments/stripe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Stripe is authenticated by its signature over this exact raw body. */
export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response(null, { status: 400 });

  let event;
  try {
    const rawBody = await request.text();
    event = constructStripeEvent(rawBody, signature);
  } catch (error) {
    console.warn(
      `[stripe] rejected webhook: ${error instanceof Error ? error.message : 'invalid payload'}`,
    );
    return new Response(null, { status: 400 });
  }

  const transition = stripeEventToTransition(event);
  if (!transition) return new Response(null, { status: 200 });

  const context = await getStripePaymentContext(transition.reference);
  if (!context || context.provider !== 'stripe') {
    console.warn(`[stripe] rejected ${event.id}: order or provider mismatch`);
    return new Response(null, { status: 400 });
  }

  const invalid = validateStripeTransition(transition, {
    orderId: context.orderId,
    reference: context.reference,
    amount: context.amount,
    currency: context.currency,
    checkoutSessionId: context.checkoutSessionId,
  });
  if (invalid) {
    console.warn(`[stripe] rejected ${event.id}: ${invalid}`);
    return new Response(null, { status: 400 });
  }

  if (transition.kind === 'cancelled') {
    const result = await cancelExpiredPayment({
      reference: transition.reference,
      provider: 'stripe',
      providerReference: transition.paymentIntentId,
      eventId: transition.eventId,
    });
    return new Response(null, { status: result.ok ? 200 : 400 });
  }

  const result = await confirmPayment({
    orderId: transition.orderId,
    reference: transition.reference,
    status: transition.kind,
    provider: 'stripe',
    providerReference: transition.paymentIntentId,
    checkoutReference: transition.checkoutSessionId,
    eventId: transition.eventId,
    amount: transition.amount,
    currency: transition.currency,
    method: transition.method,
  });

  if (!result.ok) {
    console.warn(`[stripe] could not apply ${event.id}: ${result.reason}`);
    return new Response(null, { status: 400 });
  }

  if (result.changed && transition.kind === 'paid') {
    const order = await getOrderByReference(transition.reference);
    if (order) await sendMail(orderConfirmationEmail(order));
  }

  console.warn(
    `[stripe] ${event.id} ${transition.kind} ${transition.reference} changed=${result.changed}`,
  );
  return new Response(null, { status: 200 });
}
