import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaff, staffCan } from '@/lib/auth';
import { getStaffConversation, markStaffRead } from '@/lib/chat';
import { StaffChatReplyForm } from '@/components/admin/staff-chat-reply-form';

const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** Authenticated staff view for one storefront chat conversation. */
export default async function AdminChatConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff('support.view');
  const { id } = await params;
  const conversation = await getStaffConversation(id);
  if (!conversation) notFound();

  await markStaffRead(conversation.conversationId);
  const canRespond = await staffCan('support.respond');
  const contact = conversation.customerEmail ?? conversation.guestEmail;

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/admin/support"
        className="eyebrow text-fg-subtle hover:text-fg link-underline"
      >
        Support inbox
      </Link>
      <header className="border-line mt-5 border-b pb-6">
        <p className="eyebrow text-fg-subtle">Live chat</p>
        <h1 className="font-display text-display-sm text-fg mt-3">
          {conversation.guestName ?? contact ?? 'Storefront visitor'}
        </h1>
        <p className="text-fg-muted mt-2 text-sm">
          {contact ?? 'No email captured'}
          {conversation.originPath
            ? ` · Started on ${conversation.originPath}`
            : ''}
        </p>
      </header>

      <ol className="border-line mt-8 space-y-4 border-y py-6">
        {conversation.messages.map((message) => (
          <li
            key={message.id}
            className={
              message.authorRole === 'staff'
                ? 'bg-accent-soft ml-8 p-4'
                : 'bg-surface-sunken mr-8 p-4'
            }
          >
            <p className="eyebrow text-fg-subtle">
              {message.authorRole === 'staff'
                ? (message.authorName ?? 'Nordic Lux team')
                : message.authorRole === 'system'
                  ? 'System'
                  : (message.authorName ?? 'Customer')}
            </p>
            <p className="text-fg mt-2 text-sm whitespace-pre-wrap">
              {message.body}
            </p>
            <p className="text-fg-subtle mt-2 text-xs">
              {dateTimeFormat.format(new Date(message.createdAt))}
            </p>
          </li>
        ))}
      </ol>

      {canRespond ? (
        <StaffChatReplyForm conversationId={conversation.conversationId} />
      ) : (
        <p className="text-fg-muted mt-6 text-sm">
          Your role can read this conversation but cannot send replies.
        </p>
      )}
    </div>
  );
}
