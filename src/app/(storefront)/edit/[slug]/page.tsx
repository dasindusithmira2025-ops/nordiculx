import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getArticleBySlug,
  getArticleProductIds,
  getArticles,
} from '@/lib/catalogue/taxonomy';
import { getProductsByIds } from '@/lib/catalogue/products';
import { publicConfig } from '@/lib/public-config';
import { trackEvent } from '@/lib/analytics';
import { Breadcrumbs } from '@/components/layout/page-header';
import {
  ContentBlocks,
  ShopTheStory,
  collectProductIds,
} from '@/components/content/blocks';

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const row = await getArticleBySlug(slug);
  if (!row) return { title: 'Not found — Nordic Lux' };

  const { article } = row;
  return {
    title: article.seoTitle ?? `${article.title} — Nordic Lux`,
    description: article.seoDescription ?? article.excerpt ?? undefined,
    alternates: { canonical: `/edit/${article.slug}` },
    openGraph: {
      type: 'article',
      title: article.title,
      description: article.excerpt ?? undefined,
      publishedTime: article.publishedAt?.toISOString(),
      images: article.heroImageUrl
        ? [{ url: article.heroImageUrl }]
        : undefined,
    },
  };
}

/**
 * Article page.
 *
 * `getArticleBySlug` filters on `publishedAt <= now`, so a scheduled piece 404s
 * until its moment rather than being reachable by guessing the slug.
 *
 * Two sources of products are merged deliberately: ids embedded in the body as
 * blocks, and ids attached to the article as a relation for the "Shop the story"
 * strip. Both are resolved in one `getProductsByIds` call — the alternative was
 * two queries returning overlapping rows.
 */
export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const row = await getArticleBySlug(slug);
  if (!row) notFound();

  const { article, topicName, topicSlug } = row;

  await trackEvent(
    'article_view',
    { articleId: article.id, topicSlug },
    { path: `/edit/${slug}` },
  );

  const attachedIds = await getArticleProductIds(article.id);
  const blockIds = collectProductIds(article.body);
  const allIds = [...new Set([...blockIds, ...attachedIds])];
  const products = allIds.length > 0 ? await getProductsByIds(allIds) : [];
  const byId = new Map(products.map((p) => [p.id, p]));

  const attached = attachedIds.flatMap((id) => {
    const product = byId.get(id);
    return product ? [product] : [];
  });

  // Further reading: same topic, this piece removed. Falls back to the newest
  // pieces overall so the end of an article is never a dead end.
  const related = (
    await getArticles(topicSlug ? { topicSlug, limit: 4 } : { limit: 4 })
  )
    .filter((a) => a.id !== article.id)
    .slice(0, 3);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.excerpt ?? undefined,
    image: article.heroImageUrl ?? undefined,
    datePublished: article.publishedAt?.toISOString(),
    dateModified: article.updatedAt.toISOString(),
    author: {
      '@type': article.authorName ? 'Person' : 'Organization',
      name: article.authorName ?? publicConfig.appName,
    },
    publisher: {
      '@type': 'Organization',
      name: publicConfig.appName,
    },
    mainEntityOfPage: `${publicConfig.appUrl}/edit/${article.slug}`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Serialised from values this application controls, not from user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article>
        <header
          data-surface={article.heroDark ? 'ink' : 'paper'}
          className="bg-surface text-fg"
        >
          <div className="page-x mx-auto max-w-(--container-page) pt-8 pb-12 md:pt-12">
            <Breadcrumbs
              trail={[
                { label: 'The Edit', href: '/edit' },
                ...(topicName && topicSlug
                  ? [{ label: topicName, href: `/edit?topic=${topicSlug}` }]
                  : []),
                { label: article.title, href: `/edit/${article.slug}` },
              ]}
              className="mb-10"
            />

            <div className="max-w-3xl">
              <p className="eyebrow text-fg-subtle">{topicName ?? 'Journal'}</p>
              <h1 className="font-display text-display-lg mt-5">
                {article.title}
              </h1>
              {article.excerpt ? (
                <p className="text-fg-muted mt-6 max-w-prose text-lg">
                  {article.excerpt}
                </p>
              ) : null}
              <p className="text-fg-subtle mt-8 text-xs">
                {article.authorName ? `By ${article.authorName} · ` : ''}
                {article.publishedAt ? (
                  <time dateTime={article.publishedAt.toISOString()}>
                    {dateFormat.format(article.publishedAt)}
                  </time>
                ) : null}
                {article.readingMinutes
                  ? ` · ${article.readingMinutes} min read`
                  : null}
              </p>
            </div>
          </div>

          {article.heroImageUrl ? (
            <div className="page-x mx-auto max-w-(--container-page) pb-16">
              <div className="bg-surface-sunken relative aspect-[16/9] w-full overflow-hidden">
                <Image
                  src={article.heroImageUrl}
                  alt={article.heroImageAlt ?? ''}
                  fill
                  priority
                  sizes="(min-width: 1024px) 75rem, 100vw"
                  className="object-cover"
                />
              </div>
            </div>
          ) : null}
        </header>

        <div className="page-x mx-auto max-w-(--container-page) pb-24">
          <ContentBlocks blocks={article.body} products={byId} />

          <ShopTheStory products={attached} />
        </div>
      </article>

      {related.length > 0 ? (
        <aside className="page-x border-line mx-auto max-w-(--container-page) border-t pt-16 pb-28">
          <h2 className="font-display text-display-sm text-fg mb-10">
            Keep reading
          </h2>
          <ul className="grid gap-x-6 gap-y-12 sm:grid-cols-3">
            {related.map((item) => (
              <li key={item.id}>
                <Link href={`/edit/${item.slug}`} className="group block">
                  <div className="bg-surface-sunken relative aspect-[4/3] overflow-hidden">
                    {item.heroImageUrl ? (
                      <Image
                        src={item.heroImageUrl}
                        alt={item.heroImageAlt ?? ''}
                        fill
                        sizes="(min-width: 640px) 30vw, 100vw"
                        className="duration-editorial ease-standard object-cover transition-transform group-hover:scale-[1.02]"
                      />
                    ) : null}
                  </div>
                  <h3 className="font-display text-fg mt-4 text-lg">
                    <span className="link-retract">{item.title}</span>
                  </h3>
                  {item.readingMinutes ? (
                    <p className="text-fg-subtle mt-2 text-xs">
                      {item.readingMinutes} min read
                    </p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
    </>
  );
}
