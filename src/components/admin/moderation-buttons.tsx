'use client';

import { useTransition, useState } from 'react';
import { moderateReview, setTicketStatus } from '@/app/actions/admin';
import { Button } from '@/components/ui/button';

/** Approve / reject controls for one review. */
export function ReviewModeration({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // 'approved', not 'published': that is the enum value the schema defines and
  // the one `getProductReviews` filters on. The mismatch meant Publish failed.
  const submit = (status: 'approved' | 'rejected') =>
    startTransition(async () => {
      const data = new FormData();
      data.set('id', id);
      data.set('status', status);
      const result = await moderateReview(data);
      setError(result.ok ? null : result.error);
    });

  return (
    <div>
      <div className="flex gap-3">
        <Button size="sm" disabled={pending} onClick={() => submit('approved')}>
          Publish
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => submit('rejected')}
        >
          Reject
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-signal-danger mt-2 text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Open / close control for one support ticket. */
export function TicketStatusButton({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  const next = status === 'open' ? 'closed' : 'open';

  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const data = new FormData();
          data.set('id', id);
          data.set('status', next);
          await setTicketStatus(data);
        })
      }
    >
      {status === 'open' ? 'Close' : 'Reopen'}
    </Button>
  );
}
