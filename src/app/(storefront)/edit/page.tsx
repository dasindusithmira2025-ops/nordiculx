import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getArticleTopics, getArticles } from '@/lib/catalogue/taxonomy';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/display';
import { ButtonLink } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'The Edit — Nordic Lux',
  description:
    'How to use what you own: routines, ingredient explainers and notes from the studios we carry.',
  alternates: { canonical: '/edit' },
};

/** Publication date, spelled out. Never a bare numeric date. */
const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * Editorial index.
 *
 * The lead article gets a wide slot and the rest a three-up grid — an unbroken
 * grid of equal cards gives a reader no way to tell what is worth starting with.
 *
 * Topic filtering is a link per topic, not a client-side filter: the topic is in
 * the URL, so a topic page is shareable and works before hydration. `topic` is
 * validated against the real topic list rather than trusted, so an invented
 * value falls back to "all" instead of silently returning nothing.
 */
export default async function EditPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.topic) ? params.topic[0] : params.topic;

  const topics = await getArticleTopics();
  const activeTopic = topics.find((t) => t.slug === raw)?.slug;

  const articles = await getArticles(
    activeTopic ? { topicSlug: activeTopic } : {},
  );

  const [lead, ...rest] = articles;

  return (
    <>
      <PageHeader
        eyebrow="Journal"
        title="The Edit"
        description="Notes on using what you already own — routines that survive humidity, how to read an ingredient list, and the studios behind the range."
        trail={[{ label: 'The Edit', href: '/edit' }]}
      />

      <div className="page-x mx-auto max-w-(--container-page) pb-28">
        {topics.length > 0 ? (
          <nav aria-label="Topics" className="border-line mb-14 border-b pb-6">
            <ul className="flex flex-wrap gap-x-6 gap-y-3">
              <li>
                <Link
                  href="/edit"
                  aria-current={activeTopic ? undefined : 'page'}
                  className={
                    activeTopic
                      ? 'eyebrow text-fg-subtle hover:text-fg'
                      : 'eyebrow text-fg link-underline'
                  }
                >
                  All
                </Link>
              </li>
              {topics.map((topic) => (
                <li key={topic.id}>
                  <Link
                    href={`/edit?topic=${topic.slug}`}
                    aria-current={
                      activeTopic === topic.slug ? 'page' : undefined
                    }
                    className={
                      activeTopic === topic.slug
                        ? 'eyebrow text-fg link-underline'
                        : 'eyebrow text-fg-subtle hover:text-fg'
                    }
                  >
                    {topic.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {articles.length === 0 ? (
          <EmptyState
            title="Nothing published here yet"
            description={
              activeTopic
                ? 'This topic has no published pieces. Try the full journal.'
                : 'The journal is being written. In the meantime, the range is in the shop.'
            }
            action={
              <ButtonLink
                href={activeTopic ? '/edit' : '/shop'}
                variant="secondary"
              >
                {activeTopic ? 'All topics' : 'Shop all'}
              </ButtonLink>
            }
          />
        ) : null}

        {lead ? (
          <Link
            href={`/edit/${lead.slug}`}
            className="group border-line block border-b pb-14"
          >
            <div className="grid gap-8 md:grid-cols-2 md:items-center md:gap-12">
              <div className="bg-surface-sunken relative aspect-[4/3] overflow-hidden">
                {lead.heroImageUrl ? (
                  <Image
                    src={lead.heroImageUrl}
                    alt={lead.heroImageAlt ?? ''}
                    fill
                    priority
                    sizes="(min-width: 768px) 45vw, 100vw"
                    className="duration-editorial ease-standard object-cover transition-transform group-hover:scale-[1.02]"
                  />
                ) : null}
              </div>
              <div>
                <p className="eyebrow text-fg-subtle">
                  {lead.topicName ?? 'Journal'}
                </p>
                <h2 className="font-display text-display-md text-fg mt-4">
                  <span className="link-retract">{lead.title}</span>
                </h2>
                {lead.excerpt ? (
                  <p className="text-fg-muted mt-5 max-w-prose text-base">
                    {lead.excerpt}
                  </p>
                ) : null}
                <p className="text-fg-subtle mt-6 text-xs">
                  {lead.publishedAt
                    ? dateFormat.format(lead.publishedAt)
                    : null}
                  {lead.readingMinutes
                    ? ` · ${lead.readingMinutes} min read`
                    : null}
                </p>
              </div>
            </div>
          </Link>
        ) : null}

        {rest.length > 0 ? (
          <ul className="mt-14 grid gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((article) => (
              <li key={article.id}>
                <Link href={`/edit/${article.slug}`} className="group block">
                  <div className="bg-surface-sunken relative aspect-[4/3] overflow-hidden">
                    {article.heroImageUrl ? (
                      <Image
                        src={article.heroImageUrl}
                        alt={article.heroImageAlt ?? ''}
                        fill
                        sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
                        className="duration-editorial ease-standard object-cover transition-transform group-hover:scale-[1.02]"
                      />
                    ) : null}
                  </div>
                  <p className="eyebrow text-fg-subtle mt-5">
                    {article.topicName ?? 'Journal'}
                  </p>
                  <h2 className="font-display text-fg mt-2 text-xl">
                    <span className="link-retract">{article.title}</span>
                  </h2>
                  {article.excerpt ? (
                    <p className="text-fg-muted mt-2 text-sm">
                      {article.excerpt}
                    </p>
                  ) : null}
                  <p className="text-fg-subtle mt-4 text-xs">
                    {article.publishedAt
                      ? dateFormat.format(article.publishedAt)
                      : null}
                    {article.readingMinutes
                      ? ` · ${article.readingMinutes} min read`
                      : null}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </>
  );
}
