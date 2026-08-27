import { publicConfig } from '@/lib/public-config';

/**
 * WhatsApp customer-assistance links.
 *
 * This is a support entry point, not a marketing channel: it opens a chat the
 * CUSTOMER initiates, pre-filled with just enough context for staff to help.
 *
 * What a link may contain: the page they were on, a product name, an order
 * reference the customer already has in front of them.
 *
 * What a link must NEVER contain: email address, phone number, delivery
 * address, order totals, payment details, or anything else that would end up
 * in a URL, a browser history, or a shared screenshot. A wa.me link is not a
 * private channel — treat everything in it as public.
 */

const MAX_MESSAGE_LENGTH = 400;

function buildUrl(message: string): string {
  const digits = publicConfig.whatsappNumber.replace(/\D/g, '');
  const text = encodeURIComponent(message.slice(0, MAX_MESSAGE_LENGTH));
  return `https://wa.me/${digits}?text=${text}`;
}

/** A general enquiry with no context attached. */
export function whatsappGeneralLink(): string {
  return buildUrl('Hello Nordic Lux, I have a question.');
}

/** Product enquiry. Name and size only — both are public catalogue data. */
export function whatsappProductLink(options: {
  productName: string;
  brandName?: string;
  variantName?: string;
}): string {
  const parts = [options.brandName, options.productName, options.variantName]
    .filter(Boolean)
    .join(' — ');
  return buildUrl(`Hello Nordic Lux, I have a question about ${parts}.`);
}

/**
 * Order support. Carries the reference and nothing else.
 *
 * The reference is not a credential — staff still verify identity before
 * discussing an order, and the reference alone grants no access anywhere.
 */
export function whatsappOrderLink(reference: string): string {
  const safe = reference.replace(/[^A-Z0-9-]/gi, '').slice(0, 20);
  return buildUrl(`Hello Nordic Lux, I need help with order ${safe}.`);
}
