'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import type { ChatView } from '@/lib/chat';
import { Drawer } from '@/components/ui/overlay';
import { Button } from '@/components/ui/button';
import { SpinnerIcon } from '@/components/ui/icons';
import { whatsappGeneralLink } from '@/lib/whatsapp';

/**
 * Customer live-chat panel.
 *
 * Polls while open and stops the moment it closes or the tab is hidden — a
 * background tab polling every few seconds is a battery and bandwidth cost
 * nobody agreed to.
 */

const POLL_INTERVAL_MS = 5000;

export function LiveChatPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const [chat, setChat] = useState<ChatView | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/chat', { cache: 'no-store' });
      if (!response.ok) return;
      const data = (await response.json()) as ChatView & {
        conversationId: string | null;
      };
      setChat(data.conversationId ? data : { ...data, messages: [] });
    } catch {
      // Transient network failure; the next poll will pick it up.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    // Polling a server resource is exactly what effects are for. `load` only
    // touches state after its first `await`, so this cannot cascade renders —
    // the lint rule cannot see across the await boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();

    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [open, load]);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [chat?.messages.length, open]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, originPath: pathname }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(
          (data as { error?: string }).error ?? 'Your message did not send.',
        );
        return;
      }
      setChat(data as ChatView);
      setDraft('');
    } catch {
      setError(
        'Your message did not send. Check your connection and try again.',
      );
    } finally {
      setSending(false);
    }
  };

  const messages = chat?.messages ?? [];
  const online = chat?.staffOnline ?? false;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Nordic Lux support"
      side="right"
      className="sm:w-[26rem]"
      footer={
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="space-y-3"
        >
          {error ? (
            <p role="alert" className="text-signal-danger text-xs">
              {error}
            </p>
          ) : null}
          <div className="flex items-end gap-2">
            <label htmlFor="chat-message" className="sr-only">
              Your message
            </label>
            <textarea
              id="chat-message"
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter makes a new line.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Type your message…"
              maxLength={2000}
              className="border-line-strong bg-surface text-fg placeholder:text-fg-subtle focus:border-fg max-h-32 flex-1 resize-none border px-3 py-2 text-sm focus:outline-none"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!draft.trim()}
              loading={sending}
              loadingLabel="Sending"
            >
              Send
            </Button>
          </div>
        </form>
      }
    >
      <div className="border-line border-b px-5 py-3">
        <p className="text-fg-muted flex items-center gap-2 text-xs">
          <span
            aria-hidden
            className={cn(
              'size-1.5 rounded-full',
              online ? 'bg-signal-success' : 'bg-fg-subtle',
            )}
          />
          {online
            ? 'We are online — replies usually within a few minutes.'
            : 'Currently closed. Leave a message and we will reply when we reopen.'}
        </p>
        {!online ? (
          <p className="text-fg-subtle mt-2 text-xs">
            Monday to Saturday, 9am–6pm. For anything urgent,{' '}
            <a
              href={whatsappGeneralLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="link-retract text-fg-muted"
            >
              message us on WhatsApp
            </a>
            .
          </p>
        ) : null}
      </div>

      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {!loaded ? (
          <p className="text-fg-subtle flex items-center gap-2 text-xs">
            <SpinnerIcon width={14} height={14} />
            Loading conversation…
          </p>
        ) : messages.length === 0 ? (
          <p className="text-fg-muted text-sm">
            Ask us anything about a product, an order, or a routine. We do not
            give medical advice, but we are happy to talk through textures,
            ingredients and how things are used.
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'max-w-[85%] px-3.5 py-2.5 text-sm',
                message.authorRole === 'customer'
                  ? 'bg-fg text-surface ml-auto'
                  : message.authorRole === 'system'
                    ? 'border-line bg-surface-raised text-fg-muted border'
                    : 'border-line bg-surface-raised text-fg border',
              )}
            >
              {message.authorRole === 'staff' ? (
                <p className="eyebrow text-fg-subtle mb-1">
                  {message.authorName ?? 'Nordic Lux'}
                </p>
              ) : null}
              {/* Rendered as text — chat bodies are never treated as markup. */}
              <p className="break-words whitespace-pre-wrap">{message.body}</p>
              <time
                dateTime={message.createdAt}
                className={cn(
                  'mt-1 block text-[10px]',
                  message.authorRole === 'customer'
                    ? 'text-surface/60'
                    : 'text-fg-subtle',
                )}
              >
                {new Date(message.createdAt).toLocaleTimeString('en-GB', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </div>
          ))
        )}
      </div>
    </Drawer>
  );
}
