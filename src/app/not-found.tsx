import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui/button';
import { StatusMessage } from '@/components/layout/status-message';

export const metadata: Metadata = {
  title: 'Page not found — Nordic Lux',
  robots: { index: false, follow: true },
};

/**
 * Unmatched URLs outside any route group land here, beneath the root layout
 * only — there is no storefront header to fall back on, so it links home.
 */
export default function NotFound() {
  return (
    <main id="main">
      <StatusMessage
        eyebrow="404"
        title="We could not find that page"
        actions={
          <>
            <ButtonLink href="/shop">Browse the shop</ButtonLink>
            <ButtonLink href="/" variant="secondary">
              Back to home
            </ButtonLink>
          </>
        }
      >
        The page may have moved, or the link may be mistyped.
      </StatusMessage>
    </main>
  );
}
