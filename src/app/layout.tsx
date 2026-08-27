import type { Metadata, Viewport } from 'next';
import { fontVariables } from '@/lib/fonts';
import { publicEnv } from '@/lib/env';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.appUrl),
  title: {
    default: 'Nordic Lux — Curated beauty, wellness and pantry',
    template: '%s | Nordic Lux',
  },
  description:
    'A curated house of beauty, skincare, fragrance, wellness and pantry from small northern studios. Considered products, honestly described.',
  applicationName: 'Nordic Lux',
  openGraph: {
    type: 'website',
    siteName: 'Nordic Lux',
    locale: 'en_GB',
    url: publicEnv.appUrl,
  },
  twitter: { card: 'summary_large_image' },
  robots: {
    // Staff and account areas are additionally blocked in robots.ts.
    index: true,
    follow: true,
  },
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The browser UI colour matches the announcement bar, not the page body,
  // because that is what sits under the status bar when scrolled to the top.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0D0F0E' },
    { media: '(prefers-color-scheme: dark)', color: '#0D0F0E' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <body className="bg-surface text-fg min-h-dvh antialiased">
        {/* First tab stop on every page. */}
        <a
          href="#main"
          className="sr-only-focusable bg-fg text-2xs tracking-eyebrow text-surface fixed top-4 left-4 z-50 px-5 py-3 uppercase"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
