import Image from 'next/image';
import Link from 'next/link';
import type { OrderDetail } from '@/lib/account';
import { ORDER_STATUS_LABELS } from '@/lib/account';
import { formatMoney } from '@/lib/money';
import { whatsappOrderLink } from '@/lib/whatsapp';
import { Badge, Rule } from '@/components/ui/display';

/**
 * Order summary, lines, totals and tracking.
 *
 * Shared by the account order page, the post-checkout confirmation and the guest
 * tracking page, so all three describe an order identically — three bespoke
 * layouts is how a total ends up formatted differently in the email, the
 * confirmation and the history.
 *
 * The addresses rendered here are the snapshot COPIED onto the order at purchase
 * time, not the customer's current address book, so a later edit never rewrites
 * where a past order went.
 */

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function AddressBlock({
  title,
  address,
}: {
  title: string;
  address: OrderDetail['shippingAddress'] | OrderDetail['billingAddress'];
}) {
  if (!address) return null;
  return (
    <div>
      <h3 className="eyebrow text-fg-subtle mb-3">{title}</h3>
      <address className="text-fg-muted text-sm leading-relaxed not-italic">
        <span className="text-fg block">{address.recipientName}</span>
        {address.line1}
        {address.line2 ? <>, {address.line2}</> : null}
        <br />
        {address.city}
        {address.district ? <>, {address.district}</> : null}
        {address.postalCode ? <> {address.postalCode}</> : null}
        <br />
        {address.country}
        <br />
        <span className="text-fg-subtle">{address.phone}</span>
      </address>
    </div>
  );
}

export function OrderDetailView({
  order,
  showSupportLink = true,
}: {
  order: OrderDetail;
  showSupportLink?: boolean;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-fg-subtle text-xs">
            Placed {dateFormat.format(order.placedAt)}
          </p>
          <p className="font-display text-fg mt-2 text-2xl tabular-nums">
            {order.reference}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="neutral">{ORDER_STATUS_LABELS[order.status]}</Badge>
          {order.paymentStatus === 'paid' ? (
            <Badge tone="success">Paid</Badge>
          ) : order.paymentStatus === 'pending' ? (
            <Badge tone="low">Payment pending</Badge>
          ) : order.paymentStatus === 'failed' ? (
            <Badge tone="out">Payment failed</Badge>
          ) : null}
        </div>
      </div>

      {/* --- lines --- */}
      <ul className="border-line mt-10 border-t">
        {order.items.map((item) => (
          <li
            key={item.id}
            className="border-line flex gap-5 border-b py-5 sm:gap-6"
          >
            <div className="bg-surface-sunken relative size-20 shrink-0 overflow-hidden sm:size-24">
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt=""
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              ) : null}
            </div>

            <div className="min-w-0 flex-1">
              <p className="eyebrow text-fg-subtle">{item.brandName}</p>
              <p className="text-fg mt-1 text-sm">
                {/* Only linked while the product is still published; a dead
                    link from an old order is worse than plain text. */}
                {item.productSlug ? (
                  <Link
                    href={`/product/${item.productSlug}`}
                    className="link-retract"
                  >
                    {item.productName}
                  </Link>
                ) : (
                  item.productName
                )}
              </p>
              <p className="text-fg-subtle mt-1 text-xs">
                {item.variantName} · {item.sku}
              </p>
              <p className="text-fg-subtle mt-2 text-xs tabular-nums">
                {item.quantity} × {formatMoney(item.unitPrice)}
              </p>
            </div>

            <p className="text-fg shrink-0 text-sm tabular-nums">
              {formatMoney(item.lineTotal)}
            </p>
          </li>
        ))}
      </ul>

      {/* --- totals --- */}
      <div className="mt-8 flex justify-end">
        <dl className="w-full max-w-xs space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-fg-muted">Subtotal</dt>
            <dd className="text-fg tabular-nums">
              {formatMoney(order.subtotal)}
            </dd>
          </div>
          {order.discountTotal > 0 ? (
            <div className="flex justify-between">
              <dt className="text-fg-muted">
                Discount
                {order.promotionCode ? (
                  <span className="text-fg-subtle">
                    {' '}
                    ({order.promotionCode})
                  </span>
                ) : null}
              </dt>
              <dd className="text-signal-sale tabular-nums">
                −{formatMoney(order.discountTotal)}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt className="text-fg-muted">Delivery</dt>
            <dd className="text-fg tabular-nums">
              {order.shippingTotal === 0
                ? 'Complimentary'
                : formatMoney(order.shippingTotal)}
            </dd>
          </div>
          {order.taxTotal > 0 ? (
            <div className="flex justify-between">
              <dt className="text-fg-muted">Tax</dt>
              <dd className="text-fg tabular-nums">
                {formatMoney(order.taxTotal)}
              </dd>
            </div>
          ) : null}
          <Rule className="my-3" />
          <div className="flex justify-between">
            <dt className="text-fg font-medium">Total</dt>
            <dd className="text-fg font-medium tabular-nums">
              {formatMoney(order.grandTotal)}
            </dd>
          </div>
        </dl>
      </div>

      {/* --- addresses --- */}
      <div className="border-line mt-12 grid gap-10 border-t pt-10 sm:grid-cols-2">
        <AddressBlock title="Delivered to" address={order.shippingAddress} />
        <AddressBlock title="Billed to" address={order.billingAddress} />
      </div>

      {/* --- tracking --- */}
      {order.tracking.length > 0 ? (
        <section className="border-line mt-12 border-t pt-10">
          <h3 className="eyebrow text-fg-subtle mb-6">Tracking</h3>
          <ol className="space-y-5">
            {order.tracking.map((event, i) => (
              <li key={event.id} className="flex gap-4">
                <span
                  aria-hidden
                  className={
                    // The newest event is the current state; older ones recede.
                    i === 0
                      ? 'bg-fg mt-1.5 size-2 shrink-0 rounded-full'
                      : 'border-line-strong mt-1.5 size-2 shrink-0 rounded-full border'
                  }
                />
                <div>
                  <p className="text-fg text-sm">
                    {ORDER_STATUS_LABELS[event.status]}
                  </p>
                  {event.message ? (
                    <p className="text-fg-muted mt-1 text-sm">
                      {event.message}
                    </p>
                  ) : null}
                  <p className="text-fg-subtle mt-1 text-xs">
                    {dateTimeFormat.format(event.occurredAt)}
                    {event.location ? ` · ${event.location}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {showSupportLink ? (
        <p className="text-fg-subtle mt-12 text-xs">
          Something wrong with this order?{' '}
          <a
            href={whatsappOrderLink(order.reference)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-fg-muted link-underline"
          >
            Message us on WhatsApp
          </a>{' '}
          or{' '}
          <Link href="/contact" className="text-fg-muted link-underline">
            send us a message
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
