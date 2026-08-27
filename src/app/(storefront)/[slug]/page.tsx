import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPageBySlug } from '@/lib/catalogue/taxonomy';
import { PageHeader } from '@/components/layout/page-header';
import { ContentBlocks } from '@/components/content/blocks';

/**
 * CMS-driven static pages: /about, /authenticity, /shipping, /returns-policy,
 * /privacy, /terms, /cookies.
 *
 * One dynamic route rather than seven near-identical files. Next resolves
 * static segments before dynamic ones, so this never shadows a real route —
 * adding `/checkout` later takes precedence over this automatically.
 *
 * Bodies are typed content blocks, so the legal copy renders through the same
 * fixed component map as everything else and there is no HTML-injection path
 * from the CMS into a policy page.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) return { title: 'Not found — Nordic Lux' };

  return {
    title: page.seoTitle ?? `${page.title} — Nordic Lux`,
    description: page.seoDescription ?? undefined,
    alternates: { canonical: `/${page.slug}` },
  };
}

export default async function CmsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const page = await getPageBySlug(slug);
  if (!page) notFound();

  const updated = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(page.updatedAt);

  return (
    <>
      <PageHeader
        eyebrow="Information"
        title={page.title}
        trail={[{ label: page.title, href: `/${page.slug}` }]}
      />

      <div className="page-x mx-auto max-w-(--container-page) pb-28">
        <ContentBlocks blocks={page.body} />

        {/* Policy pages are only trustworthy if the reader can see how current
            they are. */}
        <p className="border-line text-fg-subtle mt-16 border-t pt-6 text-xs">
          Last updated {updated}.
        </p>
      </div>
    </>
  );
}
