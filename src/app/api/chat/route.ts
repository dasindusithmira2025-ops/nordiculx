import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  appendCustomerMessage,
  ensureConversation,
  getConversation,
  markCustomerRead,
  staffOnline,
} from '@/lib/chat';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Customer live-chat endpoint.
 *
 * Scoped entirely by the visitor cookie — a conversation id is never accepted
 * from the client, so there is no way to read or post into somebody else's
 * conversation.
 */

export async function GET() {
  const conversation = await getConversation();
  if (conversation) await markCustomerRead(conversation.conversationId);

  return NextResponse.json(
    conversation ?? {
      conversationId: null,
      messages: [],
      staffOnline: staffOnline(),
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

const postSchema = z.object({
  body: z.string().trim().min(1, 'Type a message').max(2000),
  originPath: z.string().max(300).optional(),
});

export async function POST(request: NextRequest) {
  const limit = await rateLimit('chat-send', { limit: 20, windowSeconds: 60 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'You are sending messages too quickly.' },
      { status: 429 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const parsed = postSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid message.' },
      { status: 400 },
    );
  }

  const conversationId = await ensureConversation({
    originPath: parsed.data.originPath,
  });
  await appendCustomerMessage(conversationId, parsed.data.body);

  const conversation = await getConversation();
  return NextResponse.json(conversation, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
