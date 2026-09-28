import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui/button';
import { StatusMessage } from '@/components/layout/status-message';

export const metadata: Metadata = {
  title: 'Page not found — Nordic Lux',
  robots: { index: false, follow: true },
};

/** Rendered inside the storefront chrome whenever a page calls notFound(). */
export default function StorefrontNotFound() {
  return (
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
      The product or page may have moved, sold out for good, or the link may be
      mistyped. Search from the header, or start again below.
    </StatusMessage>
  );
}
