import { skinTypeEnum } from '@/lib/db/schema';
import type { SkinType } from '@/lib/db/schema';
import { PRODUCT_SORTS, type ProductFilters, type ProductSort } from './types';

/**
 * URL ⇄ filter translation for every product listing.
 *
 * The query string is the single source of truth for a listing's state: it is
 * shareable, bookmarkable, survives a back button and needs no client store.
 * Every listing route (/shop, /category, /brands, /concern, /collection) parses
 * the same params through here, so a filter behaves identically wherever it
 * appears — and an unparseable value is dropped rather than throwing, because a
 * hand-edited URL must never produce a 500.
 */

export type ListingSearchParams = Record<string, string | string[] | undefined>;

export const PAGE_SIZE = 24;

/** Params that describe filtering/sorting. Anything else is left alone. */
const LISTING_KEYS = [
  'brand',
  'category',
  'concern',
  'skin',
  'min',
  'max',
  'stock',
  'sale',
  'sort',
  'page',
  'q',
] as const;

const SKIN_TYPES = new Set<string>(skinTypeEnum.enumValues);

/** A repeated param may arrive as `?brand=a&brand=b` or `?brand=a,b`. */
function toList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  const raw = Array.isArray(value) ? value : [value];
  return [
    ...new Set(
      raw
        .flatMap((v) => v.split(','))
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ];
}

/** Dollars in the URL, cents in the database — the boundary is here. */
function toCents(value: string | string[] | undefined): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.round(parsed * 100);
}

function toFlag(value: string | string[] | undefined): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === '1' || raw === 'true' || raw === 'on';
}

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || undefined;
}

export type ParsedListing = {
  filters: ProductFilters;
  /** The route's own filters, echoed back so facet counts can reapply them. */
  locked: ProductFilters;
  sort: ProductSort;
  page: number;
};

/**
 * `locked` filters come from the route itself (the brand on /brands/kvist) and
 * are merged in after parsing, so a crafted query string cannot widen a listing
 * beyond the page the visitor is actually on.
 */
export function parseListing(
  searchParams: ListingSearchParams,
  locked: ProductFilters = {},
): ParsedListing {
  const sortParam = first(searchParams.sort);
  const sort: ProductSort = PRODUCT_SORTS.includes(sortParam as ProductSort)
    ? (sortParam as ProductSort)
    : 'featured';

  const pageRaw = Number(first(searchParams.page) ?? '1');
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  const minPrice = toCents(searchParams.min);
  const maxPrice = toCents(searchParams.max);

  const filters: ProductFilters = {
    brandSlugs: toList(searchParams.brand),
    categorySlugs: toList(searchParams.category),
    concernSlugs: toList(searchParams.concern),
    skinTypes: toList(searchParams.skin).filter((s): s is SkinType =>
      SKIN_TYPES.has(s),
    ),
    inStockOnly: toFlag(searchParams.stock),
    onSaleOnly: toFlag(searchParams.sale),
  };

  // A reversed range is the user dragging the handles past each other, not an
  // error worth showing — swap it and carry on.
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    filters.minPrice = maxPrice;
    filters.maxPrice = minPrice;
  } else {
    if (minPrice !== undefined) filters.minPrice = minPrice;
    if (maxPrice !== undefined) filters.maxPrice = maxPrice;
  }

  const search = first(searchParams.q);
  if (search) filters.search = search;

  return { filters: { ...filters, ...locked }, locked, sort, page };
}

/** True when anything beyond the route's own scope is narrowing the listing. */
export function hasActiveFilters(filters: ProductFilters): boolean {
  return Boolean(
    filters.brandSlugs?.length ||
    filters.categorySlugs?.length ||
    filters.concernSlugs?.length ||
    filters.skinTypes?.length ||
    filters.minPrice !== undefined ||
    filters.maxPrice !== undefined ||
    filters.inStockOnly ||
    filters.onSaleOnly ||
    filters.search,
  );
}

/**
 * Rebuild a listing URL with `patch` applied.
 *
 * Setting any filter resets `page` — landing on page 7 of a result set that now
 * has two pages is the classic faceted-search dead end. Passing `page`
 * explicitly in the patch overrides that reset.
 */
export function listingHref(
  pathname: string,
  searchParams: ListingSearchParams,
  patch: Record<string, string | string[] | null | undefined>,
): string {
  const params = new URLSearchParams();

  for (const key of LISTING_KEYS) {
    if (key in patch) continue;
    for (const value of toList(searchParams[key])) params.append(key, value);
  }

  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) {
      if (v) params.append(key, v);
    }
  }

  if (!('page' in patch)) params.delete('page');
  if (params.get('page') === '1') params.delete('page');
  if (params.get('sort') === 'featured') params.delete('sort');

  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Toggle one value of a multi-select facet, returning the resulting href. */
export function toggleFacetHref(
  pathname: string,
  searchParams: ListingSearchParams,
  key: 'brand' | 'category' | 'concern' | 'skin',
  value: string,
): string {
  const current = toList(searchParams[key]);
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
  return listingHref(pathname, searchParams, { [key]: next });
}

export const SORT_LABELS: Record<ProductSort, string> = {
  featured: 'Featured',
  'best-selling': 'Best selling',
  newest: 'Newest',
  'price-asc': 'Price, low to high',
  'price-desc': 'Price, high to low',
  rating: 'Best rated',
  name: 'Alphabetical',
};
