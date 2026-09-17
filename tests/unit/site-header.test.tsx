// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
      leaf('cleanse', 'Cleanse', 'Categories'),
      leaf('dryness', 'Dryness', 'Shop by Concern'),
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

  it('places server-rendered social profile icons before customer actions', () => {
    render(
      <SiteHeader
        navigation={navigation}
        socialLinks={
          <a
            href="https://www.instagram.com/nordiclux"
            aria-label="Nordic Lux on Instagram"
          >
            Instagram
          </a>
        }
      />,
    );

    expect(
      screen.getByRole('link', { name: 'Nordic Lux on Instagram' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy();
  });
});

describe('SiteHeader mobile navigation', () => {
  // The drawer is a native <dialog>, which jsdom parses but does not operate.
  // These two are the whole of the behaviour the component relies on.
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function close() {
      this.open = false;
    };
  });

  /**
   * The drawer synthesises an "All Skincare" row from the parent. Once
   * merchandising adds an explicit "All Skincare" link to the mega-menu — which
   * the client asked for — the two collide, and a menu listing the same
   * destination twice reads as a bug to a customer and as a duplicate to a
   * crawler.
   */
  const withExplicitAll: NavItem[] = [
    {
      id: 'skincare',
      label: 'Skincare',
      href: '/category/skincare',
      badge: null,
      columnGroup: null,
      children: [
        {
          ...leaf('all-skincare', 'All Skincare', 'Categories'),
          href: '/category/skincare',
        },
        leaf('cleanse', 'Cleanse', 'Categories'),
      ],
    },
  ];

  /** Scoped to the drawer: the desktop nav renders a Skincare trigger too. */
  async function openDrawer(items: NavItem[]) {
    const user = userEvent.setup();
    render(<SiteHeader navigation={items} />);
    await user.click(screen.getByRole('button', { name: 'Open menu' }));

    const drawer = within(screen.getByRole('navigation', { name: 'Menu' }));
    await user.click(drawer.getByRole('button', { name: /Skincare/ }));
    return drawer;
  }

  it('does not repeat a destination the menu already links to', async () => {
    const drawer = await openDrawer(withExplicitAll);

    const toSkincare = drawer
      .getAllByRole('link')
      .filter((el) => el.getAttribute('href') === '/category/skincare');

    expect(toSkincare).toHaveLength(1);
    expect(toSkincare[0]!.textContent).toBe('All Skincare');
  });

  it('still synthesises the parent link when the menu has none', async () => {
    const drawer = await openDrawer([
      {
        id: 'skincare',
        label: 'Skincare',
        href: '/category/skincare',
        badge: null,
        columnGroup: null,
        children: [leaf('cleanse', 'Cleanse', 'Categories')],
      },
    ]);

    expect(drawer.getByRole('link', { name: 'All Skincare' })).toBeTruthy();
  });
});
