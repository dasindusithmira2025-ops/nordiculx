import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getProductBySlug,
  getProductReviews,
  getRelatedProducts,
} from '@/lib/catalogue/products';
import type { ProductDetailView } from '@/lib/catalogue/types';
import { currentUser } from '@/lib/auth';
import { isWishlisted, getWishlistProductIds } from '@/lib/wishlist';
import { publicConfig } from '@/lib/public-config';
import { Breadcrumbs } from '@/components/layout/page-header';
import { ProductDetail } from '@/components/commerce/product-detail';
import { ProductGrid } from '@/components/catalogue/listing';
import { Prose, Rating, SectionHeading } from '@/components/ui/display';
import { ReviewForm } from '@/components/commerce/review-form';
import { reviewEligibility } from '@/lib/reviews';
import { trackEvent } from '@/lib/analytics';
import { CheckIcon } from '@/components/ui/icons';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: 'Not found — Nordic Lux' };

  const description =
    product.seoDescription ?? product.excerpt ?? product.subtitle ?? undefined;

  return {
    title: product.seoTitle ?? `${product.name} — ${product.brandName}`,
    description,
    alternates: { canonical: `/product/${product.slug}` },
    openGraph: {
      type: 'website',
      title: product.name,
      description,
      images: product.image ? [{ url: product.image.url }] : undefined,
    },
  };
}

/**
 * Product JSON-LD.
 *
 * Only facts already visible on the page are emitted. Marking up a rating that
 * is not shown, or an availability the page contradicts, is what gets rich
 * results revoked.
 */
function productJsonLd(product: ProductDetailView) {
  const inStock = product.variants.some((v) => v.inStock);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.excerpt ?? product.subtitle ?? undefined,
    sku: product.variants[0]?.sku,
    brand: { '@type': 'Brand', name: product.brandName },
    image: product.media.map((m) => `${publicConfig.appUrl}${m.url}`),
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      lowPrice: (product.effectivePrice / 100).toFixed(2),
      highPrice: (
        Math.max(...product.variants.map((v) => v.effectivePrice), 0) / 100
      ).toFixed(2),
      offerCount: product.variants.length,
      availability: inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url: `${publicConfig.appUrl}/product/${product.slug}`,
    },
    ...(product.ratingCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.ratingAverage.toFixed(1),
            reviewCount: product.ratingCount,
          },
        }
      : {}),
  };
}

