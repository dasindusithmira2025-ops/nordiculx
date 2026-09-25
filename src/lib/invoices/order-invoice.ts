import 'server-only';
import PDFDocument from 'pdfkit';
import { env } from '@/lib/env';
import type { OrderDetail } from '@/lib/orders';
import { formatMoney } from '@/lib/money';
import { publicConfig } from '@/lib/public-config';

const ink = '#1d2b28';
const muted = '#68736f';
const accent = '#99744e';
const rule = '#dedfd9';

function dateLabel(date: Date) {
  return new Intl.DateTimeFormat('en-LK', {
    dateStyle: 'long',
    timeZone: 'Asia/Colombo',
  }).format(date);
}

function addressLines(address: NonNullable<OrderDetail['billingAddress']>) {
  return [
    address.recipientName,
    address.line1,
    address.line2,
    [address.city, address.district, address.postalCode]
      .filter(Boolean)
      .join(', '),
    address.country,
  ].filter((value): value is string => Boolean(value));
}

/** A printable payment receipt and order invoice from immutable order data. */
export async function createOrderInvoicePdf(
  order: OrderDetail,
): Promise<Buffer> {
  const document = new PDFDocument({
    size: 'A4',
    margins: { top: 48, right: 48, bottom: 48, left: 48 },
    info: {
      Title: `Invoice ${order.reference}`,
      Author: publicConfig.appName,
      Subject: `Paid order ${order.reference}`,
    },
  });
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('error', reject);
    document.on('end', () => resolve(Buffer.concat(chunks)));

    const pageBottom = document.page.height - document.page.margins.bottom;
    const contentWidth =
      document.page.width -
      document.page.margins.left -
      document.page.margins.right;
    const left = document.page.margins.left;
    const right = left + contentWidth;

    document.fillColor(ink).font('Helvetica-Bold').fontSize(19);
    document.text(
      (env.INVOICE_SELLER_NAME || publicConfig.appName).toUpperCase(),
      left,
      48,
      {
        characterSpacing: 1.5,
      },
    );
    document
      .fillColor(accent)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('PAYMENT RECEIPT  /  ORDER INVOICE', left, 82);
    document
      .fillColor(muted)
      .font('Helvetica')
      .fontSize(9)
      .text(publicConfig.appUrl, left, 98);
    let headerBottom = 107;
    if (env.INVOICE_SELLER_ADDRESS) {
      document.font('Helvetica').fontSize(8);
      const addressHeight = document.heightOfString(
        env.INVOICE_SELLER_ADDRESS,
        {
          width: contentWidth,
        },
      );
      document
        .fillColor(muted)
        .font('Helvetica')
        .fontSize(8)
        .text(env.INVOICE_SELLER_ADDRESS, left, 112, { width: contentWidth });
      headerBottom = 112 + addressHeight;
    }
    if (env.INVOICE_SELLER_TAX_ID) {
      const taxIdY = Math.max(126, headerBottom + 6);
      document
        .fillColor(muted)
        .font('Helvetica')
        .fontSize(8)
        .text(`Tax registration: ${env.INVOICE_SELLER_TAX_ID}`, left, taxIdY);
      headerBottom = taxIdY + 10;
    }

    const titleY = Math.max(158, headerBottom + 20);
    document
      .fillColor(ink)
      .font('Helvetica-Bold')
      .fontSize(25)
      .text('Thank you for your order', left, titleY);
    const messageY = titleY + 35;
    document
      .fillColor(muted)
      .font('Helvetica')
      .fontSize(10)
      .text(
        'Your payment has been received. Keep this invoice for your records.',
        left,
        messageY,
      );

    const metaY = messageY + 39;
    const third = contentWidth / 3;
    const metadata = [
      ['INVOICE / ORDER', order.reference],
      ['DATE PAID', dateLabel(order.placedAt)],
      ['PAYMENT STATUS', 'Paid'],
    ];
    metadata.forEach(([label, value], index) => {
      const x = left + index * third;
      document
        .fillColor(muted)
        .font('Helvetica-Bold')
        .fontSize(7)
        .text(label!, x, metaY, { width: third - 12 });
      document
        .fillColor(ink)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(value!, x, metaY + 14, { width: third - 12 });
    });

    const billingAddress = order.billingAddress ?? order.shippingAddress;
    const addressY = metaY + 48;
    document
      .fillColor(muted)
      .font('Helvetica-Bold')
      .fontSize(7)
      .text('BILLED TO', left, addressY);
    document.fillColor(ink).font('Helvetica').fontSize(9);
    addressLines(billingAddress).forEach((line, index) => {
      document.text(line, left, addressY + 14 + index * 13, {
        width: contentWidth,
      });
    });

    let y = addressY + 112;
    const descriptionWidth = 242;
    const qtyX = left + 256;
    const unitX = left + 308;
    const totalX = left + 397;

    const drawTableHeader = () => {
      document.moveTo(left, y).lineTo(right, y).strokeColor(rule).stroke();
      y += 11;
      document.fillColor(muted).font('Helvetica-Bold').fontSize(7);
      document.text('ITEM', left, y, { width: descriptionWidth });
      document.text('QTY', qtyX, y, { width: 38, align: 'right' });
      document.text('UNIT PRICE', unitX, y, { width: 78, align: 'right' });
      document.text('AMOUNT', totalX, y, {
        width: right - totalX,
        align: 'right',
      });
      y += 18;
      document.moveTo(left, y).lineTo(right, y).strokeColor(rule).stroke();
      y += 10;
    };

    drawTableHeader();

    for (const item of order.items) {
      const title = `${item.brandName} ${item.productName}`;
      const details = `${title}\n${item.variantName}  ·  SKU ${item.sku}`;
      document.font('Helvetica').fontSize(9);
      const rowHeight = Math.max(
        30,
        document.heightOfString(details, { width: descriptionWidth }) + 6,
      );
      if (y + rowHeight + 12 > pageBottom) {
        document.addPage();
        y = document.page.margins.top;
        drawTableHeader();
      }

      document.fillColor(ink).font('Helvetica-Bold').fontSize(9);
      document.text(title, left, y, { width: descriptionWidth });
      document
        .fillColor(muted)
        .font('Helvetica')
        .fontSize(8)
        .text(`${item.variantName}  ·  SKU ${item.sku}`, left, y + 13, {
          width: descriptionWidth,
        });
      document
        .fillColor(ink)
        .font('Helvetica')
        .fontSize(9)
        .text(String(item.quantity), qtyX, y + 2, { width: 38, align: 'right' })
        .text(formatMoney(item.unitPrice, order.currency), unitX, y + 2, {
          width: 78,
          align: 'right',
        })
        .text(formatMoney(item.lineTotal, order.currency), totalX, y + 2, {
          width: right - totalX,
          align: 'right',
        });
      y += rowHeight;
      document.moveTo(left, y).lineTo(right, y).strokeColor(rule).stroke();
      y += 10;
    }

    if (y + 125 > pageBottom) {
      document.addPage();
      y = document.page.margins.top;
    }

    const summaryLabelX = left + 280;
    const summaryAmountX = left + 397;
    const summaryRows: [string, string, boolean?][] = [
      ['Subtotal', formatMoney(order.subtotal, order.currency)],
      ...(order.discountTotal > 0
        ? [
            [
              'Discount',
              `-${formatMoney(order.discountTotal, order.currency)}`,
            ] as [string, string],
          ]
        : []),
      [
        'Delivery',
        order.shippingTotal === 0
          ? 'Complimentary'
          : formatMoney(order.shippingTotal, order.currency),
      ],
      ...(order.taxTotal > 0
        ? [
            ['Tax', formatMoney(order.taxTotal, order.currency)] as [
              string,
              string,
            ],
          ]
        : []),
      ['Total paid', formatMoney(order.grandTotal, order.currency), true],
    ];

    y += 7;
    for (const [label, value, bold] of summaryRows) {
      document
        .fillColor(bold ? ink : muted)
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(bold ? 11 : 9)
        .text(label, summaryLabelX, y, { width: 105 });
      document
        .fillColor(ink)
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(bold ? 11 : 9)
        .text(value, summaryAmountX, y, {
          width: right - summaryAmountX,
          align: 'right',
        });
      y += bold ? 24 : 18;
    }

    const footerY = Math.min(Math.max(y + 28, 740), pageBottom - 26);
    document
      .moveTo(left, footerY)
      .lineTo(right, footerY)
      .strokeColor(rule)
      .stroke();
    document
      .fillColor(muted)
      .font('Helvetica')
      .fontSize(8)
      .text(
        `Order ${order.reference}  ·  ${publicConfig.appName}  ·  ${publicConfig.appUrl}`,
        left,
        footerY + 10,
        { width: contentWidth, align: 'center' },
      );

    document.end();
  });
}
