import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getCollections } from '@/lib/catalogue/taxonomy';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/display';
import { ButtonLink } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Collections — Nordic Lux',
  description:
    'Edits built around a moment rather than a category: the winter edit, quiet essentials, gifting.',
  alternates: { canonical: '/collection' },
};

/**
 * Collection index.
 *
 * Exists so the breadcrumb on a collection page has somewhere to go — a trail
 * whose parent 404s is worse than no trail. Collections are merchandising
 * groupings, so they are ordered by the CMS `sortOrder`, never alphabetically.
 */
export default async function CollectionsPage() {
  const collections = await getCollections();

  return (
    <>
      <PageHeader
        eyebrow="Edits"
        title="Collections"
        description="Groupings built around a moment rather than a shelf — what to use in the dry season, what to give, what to keep."
        trail={[{ label: 'Collections', href: '/collection' }]}
      />

      <div className="page-x mx-auto max-w-(--container-page) pb-28">
        {collections.length === 0 ? (
          <EmptyState
            title="No collections published yet"
            description="The full range is always available in the shop."
            action={<ButtonLink href="/shop">Shop all</ButtonLink>}
          />
        ) : (
          <ul className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {collections.map((collection) => (
              <li key={collection.id}>
                <Link
                  href={`/collection/${collection.slug}`}
                  className="group block"
                >
                  <div className="bg-surface-sunken relative aspect-[4/5] overflow-hidden">
                    {(collection.imageUrl ?? collection.heroImageUrl) ? (
                      <Image
                        src={(collection.imageUrl ?? collection.heroImageUrl)!}
                        alt=""
                        fill
                        sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
                        className="duration-editorial ease-standard object-cover transition-transform group-hover:scale-[1.02]"
                      />
                    ) : null}
                  </div>
                  <h2 className="font-display text-fg mt-5 text-2xl">
                    <span className="link-retract">{collection.name}</span>
                  </h2>
                  {collection.description ? (
                    <p className="text-fg-muted mt-2 max-w-prose text-sm">
                      {collection.description}
                    </p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
