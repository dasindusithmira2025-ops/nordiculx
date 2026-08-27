'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import type { NavItem } from '@/lib/catalogue/taxonomy';
import { Wordmark } from './wordmark';
import { IconButton } from '@/components/ui/button';
import { Drawer } from '@/components/ui/overlay';
import {
  BagIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  HeartIcon,
  MenuIcon,
  SearchIcon,
  UserIcon,
} from '@/components/ui/icons';

/**
 * Site header with desktop mega navigation and a mobile drawer.
 *
 * Interaction rules (docs/ACCESSIBILITY.md § Menu navigation):
 *   - each top-level item with children is a <button aria-expanded>, not a link
 *     that also opens something; a control does one thing
 *   - pointer users get hover-to-open with a small close delay so a diagonal
 *     mouse path to the panel does not dismiss it
 *   - keyboard users get click-to-toggle, Escape to close, and focus returns
 *     to the trigger
 *   - the panel closes on route change, which `usePathname` drives
 */
export function SiteHeader({
  navigation,
  cartCount = 0,
  wishlistCount = 0,
  isSignedIn = false,
  onOpenSearch,
  onOpenCart,
}: {
  navigation: NavItem[];
  cartCount?: number;
  wishlistCount?: number;
  isSignedIn?: boolean;
  onOpenSearch?: () => void;
  onOpenCart?: () => void;
}) {
  const pathname = usePathname();
  const [openId, setOpenId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const navRef = useRef<HTMLElement>(null);

  // Navigating away must never leave a panel hanging open. Resetting during
  // render (rather than in an effect) collapses the panel in the same commit
  // as the new route, so there is no frame where the old panel is still shown.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpenId(null);
    setMobileOpen(false);
  }

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpenId(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [openId]);

  const cancelClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpenId(null), 180);
  };

  return (
    <>
      <header className="border-line bg-surface/95 sticky top-0 z-40 border-b backdrop-blur-sm">
        <nav
          ref={navRef}
          aria-label="Primary"
          className="page-x mx-auto flex h-16 max-w-(--container-page) items-center gap-4 md:h-20"
          onMouseLeave={scheduleClose}
        >
          {/* Mobile menu trigger */}
          <IconButton
            label="Open menu"
            className="-ml-2 lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <MenuIcon />
          </IconButton>

          <Wordmark />

          {/* Desktop navigation */}
          <ul className="ml-6 hidden items-center lg:flex xl:ml-10">
            {navigation.map((item) => {
              const hasChildren = item.children.length > 0;
              const isOpen = openId === item.id;

              if (!hasChildren) {
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className="eyebrow text-fg-muted hover:text-fg inline-flex h-20 items-center px-3 whitespace-nowrap transition-colors"
                      onMouseEnter={() => {
                        cancelClose();
                        setOpenId(null);
                      }}
                    >
                      {item.label}
                      {item.badge ? (
                        <span className="text-signal-sale ml-1.5">•</span>
                      ) : null}
                    </Link>
                  </li>
                );
              }

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`meganav-${item.id}`}
                    className={cn(
                      'eyebrow inline-flex h-20 items-center gap-1.5 px-3 whitespace-nowrap transition-colors',
                      isOpen ? 'text-fg' : 'text-fg-muted hover:text-fg',
                    )}
                    onClick={() => setOpenId(isOpen ? null : item.id)}
                    onMouseEnter={() => {
                      cancelClose();
                      setOpenId(item.id);
                    }}
                  >
                    {item.label}
                    <ChevronDownIcon
                      width={12}
                      height={12}
                      className={cn(
                        'duration-micro transition-transform',
                        isOpen && 'rotate-180',
                      )}
                    />
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Actions */}
          <div className="ml-auto flex items-center gap-0.5">
            <IconButton label="Search" onClick={onOpenSearch}>
              <SearchIcon />
            </IconButton>

            <Link
              href={isSignedIn ? '/account' : '/account/login'}
              aria-label={isSignedIn ? 'Your account' : 'Sign in'}
              title={isSignedIn ? 'Your account' : 'Sign in'}
              className="text-fg hover:bg-accent-soft inline-flex size-11 items-center justify-center transition-colors"
            >
              <UserIcon />
            </Link>

            <Link
              href="/account/wishlist"
              aria-label={
                wishlistCount > 0
                  ? `Wishlist, ${wishlistCount} items`
                  : 'Wishlist'
              }
              title="Wishlist"
              className="text-fg hover:bg-accent-soft relative inline-flex size-11 items-center justify-center transition-colors"
            >
              <HeartIcon />
              {wishlistCount > 0 ? <CountDot count={wishlistCount} /> : null}
            </Link>

            <button
              type="button"
              onClick={onOpenCart}
              aria-label={
                cartCount > 0 ? `Bag, ${cartCount} items` : 'Bag, empty'
              }
              title="Bag"
              className="text-fg hover:bg-accent-soft relative inline-flex size-11 items-center justify-center transition-colors"
            >
              <BagIcon />
              {cartCount > 0 ? <CountDot count={cartCount} /> : null}
            </button>
          </div>
        </nav>

        {/* Mega panels */}
        {navigation.map((item) =>
          item.children.length > 0 ? (
            <MegaPanel
              key={item.id}
              item={item}
              open={openId === item.id}
              onMouseEnter={cancelClose}
              onMouseLeave={scheduleClose}
            />
          ) : null,
        )}
      </header>

      <MobileNav
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        navigation={navigation}
        isSignedIn={isSignedIn}
      />
    </>
  );
}

