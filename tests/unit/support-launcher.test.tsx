// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SupportLauncher } from '@/components/support/support-launcher';

vi.mock('@/components/support/live-chat-panel', () => ({
  LiveChatPanel: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Live chat panel</div> : null,
}));

describe('SupportLauncher', () => {
  it('renders live chat and WhatsApp as separate actions', () => {
    render(<SupportLauncher />);

    expect(screen.getByRole('button', { name: 'Open live chat' })).toBeTruthy();

    const whatsapp = screen.getByRole('link', {
      name: 'Chat with Nordic Lux on WhatsApp',
    });
    expect(whatsapp).toBeTruthy();
    expect(whatsapp.getAttribute('href')).toBe(
      'https://wa.me/94770130299?text=Hello%20Nordic%20Lux%2C%20I%20have%20a%20question.',
    );
    expect(screen.queryByText('How can we help?')).toBeNull();
  });

  it('opens the live-chat panel directly', async () => {
    const user = userEvent.setup();
    render(<SupportLauncher />);

    await user.click(screen.getByRole('button', { name: 'Open live chat' }));

    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
