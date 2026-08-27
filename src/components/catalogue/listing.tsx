import Link from 'next/link';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money';
import {
  SORT_LABELS,
  hasActiveFilters,
  listingHref,
  toggleFacetHref,
  type ListingSearchParams,
} from '@/lib/catalogue/query';
import {
  PRODUCT_SORTS,
  type FacetOption,
  type ProductCardView,
  type ProductFacets,
  type ProductFilters,
  type ProductSort,
} from '@/lib/catalogue/types';
import {
  ProductCard,
  ProductCardSkeleton,
} from '@/components/commerce/product-card';
import { EmptyState } from '@/components/ui/display';
import { ButtonLink } from '@/components/ui/button';
import {
  CheckIcon,
  CloseIcon,
  PlusIcon,
  SearchIcon,
} from '@/components/ui/icons';

/**
 * Product listing furniture, shared by every route that shows a product grid.
 *
 * All of it is server-rendered and navigates by <Link>. Facets are links, not
 * checkboxes in a JS-controlled form, which means filtering works before
 * hydration, each refinement is a real URL, and the back button undoes exactly
 * one refinement. The only stateful widget is a <details> disclosure, which the
 * platform already implements.
 */

/* -------------------------------------------------------------------------- */
/* Grid                                                                        */
/* -------------------------------------------------------------------------- */

export function ProductGrid({
  products,
  wishlisted,
  className,
}: {
  products: ProductCardView[];
  wishlisted?: Set<string>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-3 md:gap-x-6 xl:grid-cols-4',
        className,
      )}
    >
      {products.map((product, i) => (
        <ProductCard
          key={product.id}
          product={product}
          wishlisted={wishlisted?.has(product.id)}
          // Only the first row is above the fold at any breakpoint.
          priority={i < 4}
        />
      ))}
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-3 md:gap-x-6 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Facets                                                                      */
/* -------------------------------------------------------------------------- */

export type FacetKey = 'brand' | 'category' | 'concern' | 'skin';

const SKIN_LABELS: Record<string, string> = {
  normal: 'Normal',
  dry: 'Dry',
  oily: 'Oily',
  combination: 'Combination',
  sensitive: 'Sensitive',
  all: 'All skin types',
};

function FacetLink({
  href,
  checked,
  label,
  count,
}: {
  href: string;
  checked: boolean;
  label: string;
  count: number;
}) {
  const exhausted = count === 0 && !checked;
  return (
    <li>
      <Link
        href={href}
        // A facet that would empty the grid stays visible but is not offered —
        // hiding it makes the list jump around as refinements are applied.
        aria-disabled={exhausted || undefined}
        tabIndex={exhausted ? -1 : undefined}
        className={cn(
          'group flex items-start gap-3 py-1.5 text-sm',
          exhausted && 'pointer-events-none opacity-35',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'relative mt-0.5 flex size-4 shrink-0 items-center justify-center border transition-colors',
            checked
              ? 'border-fg bg-fg'
              : 'border-line-strong group-hover:border-fg',
          )}
        >
          {checked ? (
            <CheckIcon width={11} height={11} className="text-accent-fg" />
          ) : null}
        </span>
        <span className="text-fg flex-1 leading-snug">{label}</span>
        <span className="text-fg-subtle mt-px text-xs tabular-nums">
          {count}
        </span>
      </Link>
    </li>
  );
}

