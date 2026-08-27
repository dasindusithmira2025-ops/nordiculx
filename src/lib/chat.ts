import 'server-only';
import { cookies } from 'next/headers';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { chatConversations, chatMessages } from '@/lib/db/schema';
import { generateToken, hashToken } from '@/lib/tokens';
import { isProduction } from '@/lib/env';
import { currentUser } from '@/lib/auth';

/**
 * Live chat — self-hosted, no third-party provider.
 *
 * Transport is short polling rather than WebSockets. That is a deliberate
 * trade: a shop of this size has a handful of concurrent conversations, and
 * polling survives serverless hosting, reverse proxies and mobile network
 * changes without a reconnect strategy. The message API is the stable
 * boundary, so moving to a socket or a hosted provider later changes this file
 * and nothing else (docs/ARCHITECTURE.md § Live chat).
 *
 * ponytail: short polling; swap to SSE/WebSocket if concurrency ever justifies it.
 */

const VISITOR_COOKIE = 'nl_chat';
const VISITOR_TTL_DAYS = 90;

export type ChatMessageView = {
  id: string;
  authorRole: 'customer' | 'staff' | 'system';
  authorName: string | null;
  body: string;
  createdAt: string;
};

export type ChatView = {
  conversationId: string;
  status: 'open' | 'pending' | 'closed';
  messages: ChatMessageView[];
  /** Whether staff are considered available right now. */
  staffOnline: boolean;
};

/**
 * Opening hours, Asia/Colombo. Outside them the panel says so honestly and
 * offers an email fallback rather than leaving somebody typing into a void.
 */
export function staffOnline(now: Date = new Date()): boolean {
  const colombo = new Date(
    now.toLocaleString('en-US', { timeZone: 'Asia/Colombo' }),
  );
  const day = colombo.getDay();
  const hour = colombo.getHours();
  if (day === 0) return false; // Sunday
  return hour >= 9 && hour < 18;
}

/** Reads the visitor's conversation without creating one. Safe in a RSC. */
export async function getConversation(): Promise<ChatView | null> {
  const store = await cookies();
  const token = store.get(VISITOR_COOKIE)?.value;
  const user = await currentUser();

  const conversation = token
    ? (
        await db
          .select()
          .from(chatConversations)
          .where(eq(chatConversations.visitorTokenHash, hashToken(token)))
          .limit(1)
      )[0]
    : user
      ? (
          await db
            .select()
            .from(chatConversations)
            .where(
              and(
                eq(chatConversations.userId, user.id),
                eq(chatConversations.status, 'open'),
              ),
            )
            .limit(1)
        )[0]
      : undefined;

  if (!conversation) return null;

  const messages = await db
    .select({
      id: chatMessages.id,
      authorRole: chatMessages.authorRole,
      authorName: chatMessages.authorName,
      body: chatMessages.body,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversation.id))
    .orderBy(asc(chatMessages.createdAt))
    .limit(200);

  return {
    conversationId: conversation.id,
    status: conversation.status,
    staffOnline: staffOnline(),
    messages: messages.map((m) => ({
      id: m.id,
      authorRole: m.authorRole,
      authorName: m.authorName,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/**
 * Returns the visitor's conversation, creating one if needed.
 * Only valid from a server action or route handler — it sets a cookie.
 */
export async function ensureConversation(options: {
  originPath?: string;
}): Promise<string> {
  const existing = await getConversation();
  if (existing && existing.status !== 'closed') return existing.conversationId;

  const store = await cookies();
  const user = await currentUser();
  const token = generateToken();

  const [created] = await db
    .insert(chatConversations)
    .values({
      userId: user?.id ?? null,
      visitorTokenHash: hashToken(token),
      originPath: options.originPath?.slice(0, 300) ?? null,
      status: 'open',
    })
    .returning({ id: chatConversations.id });

  store.set(VISITOR_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    expires: new Date(Date.now() + VISITOR_TTL_DAYS * 86_400_000),
  });

  // An opening line so the transcript reads as a conversation from the start,
  // and so an offline visitor immediately knows what to expect.
  await db.insert(chatMessages).values({
    conversationId: created!.id,
    authorRole: 'system',
    body: staffOnline()
      ? 'Thanks for getting in touch. Someone from the Nordic Lux team will reply shortly.'
      : 'Thanks for getting in touch. We are currently closed — leave your message and we will reply when we reopen (Mon–Sat, 9am–6pm).',
  });

  return created!.id;
}

/** Appends a customer message and bumps the staff unread counter. */
export async function appendCustomerMessage(
  conversationId: string,
  body: string,
  authorName?: string | null,
) {
  await db.transaction(async (tx) => {
    await tx.insert(chatMessages).values({
      conversationId,
      authorRole: 'customer',
      body,
      authorName: authorName ?? null,
    });
    await tx
      .update(chatConversations)
      .set({
        lastMessageAt: new Date(),
        unreadForStaff: sql`${chatConversations.unreadForStaff} + 1`,
        status: 'open',
      })
      .where(eq(chatConversations.id, conversationId));
  });
}

/** Clears the customer's unread badge when they open the panel. */
export async function markCustomerRead(conversationId: string) {
  await db
    .update(chatConversations)
    .set({ unreadForCustomer: 0 })
    .where(eq(chatConversations.id, conversationId));
}
