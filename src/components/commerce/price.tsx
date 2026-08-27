import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money';

/**
 * Price display.
 *
 * When something is discounted, the original is struck through and given a
 * `<s>` element so assistive technology announces it as superseded rather than
 * reading two prices with no relationship between them.
 */
export function Price({
  amount,
  compareAt,
  from = false,
  size = 'md',
  className,
}: {
  /** Amount actually charged, in cents. */
  amount: number;
  /** Original price, in cents, when discounted. */
  compareAt?: number | null;
  /** Renders a "From" prefix for a product with a price range. */
  from?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const discounted =
    compareAt !== null && compareAt !== undefined && compareAt > amount;

  const sizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-lg',
  };

  return (
    <span
      className={cn('inline-flex items-baseline gap-2', sizes[size], className)}
    >
      {from ? (
        <span className="text-fg-subtle" aria-hidden>
          From
        </span>
      ) : null}
      <span className={cn('tabular-nums', discounted && 'text-signal-sale')}>
        {from ? <span className="sr-only">From </span> : null}
        {formatMoney(amount)}
      </span>
      {discounted ? (
        <s className="text-fg-subtle tabular-nums">
          <span className="sr-only">Was </span>
          {formatMoney(compareAt)}
        </s>
      ) : null}
    </span>
  );
}

/** Unit price, e.g. "$2.96 / 10ml" — the honest way to compare sizes. */
export function UnitPrice({
  amount,
  volumeMl,
  className,
}: {
  amount: number;
  volumeMl: number | null;
  className?: string;
}) {
  if (!volumeMl || volumeMl <= 0) return null;
  const per10 = Math.round((amount / volumeMl) * 10);
  return (
    <span className={cn('text-2xs text-fg-subtle tabular-nums', className)}>
      {formatMoney(per10)} / 10ml
    </span>
  );
}
