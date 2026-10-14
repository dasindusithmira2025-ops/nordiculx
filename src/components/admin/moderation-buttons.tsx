'use client';

import { useState, useTransition } from 'react';
import { moderateReview, setTicketStatus } from '@/app/actions/admin';
import { Button } from '@/components/ui/button';
import type { ReviewStatus } from '@/lib/db/schema';

/** Moderation controls that also let a published review be withdrawn. */
export function ReviewModeration({
  id,
  status,
}: {
  id: string;
  status: ReviewStatus;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const actions =
    status === 'pending'
      ? [
          {
            next: 'approved' as const,
            label: 'Publish',
            variant: 'primary' as const,
          },
          {
            next: 'rejected' as const,
            label: 'Reject',
            variant: 'secondary' as const,
          },
        ]
      : status === 'approved'
        ? [
            {
              next: 'rejected' as const,
              label: 'Unpublish',
              variant: 'secondary' as const,
            },
          ]
        : [
            {
              next: 'approved' as const,
              label: 'Publish',
              variant: 'primary' as const,
            },
          ];

  const submit = (next: 'approved' | 'rejected') =>
    startTransition(async () => {
      const data = new FormData();
      data.set('id', id);
      data.set('status', next);
      const result = await moderateReview(data);
      setError(result.ok ? null : result.error);
    });

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {actions.map((action) => (
          <Button
            key={action.next}
            size="sm"
            variant={action.variant}
            disabled={pending}
            onClick={() => submit(action.next)}
          >
            {action.label}
          </Button>
        ))}
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
  const [message, setMessage] = useState<string | null>(null);
  const next = status === 'open' ? 'closed' : 'open';

  return (
    <div className="text-right">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const data = new FormData();
            data.set('id', id);
            data.set('status', next);
            const result = await setTicketStatus(data);
            setMessage(result.ok ? 'Updated.' : result.error);
          })
        }
      >
        {status === 'open' ? 'Close' : 'Reopen'}
      </Button>
      {message ? (
        <p
          role={message === 'Updated.' ? 'status' : 'alert'}
          className={
            message === 'Updated.'
              ? 'text-signal-success mt-2 text-xs'
              : 'text-signal-danger mt-2 text-xs'
          }
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
