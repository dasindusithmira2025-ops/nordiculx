import { publicConfig } from '@/lib/public-config';

/**
 * Structured data.
 *
 * Every payload here is built from values this application controls — never
 * from a query string or user-submitted text — which is why serialising with
 * `JSON.stringify` into a `<script>` is safe. `JSON.stringify` also escapes the
 * quotes and backslashes that would otherwise break out of the tag.
 *
 * One rule: structured data must describe what the page actually shows. Markup
 * that disagrees with the visible page is what earns a manual penalty, so these
 * builders take the same values the page renders rather than re-deriving them.
 */

/** Renders a JSON-LD block. Kept in one place so the escaping is too. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

const base = publicConfig.appUrl.replace(/\/$/, '');

export function organisationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: publicConfig.appName,
    url: base,
    logo: `${base}/icon.svg`,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      url: `${base}/contact`,
      availableLanguage: ['en'],
    },
  };
}

/**
 * WebSite with a SearchAction, which is what lets a search engine offer a
 * sitelinks search box. The target must be a real, working search URL.
 */
export function webSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: publicConfig.appName,
    url: base,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${base}/shop?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * Breadcrumb trail. Home is prepended because the visible breadcrumb starts
 * there too, and the two must agree.
 */
export function breadcrumbSchema(trail: { label: string; href: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [{ label: 'Home', href: '/' }, ...trail].map(
      (crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: crumb.label,
        item: `${base}${crumb.href}`,
      }),
    ),
  };
}
