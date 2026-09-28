'use client';

import { useEffect } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { StatusMessage } from '@/components/layout/status-message';

/** Admin error boundary. The digest matches the server log entry. */
export default function AdminError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusMessage
      eyebrow="Error"
      title="This admin page failed to load"
      actions={
        <>
          <Button onClick={() => retry()}>Try again</Button>
          <ButtonLink href="/admin" variant="secondary">
            Dashboard
          </ButtonLink>
        </>
      }
    >
      Nothing was saved by the failed request. Error reference:{' '}
      <span className="text-fg">{error.digest ?? 'unavailable'}</span>
    </StatusMessage>
  );
}