function FacetGroup({
  title,
  options,
  facetKey,
  pathname,
  searchParams,
  selected,
  labels,
  defaultOpen = true,
}: {
  title: string;
  options: FacetOption[];
  facetKey: FacetKey;
  pathname: string;
  searchParams: ListingSearchParams;
  selected: string[];
  labels?: Record<string, string>;
  defaultOpen?: boolean;
}) {
  if (options.length === 0) return null;

  return (
    <details open={defaultOpen} className="group border-line border-t py-5">
      <summary className="eyebrow text-fg flex cursor-pointer list-none items-center justify-between">
        {title}
        {/* Plus rotates into a minus when the group opens. */}
        <PlusIcon
          width={12}
          height={12}
          className="text-fg-subtle duration-micro ease-standard transition-transform group-open:rotate-45"
        />
      </summary>
      <ul className="mt-4 max-h-72 space-y-0.5 overflow-y-auto pr-1">
        {options.map((option) => (
          <FacetLink
            key={option.slug}
            href={toggleFacetHref(
              pathname,
              searchParams,
              facetKey,
              option.slug,
            )}
            checked={selected.includes(option.slug)}
            label={labels?.[option.slug] ?? option.name}
            count={option.count}
          />
        ))}
      </ul>
    </details>
  );
}

/**
 * Price is the one filter that cannot be a link — it is a continuous range, so
 * it gets a real GET form. Hidden inputs carry the other active params so
 * submitting narrows the price without dropping every other refinement.
 */
function PriceFilter({
  pathname,
  searchParams,
  filters,
  range,
}: {
  pathname: string;
  searchParams: ListingSearchParams;
  filters: ProductFilters;
  range: { min: number; max: number };
}) {
  const carry: [string, string][] = [];
  for (const key of ['brand', 'category', 'concern', 'skin', 'q'] as const) {
    const value = searchParams[key];
    for (const v of Array.isArray(value) ? value : value ? [value] : []) {
      carry.push([key, v]);
    }
  }
  if (filters.inStockOnly) carry.push(['stock', '1']);
  if (filters.onSaleOnly) carry.push(['sale', '1']);

  return (
    <details open className="group border-line border-t py-5">
      <summary className="eyebrow text-fg flex cursor-pointer list-none items-center justify-between">
        Price
        <PlusIcon
          width={12}
          height={12}
          className="text-fg-subtle duration-micro ease-standard transition-transform group-open:rotate-45"
        />
      </summary>
      <form action={pathname} method="get" className="mt-4">
        {carry.map(([key, value], i) => (
          <input key={`${key}-${i}`} type="hidden" name={key} value={value} />
        ))}
        <div className="flex items-center gap-3">
          <label className="flex-1">
            <span className="sr-only">Minimum price in US dollars</span>
            <input
              type="number"
              name="min"
              inputMode="numeric"
              min={0}
              placeholder={String(Math.floor(range.min / 100))}
              defaultValue={
                filters.minPrice !== undefined
                  ? Math.floor(filters.minPrice / 100)
                  : ''
              }
              className="border-line-strong hover:border-fg-muted focus:border-fg text-fg w-full rounded-none border-0 border-b bg-transparent px-0 py-2 text-sm focus:outline-none"
            />
          </label>
          <span aria-hidden className="text-fg-subtle text-xs">
            to
          </span>
          <label className="flex-1">
            <span className="sr-only">Maximum price in US dollars</span>
            <input
              type="number"
              name="max"
              inputMode="numeric"
              min={0}
              placeholder={String(Math.ceil(range.max / 100))}
              defaultValue={
                filters.maxPrice !== undefined
                  ? Math.ceil(filters.maxPrice / 100)
                  : ''
              }
              className="border-line-strong hover:border-fg-muted focus:border-fg text-fg w-full rounded-none border-0 border-b bg-transparent px-0 py-2 text-sm focus:outline-none"
            />
          </label>
        </div>
        <p className="text-fg-subtle mt-2 text-xs">
          {formatMoney(range.min)} – {formatMoney(range.max)}
        </p>
        <button
          type="submit"
          className="eyebrow text-fg link-underline mt-3 inline-block"
        >
          Apply
        </button>
      </form>
    </details>
  );
}

