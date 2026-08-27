import Link from 'next/link';
import type { RoutineStep } from '@/lib/db/schema';
import type { ProductCardView } from '@/lib/catalogue/types';
import { ROUTINE_STEP_LABELS } from '@/lib/routine/engine';
import { formatMoney } from '@/lib/money';
import { ProductCard } from '@/components/commerce/product-card';
import { Badge } from '@/components/ui/display';
import { ButtonLink } from '@/components/ui/button';

/**
 * The recommended routine.
 *
 * Ordered by the step a product is actually used at, and numbered, because the
 * order is the advice — a routine presented as an unordered grid of five
 * products is just a listing. Each step carries the rationale from the rule that
 * chose it, so the recommendation explains itself rather than asking for trust.
 */
export function RoutineResult({
  steps,
  total,
  wishlisted,
}: {
  steps: {
    step: RoutineStep;
    product: ProductCardView;
    rationale: string | null;
  }[];
  /** Combined price of the routine, in cents. */
  total: number;
  wishlisted?: Set<string>;
}) {
  if (steps.length === 0) {
    return (
      <div className="border-line border px-6 py-20 text-center">
        <h2 className="font-display text-display-sm text-fg">
          No routine to suggest yet
        </h2>
        <p className="text-fg-muted mx-auto mt-3 max-w-md text-sm">
          Nothing in the range matched that combination. Browsing by concern is
          the next best route.
        </p>
        <div className="mt-8">
          <ButtonLink href="/concern" variant="secondary">
            Shop by concern
          </ButtonLink>
        </div>
      </div>
    );
  }

  const anyOutOfStock = steps.some(({ product }) => !product.inStock);

  return (
    <div>
      {/* Named, because "a list of 5 items" tells a screen-reader user nothing
          about what they have landed on. */}
      <ol aria-label="Your routine, in order" className="border-line border-t">
        {steps.map(({ step, product, rationale }, i) => (
          <li
            key={`${step}-${product.id}`}
            className="border-line grid gap-6 border-b py-10 sm:grid-cols-[3rem_14rem_1fr] sm:items-start sm:gap-8"
          >
            <p
              aria-hidden
              className="font-display text-fg-subtle text-2xl tabular-nums"
            >
              {String(i + 1).padStart(2, '0')}
            </p>

            <div>
              <ProductCard
                product={product}
                wishlisted={wishlisted?.has(product.id)}
                sizes="14rem"
              />
            </div>

            <div className="sm:pt-1">
              <p className="eyebrow text-fg-subtle">
                {/* The step is the heading, since it is the reason this row
                    exists at all. */}
                {ROUTINE_STEP_LABELS[step]}
              </p>
              {rationale ? (
                <p className="text-fg-muted text-read mt-3 max-w-prose">
                  {rationale}
                </p>
              ) : null}
              {!product.inStock ? (
                <p className="mt-4">
                  <Badge tone="out">Out of stock</Badge>
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-10 flex flex-wrap items-baseline justify-between gap-6">
        <p className="text-fg-muted text-sm">
          {steps.length} {steps.length === 1 ? 'step' : 'steps'} ·{' '}
          <span className="text-fg tabular-nums">{formatMoney(total)}</span>{' '}
          <span className="text-fg-subtle">for the full routine</span>
        </p>
        <Link href="/shop" className="eyebrow text-fg link-underline">
          Browse everything instead
        </Link>
      </div>

      {anyOutOfStock ? (
        <p className="text-fg-subtle mt-6 text-xs">
          One or more steps are currently out of stock. They are still shown so
          the routine reads as intended — you can be notified when they return.
        </p>
      ) : null}
    </div>
  );
}
