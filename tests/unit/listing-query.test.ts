import { describe, it, expect } from 'vitest';
import {
  hasActiveFilters,
  listingHref,
  parseListing,
  toggleFacetHref,
} from '@/lib/catalogue/query';

describe('parseListing', () => {
  it('defaults to featured, page 1 and no filters', () => {
    const { filters, sort, page } = parseListing({});
    expect(sort).toBe('featured');
    expect(page).toBe(1);
    expect(hasActiveFilters(filters)).toBe(false);
  });

  it('accepts a facet as a repeated param or a comma list, deduped', () => {
    expect(
      parseListing({ brand: ['kvist', 'kvist'] }).filters.brandSlugs,
    ).toEqual(['kvist']);
    expect(
      parseListing({ brand: 'kvist,lume-studio' }).filters.brandSlugs,
    ).toEqual(['kvist', 'lume-studio']);
  });

  it('converts rupee price params to cents', () => {
    const { filters } = parseListing({ min: '2000', max: '5000' });
    expect(filters.minPrice).toBe(200_000);
    expect(filters.maxPrice).toBe(500_000);
  });

  it('swaps a reversed price range rather than returning nothing', () => {
    const { filters } = parseListing({ min: '9000', max: '1000' });
    expect(filters.minPrice).toBe(100_000);
    expect(filters.maxPrice).toBe(900_000);
  });

  it('drops junk instead of throwing — a hand-edited URL must not 500', () => {
    const { filters, sort, page } = parseListing({
      sort: 'wat',
      page: '-4',
      min: 'abc',
      skin: 'dry,unicorn',
    });
    expect(sort).toBe('featured');
    expect(page).toBe(1);
    expect(filters.minPrice).toBeUndefined();
    expect(filters.skinTypes).toEqual(['dry']);
  });

  it('lets route-locked filters win over the query string', () => {
    const { filters } = parseListing(
      { brand: 'attacker-supplied' },
      { brandSlugs: ['kvist'] },
    );
    expect(filters.brandSlugs).toEqual(['kvist']);
  });
});

describe('listingHref', () => {
  it('drops page when any filter changes, to avoid an empty page 7', () => {
    const href = listingHref(
      '/shop',
      { page: '7', brand: 'kvist' },
      {
        concern: ['dryness'],
      },
    );
    expect(href).not.toContain('page=');
    expect(href).toContain('brand=kvist');
    expect(href).toContain('concern=dryness');
  });

  it('keeps an explicit page in the patch', () => {
    expect(listingHref('/shop', {}, { page: '3' })).toBe('/shop?page=3');
  });

  it('omits defaults so the canonical listing URL stays clean', () => {
    expect(listingHref('/shop', {}, { sort: 'featured', page: '1' })).toBe(
      '/shop',
    );
  });

  it('ignores params outside the listing vocabulary', () => {
    expect(listingHref('/shop', { utm_source: 'newsletter' }, {})).toBe(
      '/shop',
    );
  });
});

describe('toggleFacetHref', () => {
  it('adds a value that is not selected', () => {
    expect(toggleFacetHref('/shop', {}, 'brand', 'kvist')).toBe(
      '/shop?brand=kvist',
    );
  });

  it('removes a value that is already selected', () => {
    expect(toggleFacetHref('/shop', { brand: 'kvist' }, 'brand', 'kvist')).toBe(
      '/shop',
    );
  });

  it('leaves the other selections in place', () => {
    const href = toggleFacetHref(
      '/shop',
      { brand: 'kvist,lume-studio' },
      'brand',
      'kvist',
    );
    expect(href).toBe('/shop?brand=lume-studio');
  });
});