/** A titled disclosure. Native <details>, so it works before hydration. */
function DetailSection({
  title,
  children,
  open = false,
}: {
  title: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details open={open} className="group border-line border-b">
      <summary className="text-fg flex cursor-pointer list-none items-center justify-between py-6 text-sm">
        {title}
        <span
          aria-hidden
          className="text-fg-subtle duration-micro text-lg leading-none transition-transform group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <div className="pb-8">{children}</div>
    </details>
  );
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const [{ reviews, breakdown }, related, user] = await Promise.all([
    getProductReviews(product.id),
    getRelatedProducts(product.id, 'routine', 4),
    currentUser(),
  ]);

  const eligibility = await reviewEligibility(user?.id ?? null, product.id);

  // Ids and taxonomy only — no name, no price history, nothing that identifies
  // the visitor beyond the daily-rotating key `trackEvent` derives itself.
  await trackEvent(
    'product_view',
    { productId: product.id, brandSlug: product.brandSlug },
    { path: `/product/${product.slug}` },
  );

  const [wishlisted, relatedWishlisted] = await Promise.all([
    user ? isWishlisted(user.id, product.id) : Promise.resolve(false),
    user ? getWishlistProductIds(user.id) : Promise.resolve(new Set<string>()),
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        // Serialised server-side from our own query result, never from input.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(productJsonLd(product)),
        }}
      />

      <div className="page-x mx-auto max-w-(--container-page) pt-8 pb-20">
        <Breadcrumbs
          className="mb-10"
          trail={[
            { label: 'Shop', href: '/shop' },
            ...(product.categoryName && product.categorySlug
              ? [
                  {
                    label: product.categoryName,
                    href: `/category/${product.categorySlug}`,
                  },
                ]
              : []),
            { label: product.name, href: `/product/${product.slug}` },
          ]}
        />

        <ProductDetail
          product={product}
          wishlisted={wishlisted}
          customerEmail={user?.email}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Detail, ingredients, use                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="page-x mx-auto max-w-(--container-page) pb-24">
        <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <div>
            {product.description ? (
              <>
                <h2 className="eyebrow text-fg-subtle mb-6">The detail</h2>
                <Prose className="mb-12">
                  {product.description.split('\n\n').map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
                </Prose>
              </>
            ) : null}

            <div className="border-line border-t">
              {product.benefits.length > 0 ? (
                <DetailSection title="What it does" open>
                  <ul className="space-y-3">
                    {product.benefits.map((benefit) => (
                      <li
                        key={benefit}
                        className="text-fg-muted flex items-start gap-3 text-sm"
                      >
                        <CheckIcon
                          width={15}
                          height={15}
                          className="text-fg-subtle mt-0.5 shrink-0"
                        />
                        {benefit}
                      </li>
                    ))}
                  </ul>
                </DetailSection>
              ) : null}

              {product.howToUse ? (
                <DetailSection title="How to use">
                  <p className="text-fg-muted max-w-prose text-sm whitespace-pre-line">
                    {product.howToUse}
                  </p>
                </DetailSection>
              ) : null}

              {product.keyIngredients.length > 0 ? (
                <DetailSection title="Key ingredients">
                  <ul className="space-y-5">
                    {product.keyIngredients.map((ingredient) => (
                      <li key={ingredient.slug}>
                        <p className="text-fg text-sm">{ingredient.name}</p>
                        {ingredient.benefitSummary ? (
                          <p className="text-fg-muted mt-1 max-w-prose text-sm">
                            {ingredient.benefitSummary}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </DetailSection>
              ) : null}

              {product.ingredientsList ? (
                <DetailSection title="Full ingredients (INCI)">
                  <p className="text-fg-subtle max-w-prose text-xs leading-relaxed">
                    {product.ingredientsList}
                  </p>
                </DetailSection>
              ) : null}
            </div>
          </div>

          {/* Spec rail */}
          <aside className="text-sm">
            <h2 className="eyebrow text-fg-subtle mb-6">At a glance</h2>
            <dl className="border-line divide-line divide-y border-t border-b">
              <div className="flex justify-between gap-6 py-4">
                <dt className="text-fg-subtle">Brand</dt>
                <dd className="text-fg text-right">
                  <Link
                    href={`/brands/${product.brandSlug}`}
                    className="link-underline"
                  >
                    {product.brandName}
                  </Link>
                </dd>
              </div>
              {product.categoryName ? (
                <div className="flex justify-between gap-6 py-4">
                  <dt className="text-fg-subtle">Category</dt>
                  <dd className="text-fg text-right">{product.categoryName}</dd>
                </div>
              ) : null}
              {product.routineStep ? (
                <div className="flex justify-between gap-6 py-4">
                  <dt className="text-fg-subtle">Routine step</dt>
                  <dd className="text-fg text-right capitalize">
                    {product.routineStep}
                  </dd>
                </div>
              ) : null}
              {product.suitableSkinTypes.length > 0 ? (
                <div className="flex justify-between gap-6 py-4">
                  <dt className="text-fg-subtle">Suits</dt>
                  <dd className="text-fg text-right capitalize">
                    {product.suitableSkinTypes.join(', ')}
                  </dd>
                </div>
              ) : null}
              {product.variants[0]?.sku ? (
                <div className="flex justify-between gap-6 py-4">
                  <dt className="text-fg-subtle">SKU</dt>
                  <dd className="text-fg-muted text-right text-xs">
                    {product.variants[0].sku}
                  </dd>
                </div>
              ) : null}
            </dl>
          </aside>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Reviews                                                            */}
      {/* ------------------------------------------------------------------ */}
      <section
        id="reviews"
        className="border-line bg-surface-raised scroll-mt-28 border-t"
      >
        <div className="page-x section-y mx-auto max-w-(--container-page)">
          <SectionHeading
            eyebrow="Reviews"
            title={
              product.ratingCount > 0
                ? `${product.ratingCount} ${product.ratingCount === 1 ? 'review' : 'reviews'}`
                : 'No reviews yet'
            }
          />

          {reviews.length > 0 ? (
            <div className="mt-14 grid gap-12 lg:grid-cols-[18rem_1fr] lg:gap-20">
              <div>
                <div className="flex items-baseline gap-3">
                  <span className="font-display text-display-md text-fg">
                    {product.ratingAverage.toFixed(1)}
                  </span>
                  <Rating value={product.ratingAverage} />
                </div>

                <ul className="mt-8 space-y-2">
                  {breakdown.map((row) => {
                    const percent =
                      product.ratingCount > 0
                        ? (row.count / product.ratingCount) * 100
                        : 0;
                    return (
                      <li
                        key={row.rating}
                        className="flex items-center gap-3 text-xs"
                      >
                        <span className="text-fg-subtle w-8 tabular-nums">
                          {row.rating}★
                        </span>
                        <span className="bg-surface-sunken h-1 flex-1">
                          <span
                            className="bg-fg block h-full"
                            style={{ width: `${percent}%` }}
                          />
                        </span>
                        <span className="text-fg-subtle w-6 text-right tabular-nums">
                          {row.count}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <ul className="divide-line divide-y">
                {reviews.map((review) => (
                  <li key={review.id} className="py-8 first:pt-0">
                    <div className="flex flex-wrap items-center gap-4">
                      <Rating value={review.rating} size={13} />
                      {review.verifiedPurchase ? (
                        <span className="text-signal-success text-2xs tracking-eyebrow inline-flex items-center gap-1.5 uppercase">
                          <CheckIcon width={12} height={12} />
                          Verified purchase
                        </span>
                      ) : null}
                    </div>
                    {review.title ? (
                      <h3 className="text-fg mt-4 text-sm">{review.title}</h3>
                    ) : null}
                    <p className="text-fg-muted mt-2 max-w-prose text-sm">
                      {review.body}
                    </p>
                    <p className="text-fg-subtle mt-4 text-xs">
                      {review.authorName} ·{' '}
                      <time dateTime={review.createdAt.toISOString()}>
                        {review.createdAt.toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </time>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-fg-muted mt-8 max-w-prose text-sm">
              This product has not been reviewed yet. Reviews are only accepted
              from customers who have received the product.
            </p>
          )}

          <ReviewForm productId={product.id} eligibility={eligibility} />
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Related                                                            */}
      {/* ------------------------------------------------------------------ */}
      {related.length > 0 ? (
        <section className="page-x section-y mx-auto max-w-(--container-page)">
          <SectionHeading eyebrow="Also consider" title="Pairs well with" />
          <div className="mt-14">
            <ProductGrid products={related} wishlisted={relatedWishlisted} />
          </div>
        </section>
      ) : null}
    </>
  );
}
