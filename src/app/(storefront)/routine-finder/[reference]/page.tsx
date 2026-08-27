import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { RoutineStep } from '@/lib/db/schema';
import { getRoutineResult } from '@/lib/routine';
import { getProductsByIds } from '@/lib/catalogue/products';
import { currentUser } from '@/lib/auth';
import { getWishlistProductIds } from '@/lib/wishlist';
import { PageHeader } from '@/components/layout/page-header';
import { RoutineResult } from '@/components/routine/result';

export const metadata: Metadata = {
  title: 'A saved routine — Nordic Lux',
  // A saved routine is personal; it should not accumulate in search results.
  robots: { index: false, follow: false },
};

/**
 * A saved routine, by short code.
 *
 * The stored `recommendations` snapshot is replayed rather than recomputed:
 * rules get retuned, and somebody returning to their routine should see what
 * they were actually shown. Only the product data is refreshed, so prices and
 * stock are current.
 *
 * The code is not a credential — it identifies a routine, which contains no
 * personal information beyond the answers themselves. It is `noindex` all the
 * same, and short codes are random rather than sequential.
 */
export default async function SavedRoutinePage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;

  const result = await getRoutineResult(reference.toUpperCase());
  if (!result) notFound();

  const ids = result.recommendations.map((r) => r.productId);
  const [products, user] = await Promise.all([
    ids.length > 0 ? getProductsByIds(ids) : Promise.resolve([]),
    currentUser(),
  ]);
  const byId = new Map(products.map((p) => [p.id, p]));

  // A product unpublished since the routine was saved is dropped rather than
  // rendered as a gap.
  const steps = result.recommendations.flatMap((rec) => {
    const product = byId.get(rec.productId);
    return product
      ? [
          {
            step: rec.step as RoutineStep,
            product,
            rationale: rec.rationale ?? null,
          },
        ]
      : [];
  });

  const total = steps.reduce((sum, s) => sum + s.product.effectivePrice, 0);

  const wishlisted = user
    ? await getWishlistProductIds(user.id)
    : new Set<string>();

  const saved = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(result.createdAt);

  return (
    <>
      <PageHeader
        eyebrow={`Saved ${saved}`}
        title="Your routine"
        description="Prices and availability are current; the steps are the ones you were originally shown."
        trail={[
          { label: 'Routine finder', href: '/routine-finder' },
          {
            label: result.reference,
            href: `/routine-finder/${result.reference}`,
          },
        ]}
        aside={
          <Link
            href="/routine-finder"
            className="eyebrow text-fg-subtle hover:text-fg link-underline"
          >
            Answer again
          </Link>
        }
      />

      <div className="page-x mx-auto max-w-(--container-page) pb-28">
        <RoutineResult steps={steps} total={total} wishlisted={wishlisted} />
      </div>
    </>
  );
}
