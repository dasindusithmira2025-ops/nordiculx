import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getConcerns } from '@/lib/catalogue/taxonomy';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/display';
import { ButtonLink } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Shop by concern — Nordic Lux',
  description:
    'Start from what you actually want to change: dryness, dehydration, sensitivity, barrier support, blemishes.',
  alternates: { canonical: '/concern' },
};

/**
 * Concern index.
 *
 * The entry point for customers who know the problem but not the product
 * category — which is most of them. Ordered by the editorial `sortOrder` from
 * the CMS rather than by product count, so merchandising decides what leads.
 */
export default async function ConcernsPage() {
  const concerns = await getConcerns();

  return (
    <>
      <PageHeader
        eyebrow="Where to start"
        title="Shop by concern"
        description="Most people arrive knowing what they want to change rather than which shelf it lives on. Start here instead."
        trail={[{ label: 'Concerns', href: '/concern' }]}
      />

      <div className="page-x mx-auto max-w-(--container-page) pb-28">
        {concerns.length === 0 ? (
          <EmptyState
            title="No concerns published yet"
            description="Browse the full range instead — every product lists what it is for."
            action={<ButtonLink href="/shop">Shop all</ButtonLink>}
          />
        ) : (
          <ul className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {concerns.map((concern) => (
              <li key={concern.id}>
                <Link href={`/concern/${concern.slug}`} className="group block">
                  {concern.imageUrl ? (
                    <div className="bg-surface-sunken relative aspect-[4/3] overflow-hidden">
                      <Image
                        src={concern.imageUrl}
                        alt=""
                        fill
                        sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
                        className="duration-editorial ease-standard object-cover transition-transform group-hover:scale-[1.02]"
                      />
                    </div>
                  ) : null}
                  <h2 className="font-display text-fg mt-5 text-2xl">
                    <span className="link-retract">{concern.name}</span>
                  </h2>
                  {concern.description ? (
                    <p className="text-fg-muted mt-2 max-w-prose text-sm">
                      {concern.description}
                    </p>
                  ) : null}
                  <p className="text-fg-subtle mt-3 text-xs tabular-nums">
                    {concern.productCount}{' '}
                    {concern.productCount === 1 ? 'product' : 'products'}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="border-line section-y border-t text-center">
          <h2 className="font-display text-display-sm text-fg">
            Not sure which applies?
          </h2>
          <p className="text-fg-muted mx-auto mt-4 max-w-md text-sm">
            Four questions, and we will suggest a routine you can actually keep
            to.
          </p>
          <div className="mt-8">
            <ButtonLink href="/routine-finder">Find your routine</ButtonLink>
          </div>
        </div>
      </div>
    </>
  );
}
