import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { listReviews } from '@/lib/admin/queries';
import { reviewStatusEnum } from '@/lib/db/schema';
import type { ReviewStatus } from '@/lib/db/schema';
import { Badge, Rating } from '@/components/ui/display';
import { ReviewModeration } from '@/components/admin/moderation-buttons';
import { cn } from '@/lib/cn';

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/**
 * Review moderation queue.
 *
 * Pending first, because that is the only tab with work in it. The full body is
 * shown rather than a truncated preview — moderating from an excerpt is how
 * abuse slips through.
 */
export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  await requireStaff('reviews.moderate');

  const params = await searchParams;
  const raw = Array.isArray(params.status) ? params.status[0] : params.status;
  const valid = new Set<string>(reviewStatusEnum.enumValues);
  const status = (raw && valid.has(raw) ? raw : 'pending') as ReviewStatus;

  const reviews = await listReviews(status);

  return (
    <div>
      <header className="border-line border-b pb-6">
        <p className="eyebrow text-fg-subtle">Moderation</p>
        <h1 className="font-display text-display-sm text-fg mt-3">
          {reviews.length} {status}{' '}
          {reviews.length === 1 ? 'review' : 'reviews'}
        </h1>
      </header>

      <nav aria-label="Filter by status" className="mt-6">
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {reviewStatusEnum.enumValues.map((value) => (
            <li key={value}>
              <Link
                href={`/admin/reviews?status=${value}`}
                aria-current={status === value ? 'page' : undefined}
                className={cn(
                  'eyebrow',
                  status === value
                    ? 'text-fg link-underline'
                    : 'text-fg-subtle hover:text-fg',
                )}
              >
                {value}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {reviews.length === 0 ? (
        <p className="text-fg-muted mt-12 text-sm">
          Nothing here — the queue is clear.
        </p>
      ) : (
        <ul className="mt-8 space-y-6">
          {reviews.map((review) => (
            <li key={review.id} className="border-line border p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Rating value={review.rating} showValue />
                  <p className="text-fg mt-3 text-sm">
                    {review.title ? (
                      <strong className="font-medium">{review.title}</strong>
                    ) : null}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {review.verifiedPurchase ? (
                    <Badge tone="success">Verified purchase</Badge>
                  ) : (
                    <Badge tone="neutral">Unverified</Badge>
                  )}
                </div>
              </div>

              {/* Full text, never an excerpt. */}
              <p className="text-fg-muted mt-4 max-w-prose text-sm whitespace-pre-line">
                {review.body}
              </p>

              <p className="text-fg-subtle mt-4 text-xs">
                {review.authorEmail} on{' '}
                <Link
                  href={`/product/${review.productSlug}`}
                  className="link-underline"
                >
                  {review.productName}
                </Link>{' '}
                · {dateFormat.format(review.createdAt)}
              </p>

              {status === 'pending' ? (
                <div className="border-line mt-5 border-t pt-5">
                  <ReviewModeration id={review.id} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
