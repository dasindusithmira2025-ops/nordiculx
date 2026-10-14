'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireStaff } from '@/lib/auth';
import { recordAudit } from '@/lib/admin/audit';
import { appendStaffMessage, getStaffConversation } from '@/lib/chat';
import {
  actionError,
  actionOk,
  uuidSchema,
  type ActionResult,
} from '@/lib/validation';

const chatReplySchema = z.object({
  conversationId: uuidSchema,
  body: z.string().trim().min(1, 'Type a reply.').max(2000),
});

/** Posts an authenticated staff reply to an existing customer conversation. */
export async function replyToChat(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireStaff('support.respond');
  const parsed = chatReplySchema.safeParse({
    conversationId: String(formData.get('conversationId') ?? ''),
    body: String(formData.get('body') ?? ''),
  });
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? 'Check the reply.');
  }

  const conversation = await getStaffConversation(parsed.data.conversationId);
  if (!conversation) return actionError('Conversation not found.');

  await db.transaction(async (tx) => {
    const reply = await appendStaffMessage(tx, {
      conversationId: conversation.conversationId,
      body: parsed.data.body,
      authorId: actor.id,
      authorName: actor.firstName ?? actor.email,
    });
    await recordAudit({
      actor,
      action: 'support.chat_replied',
      entityType: 'chat_conversation',
      entityId: conversation.conversationId,
      changes: { status: { from: reply.previousStatus, to: 'pending' } },
      tx,
    });
  });

  revalidatePath('/admin/support');
  revalidatePath(`/admin/support/chat/${conversation.conversationId}`);
  return actionOk();
}
