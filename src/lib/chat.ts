import 'server-only';
import { cookies } from 'next/headers';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db, type Transaction } from '@/lib/db';
import { chatConversations, chatMessages, users } from '@/lib/db/schema';
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

export type StaffChatConversation = ChatView & {
  guestName: string | null;
  guestEmail: string | null;
  customerEmail: string | null;
  originPath: string | null;
  lastMessageAt: Date;
  unreadForStaff: number;
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

/** Support queue projection. Callers must enforce staff authorisation. */
export async function listStaffConversations(): Promise<
  Omit<StaffChatConversation, 'messages' | 'staffOnline'>[]
> {
  const rows = await db
    .select({
      id: chatConversations.id,
      status: chatConversations.status,
      guestName: chatConversations.guestName,
      guestEmail: chatConversations.guestEmail,
      customerEmail: users.email,
      originPath: chatConversations.originPath,
      lastMessageAt: chatConversations.lastMessageAt,
      unreadForStaff: chatConversations.unreadForStaff,
    })
    .from(chatConversations)
    .leftJoin(users, eq(users.id, chatConversations.userId))
    .orderBy(desc(chatConversations.lastMessageAt))
    .limit(100);

  return rows.map((row) => ({
    conversationId: row.id,
    status: row.status,
    guestName: row.guestName,
    guestEmail: row.guestEmail,
    customerEmail: row.customerEmail,
    originPath: row.originPath,
    lastMessageAt: row.lastMessageAt,
    unreadForStaff: row.unreadForStaff,
  }));
}

/** One conversation for the staff workspace. Callers must enforce access. */
export async function getStaffConversation(
  conversationId: string,
): Promise<StaffChatConversation | null> {
  const rows = await db
    .select({
      id: chatConversations.id,
      status: chatConversations.status,
      guestName: chatConversations.guestName,
      guestEmail: chatConversations.guestEmail,
      customerEmail: users.email,
      originPath: chatConversations.originPath,
      lastMessageAt: chatConversations.lastMessageAt,
      unreadForStaff: chatConversations.unreadForStaff,
    })
    .from(chatConversations)
    .leftJoin(users, eq(users.id, chatConversations.userId))
    .where(eq(chatConversations.id, conversationId))
    .limit(1);
  const conversation = rows[0];
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
    guestName: conversation.guestName,
    guestEmail: conversation.guestEmail,
    customerEmail: conversation.customerEmail,
    originPath: conversation.originPath,
    lastMessageAt: conversation.lastMessageAt,
    unreadForStaff: conversation.unreadForStaff,
    staffOnline: staffOnline(),
    messages: messages.map((message) => ({
      id: message.id,
      authorRole: message.authorRole,
      authorName: message.authorName,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    })),
  };
}

/** Marks a conversation read by staff after the authorised page has loaded. */
export async function markStaffRead(conversationId: string) {
  await db
    .update(chatConversations)
    .set({ unreadForStaff: 0 })
    .where(eq(chatConversations.id, conversationId));
}

/** Appends an authenticated staff reply and wakes the customer's poller. */
export async function appendStaffMessage(
  tx: Transaction,
  input: {
    conversationId: string;
    body: string;
    authorId: string;
    authorName: string;
  },
) {
  const [conversation] = await tx
    .select({ status: chatConversations.status })
    .from(chatConversations)
    .where(eq(chatConversations.id, input.conversationId))
    .for('update')
    .limit(1);
  if (!conversation) throw new Error('Conversation not found.');

  await tx.insert(chatMessages).values({
    conversationId: input.conversationId,
    authorRole: 'staff',
    authorId: input.authorId,
    authorName: input.authorName,
    body: input.body,
  });
  await tx
    .update(chatConversations)
    .set({
      lastMessageAt: new Date(),
      unreadForCustomer: sql`${chatConversations.unreadForCustomer} + 1`,
      status: 'pending',
    })
    .where(eq(chatConversations.id, input.conversationId));
  return { previousStatus: conversation.status };
}
