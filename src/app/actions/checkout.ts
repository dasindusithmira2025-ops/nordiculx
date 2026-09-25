'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { getCart, clearCartCookie } from '@/lib/cart';
import { placeOrder } from '@/lib/checkout/place-order';
import { confirmPayment } from '@/lib/checkout/confirm-payment';
import { recordPaymentStarted } from '@/lib/checkout/payment-state';
import { trackEvent } from '@/lib/analytics';
import { getOrderByReference } from '@/lib/orders';
import { dispatchPaidOrderNotifications } from '@/lib/notifications/paid-order';
import {
  createPaymentIntent,
  paymentProvider,
  paymentsAreMocked,
} from '@/lib/payments';
import { sendMail } from '@/lib/mail';
import { guestOrderAccessEmail } from '@/lib/mail/templates';
import { currentUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { publicEnv } from '@/lib/env';
import { DEFAULT_CURRENCY } from '@/lib/money';
import {
  actionError,
  addressSchema,
  emailSchema,
  phoneSchema,
  toFieldErrors,
  type ActionResult,
} from '@/lib/validation';

/**
 * Checkout submission.
 *
 * The browser supplies contact details and an address. It does NOT supply
 * prices, quantities, or which cart to use — those come from the cart cookie and
 * the database, and `placeOrder` re-prices from them. A tampered form can change
 * where an order is delivered (which is the customer's own business) but never
 * what it costs.
 */

const checkoutSchema = z.object({
  email: emailSchema,
  phone: phoneSchema,
  shipping: addressSchema,
  billingSameAsShipping: z.boolean(),
  whatsappOptIn: z.boolean(),
  billing: addressSchema.optional(),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
});

/** Reads the flat `shipping.line1` style keys the form submits. */
function addressFrom(formData: FormData, prefix: string) {
  const get = (field: string) => formData.get(`${prefix}.${field}`) ?? '';
  return {
    recipientName: get('recipientName'),
    phone: get('phone'),
    line1: get('line1'),
    line2: get('line2'),
    city: get('city'),
    district: get('district'),
    postalCode: get('postalCode'),
    country: get('country') || 'LK',
  };
}

export async function submitCheckout(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // Deliberately loose. This limit exists to blunt automated order spam and
  // card testing, not to police customers — and it buckets by IP, so an office,
  // a university or a mobile carrier's NAT shares one budget. Blocking a paying
  // customer at the final step is a far worse outcome than letting a script
  // through a few more times, and the real defences against fraud sit with the
  // payment provider and the stock reservation, not here.
  const limit = await rateLimit('checkout', { limit: 30, windowSeconds: 600 });
  if (!limit.allowed) {
    return actionError('Too many attempts. Please try again in a few minutes.');
  }

  const billingSame = formData.get('billingSameAsShipping') !== null;

  const parsed = checkoutSchema.safeParse({
    email: formData.get('email'),
    phone: formData.get('phone'),
    shipping: addressFrom(formData, 'shipping'),
    billingSameAsShipping: billingSame,
    whatsappOptIn: formData.get('whatsappOptIn') === 'on',
    billing: billingSame ? undefined : addressFrom(formData, 'billing'),
    note: formData.get('note') ?? '',
  });

  if (!parsed.success) {
    return actionError('Please check the form.', toFieldErrors(parsed.error));
  }

  const cart = await getCart();
  if (cart.lines.length === 0) {
    return actionError('Your bag is empty.');
  }
  if (cart.hasStockIssues) {
    return actionError(
      'Something in your bag is no longer available in that quantity. Please review it before continuing.',
    );
  }

  const user = await currentUser();

  const placed = await placeOrder({
    cart,
    email: parsed.data.email,
    phone: parsed.data.phone,
    whatsappOptIn: parsed.data.whatsappOptIn,
    shippingAddress: parsed.data.shipping,
    billingAddress: parsed.data.billing ?? null,
    userId: user?.id ?? null,
    customerNote: parsed.data.note ?? null,
  });

  if (!placed.ok) {
    if (placed.reason === 'out_of_stock') {
      return actionError(
        `Sorry — ${placed.unavailable?.join(', ')} sold out while you were checking out. Your bag has not been charged.`,
      );
    }
    if (placed.reason === 'already_converted') {
      return actionError(
        'This bag has already been ordered. Check your email for the confirmation.',
      );
    }
    return actionError('Your bag is empty.');
  }

  /* --- payment ---------------------------------------------------------- */

  const intent = await createPaymentIntent({
    orderId: placed.orderId,
    reference: placed.reference,
    amount: placed.grandTotal,
    currency: DEFAULT_CURRENCY,
    customerEmail: parsed.data.email,
    customerPhone: parsed.data.phone,
    customerFirstName: parsed.data.shipping.recipientName.split(' ')[0] ?? '',
    customerLastName:
      parsed.data.shipping.recipientName.split(' ').slice(1).join(' ') || '-',
    returnUrl: `${publicEnv.appUrl}/order/${placed.reference}`,
    cancelUrl: `${publicEnv.appUrl}/order/${placed.reference}`,
    notifyUrl:
      paymentProvider === 'payhere'
        ? `${publicEnv.appUrl}/api/payments/notify`
        : `${publicEnv.appUrl}/api/payments/stripe/webhook`,
  });

  await recordPaymentStarted({
    orderId: placed.orderId,
    provider: intent.provider,
    providerReference: intent.providerReference,
    checkoutSessionId: intent.checkoutReference,
  });

  if (intent.status === 'authorised') {
    // The mock driver settles immediately. A real provider stays pending until
    // its signed notification arrives — never on the strength of this response.
    const settlement = await confirmPayment({
      reference: placed.reference,
      status: 'paid',
      provider: intent.provider,
      providerReference: intent.providerReference,
      amount: placed.grandTotal,
    });
    if (settlement.ok && settlement.changed) {
      await dispatchPaidOrderNotifications({
        orderReference: placed.reference,
      });
    }
  }

  await clearCartCookie();
  // The bag badge lives in the storefront layout, so the layout has to be
  // re-rendered for it to show the now-empty cart.
  revalidatePath('/', 'layout');

  // The guest token is the only way an account-less customer can reach their
  // order again, so it is cookie'd for the confirmation page and emailed.
  if (placed.guestToken) {
    const store = await cookies();
    store.set(`nl_order_${placed.reference}`, placed.guestToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: publicEnv.appUrl.startsWith('https://'),
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  // Recorded once the order exists, before either redirect — a purchase that
  // routes to a payment provider is still a completed checkout on our side.
  // The reference is deliberately absent: it is in the forbidden-key list
  // because it identifies one customer's order.
  await trackEvent(
    'purchase',
    {
      items: placed.itemCount,
      value: placed.grandTotal,
      currency: DEFAULT_CURRENCY,
      promotion: Boolean(placed.promotionCode),
    },
    { path: '/checkout' },
  );

  const order = await getOrderByReference(placed.reference);
  if (order) {
    // The guest-access message carries no claim that payment succeeded.
    if (placed.guestToken) {
      await sendMail(
        guestOrderAccessEmail({
          email: order.email,
          reference: order.reference,
          token: placed.guestToken,
        }),
      );
    }
  }

  // A real provider needs the customer to go and pay; the mock driver is done.
  if (!paymentsAreMocked && intent.redirectUrl) {
    if (intent.provider === 'stripe') redirect(intent.redirectUrl);
    redirect(`/checkout/pay?reference=${placed.reference}`);
  }

  redirect(`/order/${placed.reference}`);
}
