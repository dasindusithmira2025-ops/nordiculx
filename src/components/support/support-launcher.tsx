'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { whatsappGeneralLink } from '@/lib/whatsapp';
import {
  ChatIcon,
  CloseIcon,
  ExternalIcon,
  WhatsAppIcon,
} from '@/components/ui/icons';
import { LiveChatPanel } from './live-chat-panel';

/**
 * Floating support entry.
 *
 * Deliberately small and low-contrast until interacted with — a pulsing badge
 * over a luxury storefront reads as a support ticket queue, not a boutique.
 * Collapsed it is a single button; expanded it offers live chat and WhatsApp.
 */
export function SupportLauncher() {
  const [open, setOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <>
      <div
        ref={containerRef}
        className="fixed right-5 bottom-5 z-30 flex flex-col items-end gap-3 print:hidden"
      >
        {open ? (
          <div
            id="support-menu"
            className="animate-fade-up border-line bg-surface-raised shadow-overlay w-64 border"
          >
            <p className="eyebrow border-line text-fg-subtle border-b px-4 py-3">
              How can we help?
            </p>

            <button
              type="button"
              onClick={() => {
                setChatOpen(true);
                setOpen(false);
              }}
              className="text-fg hover:bg-accent-soft flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm transition-colors"
            >
              <ChatIcon
                width={18}
                height={18}
                className="text-fg-muted shrink-0"
              />
              <span>
                Live chat
                <span className="text-fg-subtle block text-xs">
                  We reply during opening hours
                </span>
              </span>
            </button>

            <a
              href={whatsappGeneralLink()}
              target="_blank"
              rel="noopener noreferrer"
              className="border-line text-fg hover:bg-accent-soft flex w-full items-center gap-3 border-t px-4 py-3.5 text-sm transition-colors"
            >
              <WhatsAppIcon
                width={18}
                height={18}
                className="text-fg-muted shrink-0"
              />
              <span className="flex-1">
                WhatsApp
                <span className="text-fg-subtle block text-xs">
                  Opens in WhatsApp
                </span>
              </span>
              <ExternalIcon
                width={13}
                height={13}
                className="text-fg-subtle shrink-0"
              />
            </a>
          </div>
        ) : null}

        <button
          type="button"
          aria-expanded={open}
          aria-controls="support-menu"
          aria-label={open ? 'Close support menu' : 'Open support menu'}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'border-line-strong flex size-12 items-center justify-center border',
            'bg-surface-raised text-fg shadow-lift transition-colors',
            'hover:bg-fg hover:text-surface',
          )}
        >
          {open ? <CloseIcon /> : <ChatIcon />}
        </button>
      </div>

      <LiveChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
    </>
  );
}
