'use client';

import { useEffect } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { StatusMessage } from '@/components/layout/status-message';

/**
 * Storefront error boundary. The header and footer stay, so a failure in one
 * page never strands a customer with a blank screen and no way onward.
 */
export default function StorefrontError({
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
      eyebrow="Something went wrong"
      title="This page did not load"
      actions={
        <>
          <Button onClick={() => retry()}>Try again</Button>
          <ButtonLink href="/" variant="secondary">
            Back to home
          </ButtonLink>
        </>
      }
    >
      It is on our side, not yours. Your bag is safe. If it keeps happening,
      contact us and quote{' '}
      <span className="text-fg">{error.digest ?? 'this page address'}</span>.
    </StatusMessage>
  );
}
