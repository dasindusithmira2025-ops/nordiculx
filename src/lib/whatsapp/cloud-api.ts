import 'server-only';
import { env } from '@/lib/env';
import type { OrderDetail } from '@/lib/orders';
import { formatMoney } from '@/lib/money';

export type WhatsAppSendResult = {
  sent: boolean;
  reason?: string;
};

function recipientNumber(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('94')) return digits;
  if (digits.startsWith('0')) return `94${digits.slice(1)}`;
  return digits;
}

function graphUrl(path: string) {
  return `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${path}`;
}

async function uploadInvoice(pdf: Buffer, filename: string) {
  const form = new FormData();
  form.set('messaging_product', 'whatsapp');
  form.set('type', 'application/pdf');
  form.set(
    'file',
    new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }),
    filename,
  );

  const response = await fetch(
    graphUrl(`${env.WHATSAPP_PHONE_NUMBER_ID}/media`),
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
      body: form,
      signal: AbortSignal.timeout(20_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Meta media upload returned HTTP ${response.status}`);
  }

  const result: unknown = await response.json();
  if (
    typeof result !== 'object' ||
    result === null ||
    !('id' in result) ||
    typeof result.id !== 'string'
  ) {
    throw new Error('Meta media upload returned no media ID');
  }

  return result.id;
}

/** Uploads an invoice privately to Meta and sends the approved utility template. */
export async function sendPaidOrderInvoiceOnWhatsApp(
  order: OrderDetail,
  pdf: Buffer,
): Promise<WhatsAppSendResult> {
  if (!order.whatsappOptIn)
    return { sent: false, reason: 'no WhatsApp consent' };
  if (!order.phone) return { sent: false, reason: 'no phone number' };

  if (!env.WHATSAPP_CLOUD_API_ENABLED) {
    console.warn(
      `[whatsapp] Cloud API disabled; invoice not sent for order ${order.reference}`,
    );
    return { sent: false, reason: 'Cloud API disabled' };
  }

  const filename = `${order.reference}-invoice.pdf`;

  try {
    const mediaId = await uploadInvoice(pdf, filename);
    const response = await fetch(
      graphUrl(`${env.WHATSAPP_PHONE_NUMBER_ID}/messages`),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipientNumber(order.phone),
          type: 'template',
          template: {
            name: env.WHATSAPP_ORDER_TEMPLATE_NAME,
            language: { code: env.WHATSAPP_ORDER_TEMPLATE_LANGUAGE },
            components: [
              {
                type: 'header',
                parameters: [
                  {
                    type: 'document',
                    document: { id: mediaId, filename },
                  },
                ],
              },
              {
                type: 'body',
                parameters: [
                  {
                    type: 'text',
                    text: order.shippingAddress.recipientName,
                  },
                  { type: 'text', text: order.reference },
                  {
                    type: 'text',
                    text: formatMoney(order.grandTotal, order.currency),
                  },
                ],
              },
            ],
          },
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );

    if (!response.ok) {
      throw new Error(`Meta message send returned HTTP ${response.status}`);
    }

    const result: unknown = await response.json();
    if (
      typeof result !== 'object' ||
      result === null ||
      !('messages' in result) ||
      !Array.isArray(result.messages) ||
      typeof result.messages[0] !== 'object' ||
      result.messages[0] === null ||
      !('id' in result.messages[0]) ||
      typeof result.messages[0].id !== 'string'
    ) {
      throw new Error('Meta message response did not include a message ID');
    }

    return { sent: true };
  } catch (error) {
    console.error(
      `[whatsapp] failed for order ${order.reference}:`,
      error instanceof Error ? error.message : 'provider request failed',
    );
    return { sent: false, reason: 'provider request failed' };
  }
}
