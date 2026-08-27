import type { ReactNode } from 'react';
import { getAnnouncements, getNavigation } from '@/lib/catalogue/taxonomy';
import { getCartCount } from '@/lib/cart';
import { currentUser } from '@/lib/auth';
import { getWishlistCount } from '@/lib/wishlist';
import { AnnouncementBar } from '@/components/layout/announcement-bar';
import { StorefrontShell } from '@/components/layout/storefront-shell';
import { SiteFooter } from '@/components/layout/site-footer';
import { CartProvider } from '@/components/commerce/cart-provider';
import { SupportLauncher } from '@/components/support/support-launcher';
import { PageView } from '@/components/analytics/page-view';
import {
  JsonLd,
  organisationSchema,
  webSiteSchema,
} from '@/lib/seo/structured-data';

/**
 * Storefront layout.
 *
 * Everything customer-facing renders inside this; the admin has its own layout
 * and shares none of this chrome. The four lookups below are parallelised
 * because they are independent, and each is deduped by React `cache()` if a
 * page needs the same data again.
 */
export default async function StorefrontLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [navigation, announcements, cartCount, user] = await Promise.all([
    getNavigation('header'),
    getAnnouncements(),
    getCartCount(),
    currentUser(),
  ]);

  const wishlistCount = user ? await getWishlistCount(user.id) : 0;

  return (
    <CartProvider initialCount={cartCount}>
      {/* Site-wide identity. Declared once in the storefront layout rather than
          per page, so it cannot contradict itself between routes. */}
      <JsonLd data={organisationSchema()} />
      <JsonLd data={webSiteSchema()} />
      <AnnouncementBar messages={announcements} />
      <StorefrontShell
        navigation={navigation}
        wishlistCount={wishlistCount}
        isSignedIn={Boolean(user)}
      >
        {children}
      </StorefrontShell>
      <SiteFooter />
      <SupportLauncher />
      <PageView />
    </CartProvider>
  );
}
