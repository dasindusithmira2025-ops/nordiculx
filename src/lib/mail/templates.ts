import 'server-only';
import type { OrderDetail } from '@/lib/account';
import { formatMoney } from '@/lib/money';
import { publicConfig } from '@/lib/public-config';
import type { MailMessage } from './index';

/**
 * Transactional email bodies.
 *
 * Plain text, composed as strings. No template engine and no HTML email
 * framework: these are three short messages, and a text email renders correctly
 * in every client that exists — which is more than can be said for table-based
 * HTML.
 *
 * Nothing sensitive goes in here beyond what the recipient already knows: their
 * own order. No payment details, ever.
 */

function line(label: string, value: string) {
  return `${label.padEnd(22)}${value}`;
}

export function orderConfirmationEmail(order: OrderDetail): MailMessage {
  const items = order.items
    .map(
      (item) =>
        `  ${item.quantity} × ${item.brandName} ${item.productName} (${item.variantName})` +
        `  ${formatMoney(item.lineTotal)}`,
    )
    .join('\n');

  const address = order.shippingAddress;

  const text = [
    `Thank you — we have your order.`,
    ``,
    line('Order', order.reference),
    line('Total', formatMoney(order.grandTotal)),
    ``,
    `What you ordered`,
    items,
    ``,
    line('Subtotal', formatMoney(order.subtotal)),
    ...(order.discountTotal > 0
      ? [line('Discount', `−${formatMoney(order.discountTotal)}`)]
      : []),
    line(
      'Delivery',
      order.shippingTotal === 0
        ? 'Complimentary'
        : formatMoney(order.shippingTotal),
    ),
    line('Total', formatMoney(order.grandTotal)),
    ``,
    `Delivering to`,
    `  ${address.recipientName}`,
    `  ${address.line1}${address.line2 ? `, ${address.line2}` : ''}`,
    `  ${address.city}${address.district ? `, ${address.district}` : ''}${
      address.postalCode ? ` ${address.postalCode}` : ''
    }`,
    `  ${address.phone}`,
    ``,
    `Track this order`,
    `  ${publicConfig.appUrl}/track?reference=${order.reference}`,
    ``,
    `We will email you again when it is dispatched.`,
    ``,
    `— ${publicConfig.appName}`,
  ].join('\n');

  return {
    to: order.email,
    subject: `Your ${publicConfig.appName} order ${order.reference}`,
    text,
  };
}

export function orderDispatchedEmail(order: OrderDetail): MailMessage {
  const text = [
    `Your order is on its way.`,
    ``,
    line('Order', order.reference),
    ``,
    `Track it here`,
    `  ${publicConfig.appUrl}/track?reference=${order.reference}`,
    ``,
    `— ${publicConfig.appName}`,
  ].join('\n');

  return {
    to: order.email,
    subject: `${order.reference} has been dispatched`,
    text,
  };
}

/**
 * The guest order-lookup link.
 *
 * The token is in the URL because that is the only identity a guest has. It is
 * single-purpose, random, and stored only as a hash — see src/lib/tokens.ts.
 */
export function guestOrderAccessEmail(options: {
  email: string;
  reference: string;
  token: string;
}): MailMessage {
  const text = [
    `Here is the link to your order.`,
    ``,
    line('Order', options.reference),
    ``,
    `View it here`,
    `  ${publicConfig.appUrl}/track/${options.reference}?token=${options.token}`,
    ``,
    `Anyone with this link can see this order, so keep it to yourself.`,
    `Creating an account means you will not need a link next time.`,
    ``,
    `— ${publicConfig.appName}`,
  ].join('\n');

  return {
    to: options.email,
    subject: `Your ${publicConfig.appName} order ${options.reference}`,
    text,
  };
}

/**
 * Sent when an order lookup matches an order that belongs to a real account.
 *
 * No token is issued in this case: the customer already has a stronger
 * credential than a link, and minting a bypass for an account order would
 * weaken it.
 */
export function accountOrderLookupEmail(options: {
  email: string;
  reference: string;
}): MailMessage {
  const text = [
    `Your order is on your account.`,
    ``,
    line('Order', options.reference),
    ``,
    `Sign in to view it`,
    `  ${publicConfig.appUrl}/account/orders/${options.reference}`,
    ``,
    `— ${publicConfig.appName}`,
  ].join('\n');

  return {
    to: options.email,
    subject: `Your ${publicConfig.appName} order ${options.reference}`,
    text,
  };
}

/**
 * Sent once, when a variant somebody was waiting on becomes sellable again.
 *
 * No stock figure and no reservation: the notification is an invitation to
 * look, not a hold, and promising a unit that a faster customer takes first is
 * a worse experience than saying nothing about quantity.
 */
export function backInStockEmail(options: {
  to: string;
  productName: string;
  brandName: string;
  variantName: string;
  productSlug: string;
  unsubscribeToken: string;
}): MailMessage {
  const text = [
    `${options.brandName} ${options.productName} is back.`,
    ``,
    line('Size', options.variantName),
    ``,
    `View it here`,
    `  ${publicConfig.appUrl}/product/${options.productSlug}`,
    ``,
    `Stock is limited and we cannot hold one for you.`,
    ``,
    `You asked us to tell you when this returned. To stop these:`,
    `  ${publicConfig.appUrl}/back-in-stock/unsubscribe?token=${options.unsubscribeToken}`,
    ``,
    `— ${publicConfig.appName}`,
  ].join('\n');

  return {
    to: options.to,
    subject: `Back in stock: ${options.brandName} ${options.productName}`,
    text,
  };
}
