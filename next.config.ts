import type { NextConfig } from 'next';

/**
 * Security headers applied to every response.
 * CSP is intentionally strict; see docs/SECURITY.md.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

/**
 * Routes retired with the Pantry range.
 *
 * The taxonomy and its products are ARCHIVED in the database, not deleted, so
 * order history and the products themselves survive and the decision is
 * reversible. Archiving alone would 404 the URLs, which are linked from
 * elsewhere and indexed, so each retired slug is sent to the nearest page that
 * still means something.
 *
 * Deliberately temporary (307), not permanent: a 308 is cached by browsers
 * effectively forever, and un-retiring a range that has been 308'd is a
 * support problem for every customer who visited it once.
 */
const retiredPantryRoutes = [
  { from: '/category/pantry', to: '/shop' },
  { from: '/category/tea', to: '/category/wellness' },
  { from: '/category/preserves', to: '/category/wellness' },
  { from: '/brands/saga-pantry', to: '/brands' },
  { from: '/product/saga-birch-tea', to: '/category/wellness' },
  { from: '/product/saga-cloudberry-preserve', to: '/category/wellness' },
  { from: '/product/saga-forest-honey', to: '/category/wellness' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: 'minio' },
    ],
  },
  experimental: {
    optimizePackageImports: ['@/components/ui'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async redirects() {
    return retiredPantryRoutes.map(({ from, to }) => ({
      source: from,
      destination: to,
      permanent: false,
    }));
  },
};

export default nextConfig;