function CountDot({ count }: { count: number }) {
  return (
    <span
      aria-hidden
      className="bg-fg text-surface absolute top-2 right-1.5 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-medium"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/**
 * Full-width mega panel. Children are grouped into columns by `columnGroup`,
 * which lets merchandising restructure the menu from the admin without a
 * deploy.
 */
function MegaPanel({
  item,
  open,
  onMouseEnter,
  onMouseLeave,
}: {
  item: NavItem;
  open: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const columns = new Map<string, NavItem[]>();
  for (const child of item.children) {
    const key = child.columnGroup ?? item.label;
    const existing = columns.get(key);
    if (existing) existing.push(child);
    else columns.set(key, [child]);
  }

  return (
    <div
      id={`meganav-${item.id}`}
      hidden={!open}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        'border-line bg-surface-raised absolute inset-x-0 top-full hidden border-b lg:block',
        open && 'animate-slide-down',
      )}
    >
      <div className="page-x mx-auto grid max-w-(--container-page) grid-cols-4 gap-10 py-12">
        {[...columns.entries()].map(([group, items]) => (
          <div key={group}>
            <p className="eyebrow text-fg-subtle mb-5">{group}</p>
            <ul className="space-y-3">
              {items.map((child) => (
                <li key={child.id}>
                  <Link
                    href={child.href}
                    className="link-underline text-fg-muted hover:text-fg text-sm transition-colors"
                  >
                    {child.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {/* Editorial tile fills the trailing column so the panel never looks
            like a bare list of links. */}
        <div className="border-line col-start-4 row-start-1 self-start border p-8">
          <p className="eyebrow text-fg-subtle mb-3">
            Not sure where to start?
          </p>
          <p className="font-display text-display-sm">
            Four questions, one honest routine.
          </p>
          <Link
            href="/routine-finder"
            className="eyebrow text-fg link-underline mt-6 inline-flex items-center gap-2"
          >
            Routine Finder
            <ChevronRightIcon width={12} height={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Mobile navigation: a drawer with one level of in-place expansion. */
function MobileNav({
  open,
  onClose,
  navigation,
  isSignedIn,
}: {
  open: boolean;
  onClose: () => void;
  navigation: NavItem[];
  isSignedIn: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <Drawer open={open} onClose={onClose} title="Menu" side="left">
      <nav aria-label="Mobile" className="flex flex-col">
        {navigation.map((item) => {
          const hasChildren = item.children.length > 0;
          const isExpanded = expanded === item.id;

          if (!hasChildren) {
            return (
              <Link
                key={item.id}
                href={item.href}
                className="border-line font-display text-fg flex items-center justify-between border-b px-5 py-4 text-xl"
              >
                {item.label}
                <ChevronRightIcon
                  width={16}
                  height={16}
                  className="text-fg-subtle"
                />
              </Link>
            );
          }

          return (
            <div key={item.id} className="border-line border-b">
              <button
                type="button"
                aria-expanded={isExpanded}
                aria-controls={`mobilenav-${item.id}`}
                onClick={() => setExpanded(isExpanded ? null : item.id)}
                className="font-display text-fg flex w-full items-center justify-between px-5 py-4 text-left text-xl"
              >
                {item.label}
                <ChevronDownIcon
                  width={16}
                  height={16}
                  className={cn(
                    'text-fg-subtle duration-micro transition-transform',
                    isExpanded && 'rotate-180',
                  )}
                />
              </button>

              <div id={`mobilenav-${item.id}`} hidden={!isExpanded}>
                <ul className="bg-surface-sunken/40 pb-4">
                  <li>
                    <Link
                      href={item.href}
                      className="text-fg block px-5 py-2.5 text-sm"
                    >
                      All {item.label}
                    </Link>
                  </li>
                  {item.children.map((child) => (
                    <li key={child.id}>
                      <Link
                        href={child.href}
                        className="text-fg-muted block px-5 py-2.5 text-sm"
                      >
                        {child.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}

        <div className="mt-8 space-y-1 px-5 pb-10">
          <Link
            href={isSignedIn ? '/account' : '/account/login'}
            className="eyebrow text-fg-muted block py-3"
          >
            {isSignedIn ? 'Your account' : 'Sign in'}
          </Link>
          <Link
            href="/account/wishlist"
            className="eyebrow text-fg-muted block py-3"
          >
            Wishlist
          </Link>
          <Link href="/track" className="eyebrow text-fg-muted block py-3">
            Track your order
          </Link>
          <Link href="/contact" className="eyebrow text-fg-muted block py-3">
            Contact
          </Link>
        </div>
      </nav>
    </Drawer>
  );
}
