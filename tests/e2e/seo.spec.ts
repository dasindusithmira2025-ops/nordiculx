import { test, expect } from '@playwright/test';
import { brands, buyableProduct } from './fixtures';

/**
 * The indexable surface.
 *
 * The assertions that matter are the exclusions: a sitemap or a crawlable link
 * that exposes an order reference is a privacy failure, not just an SEO one.
 */

test.describe('sitemap and robots', () => {
  test('the sitemap lists catalogue pages and excludes private ones', async ({
    request,
  }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);

    const xml = await response.text();
    expect(xml).toContain('/product/');
    expect(xml).toContain('/category/');
    expect(xml).toContain('/edit/');

    // Nothing private, single-use, or containing an order reference.
    expect(xml).not.toContain('/account');
    expect(xml).not.toContain('/checkout');
    expect(xml).not.toContain('/order/');
    expect(xml).not.toContain('/track/');
  });

  test('robots disallows the private areas and points at the sitemap', async ({
    request,
  }) => {
    const body = await (await request.get('/robots.txt')).text();

    expect(body).toContain('Disallow: /account/');
    expect(body).toContain('Disallow: /checkout');
    expect(body).toContain('Disallow: /order/');
    expect(body).toContain('Disallow: /track/');
    expect(body).toMatch(/Sitemap:\s*\S+\/sitemap\.xml/);
  });
});

test.describe('structured data', () => {
  const parseAll = async (page: import('@playwright/test').Page) =>
    page
      .locator('script[type="application/ld+json"]')
      .allTextContents()
      .then((blocks) => blocks.map((b) => JSON.parse(b)));

  test('every page carries site identity, and it parses', async ({ page }) => {
    await page.goto('/');
    const types = (await parseAll(page)).map((d) => d['@type']);
    expect(types).toContain('Organization');
    expect(types).toContain('WebSite');
  });

  test('a breadcrumb trail is described as well as displayed', async ({
    page,
  }) => {
    const [brand] = await brands(page);
    await page.goto(`/brands/${brand.slug}`);

    const crumbs = (await parseAll(page)).find(
      (d) => d['@type'] === 'BreadcrumbList',
    );
    expect(crumbs).toBeTruthy();

    // The structured trail must match the visible one, starting at Home.
    const names = crumbs.itemListElement.map((i: { name: string }) => i.name);
    expect(names[0]).toBe('Home');
    expect(names).toContain('Brands');

    const positions = crumbs.itemListElement.map(
      (i: { position: number }) => i.position,
    );
    expect(positions).toEqual(positions.map((_: number, n: number) => n + 1));
  });

  test('a product page describes the product it shows', async ({ page }) => {
    const fixture = await buyableProduct(page);
    await page.goto(`/product/${fixture.slug}`);

    const product = (await parseAll(page)).find(
      (d) => d['@type'] === 'Product',
    );
    expect(product.name).toBe(fixture.name);
    expect(product.offers.priceCurrency).toBe('USD');

    // Markup that disagrees with the page is what earns a penalty.
    await expect(
      page.getByRole('heading', { level: 1, name: product.name }),
    ).toBeVisible();
  });
});
