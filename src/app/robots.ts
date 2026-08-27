import type { MetadataRoute } from 'next';
import { publicConfig } from '@/lib/public-config';

/**
 * robots.txt.
 *
 * The disallow list is a courtesy to well-behaved crawlers, not a security
 * control — anything genuinely private is protected by a session check and
 * carries `noindex` in its own metadata. Listing a path here does not hide it.
 *
 * `/track/` matters most: those URLs carry a single-use token, and a crawler
 * following one from a leaked referrer would put an order in an index.
 */
export default function robots(): MetadataRoute.Robots {
  const base = publicConfig.appUrl.replace(/\/$/, '');

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/account/',
          '/checkout',
          '/order/',
          '/track/',
          '/api/',
          // Faceted URLs multiply into near-duplicate pages; the canonical
          // listing is the unfiltered one.
          '/*?*brand=',
          '/*?*concern=',
          '/*?*skin=',
          '/*?*sort=',
          '/*?*page=',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
