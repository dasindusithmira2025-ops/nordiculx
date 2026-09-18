'use client';

import { useState } from 'react';
import { whatsappGeneralLink } from '@/lib/whatsapp';
import { ChatIcon, WhatsAppIcon } from '@/components/ui/icons';
import { LiveChatPanel } from './live-chat-panel';

/**
 * Floating support actions.
 *
 * Live chat and WhatsApp are separate actions so customers can choose their
 * preferred channel immediately. The WhatsApp action keeps the platform's
 * recognizable green mark; live chat stays in the Nordic Lux ink palette.
 */
export function SupportLauncher() {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <>
      <div className="fixed right-4 bottom-4 z-30 flex flex-col items-center gap-2 sm:right-5 sm:bottom-5 print:hidden">
        <button
          type="button"
          aria-label="Open live chat"
          title="Live chat"
          onClick={() => setChatOpen(true)}
          className="border-line-strong bg-fg text-surface shadow-lift hover:bg-accent hover:text-accent-fg flex size-12 items-center justify-center border transition-colors"
        >
          <ChatIcon width={22} height={22} />
        </button>

        <a
          href={whatsappGeneralLink()}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat with Nordic Lux on WhatsApp"
          title="WhatsApp"
          className="shadow-lift flex size-12 items-center justify-center border border-[#25d366] bg-[#25d366] text-white transition-colors hover:border-[#1ebe5d] hover:bg-[#1ebe5d]"
        >
          <WhatsAppIcon width={23} height={23} />
          <span className="sr-only">WhatsApp</span>
        </a>
      </div>

      <LiveChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
    </>
  );
}
