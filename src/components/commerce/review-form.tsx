'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { deleteOwnReview, submitReview } from '@/app/actions/reviews';
import { Button } from '@/components/ui/button';
import { StarFilledIcon, StarIcon } from '@/components/ui/icons';
import type { ActionResult } from '@/lib/validation';
import type { ReviewEligibility } from '@/lib/reviews';
import { cn } from '@/lib/cn';

/**
 * Writing a review.
 *
 * Only rendered for a customer with a delivered order containing this product
 * — the server decides that and re-checks it on submit, so this component is
 * the convenience and never the gate.
 *
 * The rating is a real radio group rather than clickable stars, so it is
 * reachable by keyboard and announced correctly; the stars are the label.
 */
export function ReviewForm({
  productId,
  eligibility,
}: {
  productId: string;
  eligibility: ReviewEligibility;
}) {
  const existing = eligibility.canReview ? eligibility.existing : null;
  const [rating, setRating] = useState(existing?.rating ?? 0);

  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(async (previous, formData) => {
    if (formData.get('intent') === 'delete') {
      return deleteOwnReview(previous, formData);
    }
    return submitReview(previous, formData);
  }, null);

  if (!eligibility.canReview) {
    return eligibility.reason === 'signed_out' ? (
      <p className="text-fg-muted mt-8 text-sm">
        <Link href="/account/login" className="link-underline">
          Sign in
        </Link>{' '}
        to review a product you have received.
      </p>
    ) : null;
  }

  const fieldError = (name: string) =>
    state && !state.ok ? (state.fieldErrors?.[name] ?? null) : null;

  return (
    <div className="border-line mt-12 border-t pt-10">
      <h3 className="font-display text-fg text-xl">
        {existing ? 'Your review' : 'Write a review'}
      </h3>

      {existing ? (
        <p className="text-fg-subtle mt-2 text-xs">
          {existing.status === 'approved'
            ? 'Published. Editing sends it back for moderation.'
            : existing.status === 'pending'
              ? 'Waiting for moderation.'
              : 'Not published. You can rewrite it.'}
        </p>
      ) : (
        <p className="text-fg-subtle mt-2 text-xs">
          Reviews are read by a person before they appear.
        </p>
      )}

      {state?.ok ? (
        <p role="status" className="text-signal-success mt-4 text-sm">
          Thank you — your review has been sent for moderation.
        </p>
      ) : null}

      <form action={formAction} className="mt-6 max-w-prose space-y-6">
        <input type="hidden" name="productId" value={productId} />

        <fieldset>
          <legend className="eyebrow text-fg-subtle">Rating</legend>
          <div className="mt-3 flex gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <label
                key={value}
                // The star is decoration over an sr-only radio; without this it
                // swallows the click meant for the input underneath it.
                className="cursor-pointer p-1 [&_svg]:pointer-events-none"
                title={`${value} out of 5`}
              >
                <input
                  type="radio"
                  name="rating"
                  value={value}
                  checked={rating === value}
                  onChange={() => setRating(value)}
                  className="sr-only"
                />
                <span className="sr-only">{value} out of 5</span>
                {value <= rating ? (
                  <StarFilledIcon width={20} height={20} className="text-fg" />
                ) : (
                  <StarIcon width={20} height={20} className="text-fg-subtle" />
                )}
              </label>
            ))}
          </div>
          {fieldError('rating') ? (
            <p role="alert" className="text-signal-danger mt-2 text-xs">
              {fieldError('rating')}
            </p>
          ) : null}
        </fieldset>

        <label className="block">
          <span className="eyebrow text-fg-subtle">Headline (optional)</span>
          <input
            name="title"
            maxLength={120}
            defaultValue={existing?.title ?? ''}
            className="border-line-strong focus:border-fg text-fg mt-2 w-full border-0 border-b bg-transparent py-2 text-sm outline-none"
          />
        </label>

        <label className="block">
          <span className="eyebrow text-fg-subtle">Your review</span>
          <textarea
            name="body"
            rows={5}
            required
            minLength={20}
            maxLength={4000}
            defaultValue={existing?.body ?? ''}
            className={cn(
              'border-line-strong focus:border-fg text-fg mt-2 w-full border bg-transparent p-3 text-sm outline-none',
              fieldError('body') && 'border-signal-danger',
            )}
          />
          {fieldError('body') ? (
            <span
              role="alert"
              className="text-signal-danger mt-1 block text-xs"
            >
              {fieldError('body')}
            </span>
          ) : null}
        </label>

        <div className="flex flex-wrap items-center gap-6">
          <Button type="submit" disabled={pending}>
            {existing ? 'Update review' : 'Submit review'}
          </Button>
          {existing ? (
            <button
              type="submit"
              name="intent"
              value="delete"
              disabled={pending}
              className="text-fg-subtle hover:text-signal-danger link-underline text-xs"
            >
              Remove my review
            </button>
          ) : null}
        </div>

        {state && !state.ok ? (
          <p role="alert" className="text-signal-danger text-sm">
            {state.error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
