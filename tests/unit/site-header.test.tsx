// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SiteHeader } from '@/components/layout/site-header';
import type { NavItem } from '@/lib/catalogue/taxonomy';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

const leaf = (id: string, label: string, columnGroup: string): NavItem => ({
  id,
  label,
  href: `/${id}`,
  badge: null,
  columnGroup,
  children: [],
});

const navigation: NavItem[] = [
  {
    id: 'skincare',
    label: 'Skincare',
    href: '/skincare',
    badge: null,
    columnGroup: null,
    children: [
      leaf('cleanse', 'Cleanse', 'Shop by step'),
      leaf('dryness', 'Dryness', 'Shop by concern'),
    ],
  },
];

describe('SiteHeader mega panel', () => {
  it('stays open when a link inside the panel is clicked', async () => {
    const user = userEvent.setup();
    render(<SiteHeader navigation={navigation} />);

    // Hover, as a pointer user does, rather than click: clicking the trigger
    // again would toggle the panel shut on its own.
    await user.hover(screen.getByRole('button', { name: /Skincare/ }));
    const link = screen.getByRole('link', { name: 'Dryness' });

    const clicks = vi.fn((e: MouseEvent) => e.preventDefault());
    link.addEventListener('click', clicks);
    await user.click(link);

    // The panel must survive pointerdown so the link actually receives the
    // click; a nav-scoped outside-click check closed it first.
    expect(clicks).toHaveBeenCalledOnce();
    expect(
      screen
        .getByRole('button', { name: /Skincare/ })
        .getAttribute('aria-expanded'),
    ).toBe('true');
  });
});