function ToggleFilter({
  href,
  checked,
  label,
}: {
  href: string;
  checked: boolean;
  label: string;
}) {
  return (
    <Link href={href} className="group flex items-start gap-3 py-1.5 text-sm">
      <span
        aria-hidden
        className={cn(
          'relative mt-0.5 flex size-4 shrink-0 items-center justify-center border transition-colors',
          checked
            ? 'border-fg bg-fg'
            : 'border-line-strong group-hover:border-fg',
        )}
      >
        {checked ? (
          <CheckIcon width={11} height={11} className="text-accent-fg" />
        ) : null}
      </span>
      <span className="text-fg leading-snug">{label}</span>
    </Link>
  );
}

/**
 * `hide` omits the facet a route has already fixed — the brand list is noise on
 * /brands/kvist, where every result is that brand by definition.
 */
export function FilterSidebar({
  pathname,
  searchParams,
  facets,
  filters,
  hide = [],
  className,
}: {
  pathname: string;
  searchParams: ListingSearchParams;
  facets: ProductFacets;
  filters: ProductFilters;
  hide?: FacetKey[];
  className?: string;
}) {
  const skinOptions = facets.skinTypes.filter((s) => s.slug !== 'all');

  return (
    <div className={cn('text-fg', className)}>
      <div className="flex items-baseline justify-between pb-4">
        <h2 className="eyebrow text-fg-subtle">Refine</h2>
        {hasActiveFilters(filters) ? (
          <Link
            href={pathname}
            className="eyebrow text-fg-subtle hover:text-fg link-underline"
          >
            Clear
          </Link>
        ) : null}
      </div>

      <div className="space-y-0">
        {hide.includes('category') ? null : (
          <FacetGroup
            title="Category"
            options={facets.categories}
            facetKey="category"
            pathname={pathname}
            searchParams={searchParams}
            selected={filters.categorySlugs ?? []}
          />
        )}
        {hide.includes('brand') ? null : (
          <FacetGroup
            title="Brand"
            options={facets.brands}
            facetKey="brand"
            pathname={pathname}
            searchParams={searchParams}
            selected={filters.brandSlugs ?? []}
          />
        )}
        {hide.includes('concern') ? null : (
          <FacetGroup
            title="Concern"
            options={facets.concerns}
            facetKey="concern"
            pathname={pathname}
            searchParams={searchParams}
            selected={filters.concernSlugs ?? []}
          />
        )}
        {hide.includes('skin') ? null : (
          <FacetGroup
            title="Skin type"
            options={skinOptions}
            facetKey="skin"
            pathname={pathname}
            searchParams={searchParams}
            selected={filters.skinTypes ?? []}
            labels={SKIN_LABELS}
            defaultOpen={false}
          />
        )}

        <PriceFilter
          pathname={pathname}
          searchParams={searchParams}
          filters={filters}
          range={facets.priceRange}
        />

        <div className="border-line border-t border-b py-5">
          <ToggleFilter
            href={listingHref(pathname, searchParams, {
              stock: filters.inStockOnly ? null : '1',
            })}
            checked={Boolean(filters.inStockOnly)}
            label="In stock only"
          />
          <ToggleFilter
            href={listingHref(pathname, searchParams, {
              sale: filters.onSaleOnly ? null : '1',
            })}
            checked={Boolean(filters.onSaleOnly)}
            label="On sale"
          />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Toolbar: result count, sort, mobile filters                                 */
/* -------------------------------------------------------------------------- */

export function SortMenu({
  pathname,
  searchParams,
  sort,
}: {
  pathname: string;
  searchParams: ListingSearchParams;
  sort: ProductSort;
}) {
  return (
    <details className="relative">
      <summary className="eyebrow text-fg hover:text-fg-muted flex cursor-pointer list-none items-center gap-2">
        Sort: {SORT_LABELS[sort]}
        <span aria-hidden className="text-fg-subtle">
          ▾
        </span>
      </summary>
      <ul className="border-line bg-surface-raised shadow-overlay absolute top-full right-0 z-30 mt-2 w-56 border py-2">
        {PRODUCT_SORTS.map((option) => (
          <li key={option}>
            <Link
              href={listingHref(pathname, searchParams, {
                sort: option,
                page: null,
              })}
              aria-current={option === sort ? 'true' : undefined}
              className={cn(
                'hover:bg-accent-soft block px-4 py-2 text-sm transition-colors',
                option === sort ? 'text-fg' : 'text-fg-muted',
              )}
            >
              {SORT_LABELS[option]}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Removable chips for everything currently narrowing the grid. */
export function ActiveFilters({
  pathname,
  searchParams,
  filters,
  facets,
  hide = [],
}: {
  pathname: string;
  searchParams: ListingSearchParams;
  filters: ProductFilters;
  facets: ProductFacets;
  hide?: FacetKey[];
}) {
  const nameOf = (options: FacetOption[], slug: string) =>
    options.find((o) => o.slug === slug)?.name ?? slug;

  const chips: { label: string; href: string }[] = [];

  if (filters.search) {
    chips.push({
      label: `“${filters.search}”`,
      href: listingHref(pathname, searchParams, { q: null }),
    });
  }
  if (!hide.includes('category')) {
    for (const slug of filters.categorySlugs ?? []) {
      chips.push({
        label: nameOf(facets.categories, slug),
        href: toggleFacetHref(pathname, searchParams, 'category', slug),
      });
    }
  }
  if (!hide.includes('brand')) {
    for (const slug of filters.brandSlugs ?? []) {
      chips.push({
        label: nameOf(facets.brands, slug),
        href: toggleFacetHref(pathname, searchParams, 'brand', slug),
      });
    }
  }
  if (!hide.includes('concern')) {
    for (const slug of filters.concernSlugs ?? []) {
      chips.push({
        label: nameOf(facets.concerns, slug),
        href: toggleFacetHref(pathname, searchParams, 'concern', slug),
      });
    }
  }
  if (!hide.includes('skin')) {
    for (const slug of filters.skinTypes ?? []) {
      chips.push({
        label: SKIN_LABELS[slug] ?? slug,
        href: toggleFacetHref(pathname, searchParams, 'skin', slug),
      });
    }
  }
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    chips.push({
      label: `${filters.minPrice !== undefined ? formatMoney(filters.minPrice) : 'Any'} – ${
        filters.maxPrice !== undefined ? formatMoney(filters.maxPrice) : 'Any'
      }`,
      href: listingHref(pathname, searchParams, { min: null, max: null }),
    });
  }
  if (filters.inStockOnly) {
    chips.push({
      label: 'In stock',
      href: listingHref(pathname, searchParams, { stock: null }),
    });
  }
  if (filters.onSaleOnly) {
    chips.push({
      label: 'On sale',
      href: listingHref(pathname, searchParams, { sale: null }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <ul className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <li key={chip.href + chip.label}>
          <Link
            href={chip.href}
            className="border-line-strong text-fg hover:bg-accent-soft inline-flex items-center gap-2 border px-3 py-1.5 text-xs transition-colors"
          >
            {chip.label}
            <CloseIcon width={11} height={11} aria-hidden />
            <span className="sr-only">Remove filter</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Pagination                                                                  */
/* -------------------------------------------------------------------------- */

/** Page numbers with ellipses: always first, last, current and its neighbours. */
function pageWindow(page: number, totalPages: number): (number | 'gap')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set([1, totalPages, page, page - 1, page + 1]);
  const sorted = [...pages]
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);

  const out: (number | 'gap')[] = [];
  let previous = 0;
  for (const p of sorted) {
    if (previous && p - previous > 1) out.push('gap');
    out.push(p);
    previous = p;
  }
  return out;
}

export function Pagination({
  pathname,
  searchParams,
  page,
  totalPages,
}: {
  pathname: string;
  searchParams: ListingSearchParams;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  const href = (p: number) =>
    listingHref(pathname, searchParams, { page: p === 1 ? null : String(p) });

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center">
      <ul className="flex items-center gap-1">
        <li>
          {page > 1 ? (
            <Link
              href={href(page - 1)}
              rel="prev"
              className="eyebrow text-fg-muted hover:text-fg px-3 py-2"
            >
              Prev
            </Link>
          ) : (
            <span className="eyebrow text-fg-subtle px-3 py-2 opacity-40">
              Prev
            </span>
          )}
        </li>

        {pageWindow(page, totalPages).map((entry, i) =>
          entry === 'gap' ? (
            <li
              key={`gap-${i}`}
              aria-hidden
              className="text-fg-subtle px-2 text-xs"
            >
              …
            </li>
          ) : (
            <li key={entry}>
              <Link
                href={href(entry)}
                aria-current={entry === page ? 'page' : undefined}
                className={cn(
                  'inline-flex size-9 items-center justify-center text-sm tabular-nums transition-colors',
                  entry === page
                    ? 'bg-fg text-surface'
                    : 'text-fg-muted hover:bg-accent-soft',
                )}
              >
                {entry}
              </Link>
            </li>
          ),
        )}

        <li>
          {page < totalPages ? (
            <Link
              href={href(page + 1)}
              rel="next"
              className="eyebrow text-fg-muted hover:text-fg px-3 py-2"
            >
              Next
            </Link>
          ) : (
            <span className="eyebrow text-fg-subtle px-3 py-2 opacity-40">
              Next
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/* Whole listing body                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The grid, its toolbar, its filters and its pagination — assembled once so
 * every listing route is a few lines of data fetching plus this.
 */
export function ListingBody({
  pathname,
  searchParams,
  result,
  facets,
  filters,
  sort,
  wishlisted,
  hide = [],
}: {
  pathname: string;
  searchParams: ListingSearchParams;
  result: {
    items: ProductCardView[];
    total: number;
    page: number;
    totalPages: number;
  };
  facets: ProductFacets;
  filters: ProductFilters;
  sort: ProductSort;
  wishlisted?: Set<string>;
  hide?: FacetKey[];
}) {
  const sidebar = (
    <FilterSidebar
      pathname={pathname}
      searchParams={searchParams}
      facets={facets}
      filters={filters}
      hide={hide}
    />
  );

  return (
    <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[16rem_1fr] xl:grid-cols-[18rem_1fr]">
      {/* Desktop rail */}
      <aside className="hidden lg:block">{sidebar}</aside>

      <div>
        <div className="border-line mb-8 flex items-center justify-between gap-4 border-b pb-4">
          <p className="text-fg-subtle text-xs tabular-nums">
            {result.total} {result.total === 1 ? 'product' : 'products'}
          </p>

          <div className="flex items-center gap-6">
            {/* Mobile filter disclosure — same markup, different placement. */}
            <details className="lg:hidden">
              <summary className="eyebrow text-fg cursor-pointer list-none">
                Filter
              </summary>
              <div className="border-line bg-surface fixed inset-x-0 bottom-0 z-40 max-h-[80dvh] overflow-y-auto border-t p-6 shadow-[0_-12px_48px_-20px_rgb(13_15_14/0.3)]">
                {sidebar}
              </div>
            </details>
            <SortMenu
              pathname={pathname}
              searchParams={searchParams}
              sort={sort}
            />
          </div>
        </div>

        <div className="mb-8 empty:mb-0">
          <ActiveFilters
            pathname={pathname}
            searchParams={searchParams}
            filters={filters}
            facets={facets}
            hide={hide}
          />
        </div>

        {result.items.length > 0 ? (
          <>
            <ProductGrid products={result.items} wishlisted={wishlisted} />
            <div className="mt-20">
              <Pagination
                pathname={pathname}
                searchParams={searchParams}
                page={result.page}
                totalPages={result.totalPages}
              />
            </div>
          </>
        ) : (
          <EmptyState
            icon={<SearchIcon width={28} height={28} />}
            title="Nothing matches that combination"
            description="Try removing a filter, or widening the price range."
            action={
              <ButtonLink href={pathname} variant="secondary">
                Clear filters
              </ButtonLink>
            }
          />
        )}
      </div>
    </div>
  );
}
