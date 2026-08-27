import { requireStaff, staffCan } from '@/lib/auth';
import { listSupportTickets } from '@/lib/admin/queries';
import { Badge } from '@/components/ui/display';
import { TicketStatusButton } from '@/components/admin/moderation-buttons';

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Support queue.
 *
 * Open tickets first regardless of age, since a week-old open ticket is more
 * urgent than a closed one from this morning. Replying happens over email for
 * now; this is the triage list, and the close control is gated on
 * `support.respond` rather than on merely being able to read the queue.
 */
export default async function AdminSupportPage() {
  await requireStaff('support.view');
  const canRespond = await staffCan('support.respond');

  const tickets = await listSupportTickets();
  const open = tickets.filter((t) => t.status === 'open').length;

  return (
    <div>
      <header className="border-line border-b pb-6">
        <p className="eyebrow text-fg-subtle">Support</p>
        <h1 className="font-display text-display-sm text-fg mt-3">
          {open} open {open === 1 ? 'ticket' : 'tickets'}
        </h1>
      </header>

      {tickets.length === 0 ? (
        <p className="text-fg-muted mt-12 text-sm">No tickets yet.</p>
      ) : (
        <ul className="mt-8 space-y-4">
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
                  <p className="text-fg-subtle mt-1 text-xs">
                    {ticket.name} · {ticket.email} ·{' '}
                    {dateFormat.format(ticket.createdAt)}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <a
                    href={`mailto:${ticket.email}?subject=Re: ${ticket.reference}`}
                    className="eyebrow text-fg-subtle hover:text-fg link-underline"
                  >
                    Reply
                  </a>
                  {canRespond ? (
                    <TicketStatusButton id={ticket.id} status={ticket.status} />
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
