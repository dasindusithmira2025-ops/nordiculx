'use client';

import { useState, type ReactNode } from 'react';
import type { NavItem } from '@/lib/catalogue/taxonomy';
import { SiteHeader } from './site-header';
import { SearchDialog } from '@/components/commerce/search-dialog';
import { CartDrawer } from '@/components/commerce/cart-drawer';
import { useCart } from '@/components/commerce/cart-provider';

/**
 * Client shell for the storefront.
 *
 * Owns the two pieces of UI state that live above the page — the search panel
 * and the bag drawer — so pages stay server components and never need to be
 * client-side just to open a drawer.
 */
export function StorefrontShell({
  navigation,
  wishlistCount,
  isSignedIn,
  socialLinks,
  children,
}: {
  navigation: NavItem[];
  wishlistCount: number;
  isSignedIn: boolean;
  /** A Server Component slot rendered inside the interactive header. */
  socialLinks?: ReactNode;
  children: ReactNode;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const { count, openCart } = useCart();

  return (
    <>
      <SiteHeader
        navigation={navigation}
        cartCount={count}
        wishlistCount={wishlistCount}
        isSignedIn={isSignedIn}
        socialLinks={socialLinks}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenCart={openCart}
      />

      <main id="main" className="min-h-[60dvh]">
        {children}
      </main>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
      <CartDrawer />
    </>
  );
}
