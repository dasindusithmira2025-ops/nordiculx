import Link from 'next/link';
import { requireStaff, staffCan } from '@/lib/auth';
import { listSupportTickets } from '@/lib/admin/queries';
import { listStaffConversations } from '@/lib/chat';
import { Badge } from '@/components/ui/display';
import { TicketStatusButton } from '@/components/admin/moderation-buttons';

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** Support queue for email tickets and two-way storefront chat. */
export default async function AdminSupportPage() {
  await requireStaff('support.view');
  const [canRespond, tickets, conversations] = await Promise.all([
    staffCan('support.respond'),
    listSupportTickets(),
    listStaffConversations(),
  ]);
  const openTickets = tickets.filter(
    (ticket) => ticket.status === 'open',
  ).length;
  const unreadChats = conversations.filter(
    (conversation) => conversation.unreadForStaff > 0,
  ).length;

  return (
    <div>
      <header className="border-line border-b pb-6">
        <p className="eyebrow text-fg-subtle">Support</p>
        <h1 className="font-display text-display-sm text-fg mt-3">
          {openTickets} open {openTickets === 1 ? 'ticket' : 'tickets'}
        </h1>
        <p className="text-fg-muted mt-2 text-sm">
          {unreadChats} unread {unreadChats === 1 ? 'chat' : 'chats'}
        </p>
      </header>

      <section className="mt-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-fg-subtle">Live chat</p>
            <h2 className="font-display text-title-md text-fg mt-2">
              Customer conversations
            </h2>
          </div>
        </div>
        {conversations.length === 0 ? (
          <p className="text-fg-muted mt-4 text-sm">
            No chat conversations yet.
          </p>
        ) : (
          <ul className="divide-line mt-4 divide-y border-y">
            {conversations.map((conversation) => (
              <li key={conversation.conversationId}>
                <Link
                  href={`/admin/support/chat/${conversation.conversationId}`}
                  className="hover:bg-surface-sunken block p-4 transition-colors"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-fg text-sm">
                        {conversation.guestName ??
                          conversation.customerEmail ??
                          conversation.guestEmail ??
                          'Storefront visitor'}
                      </p>
                      <p className="text-fg-subtle mt-1 text-xs">
                        {conversation.customerEmail ??
                          conversation.guestEmail ??
                          'No email'}{' '}
                        · {dateFormat.format(conversation.lastMessageAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {conversation.unreadForStaff > 0 ? (
                        <Badge tone="low">
                          {conversation.unreadForStaff} new
                        </Badge>
                      ) : null}
                      <Badge tone="neutral">{conversation.status}</Badge>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12">
        <p className="eyebrow text-fg-subtle">Email tickets</p>
        <h2 className="font-display text-title-md text-fg mt-2">
          Ticket queue
        </h2>
        {tickets.length === 0 ? (
          <p className="text-fg-muted mt-4 text-sm">No tickets yet.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {tickets.map((ticket) => (
              <li key={ticket.id} className="border-line border p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-3">
                      <span className="text-fg text-sm tabular-nums">
                        {ticket.reference}
                      </span>
                      {ticket.status === 'open' ? (
                        <Badge tone="low">Open</Badge>
                      ) : (
                        <Badge tone="neutral">{ticket.status}</Badge>
                      )}
                    </p>
                    <p className="text-fg mt-2 text-sm">{ticket.subject}</p>
                    <p className="text-fg-muted mt-2 text-sm whitespace-pre-wrap">
                      {ticket.message}
                    </p>
                    <p className="text-fg-subtle mt-2 text-xs">
                      {ticket.name} · {ticket.email}
                      {ticket.phone ? ` · ${ticket.phone}` : ''}
                      {ticket.orderReference
                        ? ` · Order ${ticket.orderReference}`
                        : ''}
                      {' · '}
                      {dateFormat.format(ticket.createdAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <a
                      href={`mailto:${ticket.email}?subject=${encodeURIComponent(`Re: ${ticket.reference}`)}`}
                      className="eyebrow text-fg-subtle hover:text-fg link-underline"
                    >
                      Reply
                    </a>
                    {canRespond ? (
                      <TicketStatusButton
                        id={ticket.id}
                        status={ticket.status}
                      />
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
