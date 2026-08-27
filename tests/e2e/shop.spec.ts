import { test, expect } from '@playwright/test';
import { addToBag, brands, buyableProduct } from './fixtures';

/**
 * The paths a visitor must be able to complete before anything else matters:
 * find a product, choose a size, put it in the bag, and see it there.
 *
 * These run against a seeded database. They assert behaviour, not copy, so a
 * merchandising change does not turn the suite red.
 *
 * The filter rail is rendered twice — once as a desktop aside, once inside the
 * mobile disclosure — so facet assertions scope to `aside` and run only at
 * desktop width. The bag and PDP tests run on both.
 */

const isMobileProject = () => test.info().project.name === 'mobile';

test.describe('catalogue browsing', () => {
  test('the shop lists products and refines by brand', async ({ page }) => {
    test.skip(isMobileProject(), 'desktop filter rail only');
    const [first, second] = await brands(page);
    await page.goto('/shop');

    await expect(page.getByRole('article').first()).toBeVisible();

    // Facets are located by the query they set, not by their label: the rail
    // appends a result count to every brand name.
    const rail = page.locator('aside');
    await rail.locator(`a[href*="brand=${first.slug}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`brand=${first.slug}`));

    // Every remaining card belongs to the chosen brand.
    const cards = page.getByRole('article');
    await expect(cards.first()).toBeVisible();
    const brandHrefs = await cards
      .locator('a[href^="/brands/"]')
      .evaluateAll((links) => [
        ...new Set(links.map((l) => l.getAttribute('href'))),
      ]);
    expect(brandHrefs).toEqual([`/brands/${first.slug}`]);

    // The chosen facet stays selectable so a second brand can still be added —
    // counting a facet against itself used to strand the visitor here.
    await expect(
      rail.locator(`a[href*="brand=${second.slug}"]`).first(),
    ).toBeVisible();
  });

  test('a nonsense query string does not break the page', async ({ page }) => {
    const response = await page.goto(
      '/shop?sort=nonsense&page=-3&min=abc&skin=unicorn',
    );
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('article').first()).toBeVisible();
  });

  test('clearing filters returns to the unfiltered listing', async ({
    page,
  }) => {
    test.skip(isMobileProject(), 'desktop filter rail only');
    const [brand] = await brands(page);
    await page.goto(`/shop?brand=${brand.slug}&sale=1`);
    await page.locator('aside').getByRole('link', { name: 'Clear' }).click();
    await expect(page).toHaveURL(/\/shop$/);
  });
});

test.describe('product detail', () => {
  test('shows the product and switches variant pricing', async ({ page }) => {
    const product = await buyableProduct(page);
    await page.goto(`/product/${product.slug}`);

    await expect(
      page.getByRole('heading', { level: 1, name: product.name }),
    ).toBeVisible();

    const price = page.getByText(/^\$/).first();
    await expect(price).toBeVisible();

    // Sizes only exist on a multi-variant product; the live catalogue ships
    // single-variant SKUs, so the switch is asserted only when there is one.
    test.skip(
      product.variantLabels.length < 2,
      'catalogue has no multi-variant product to switch',
    );
    const before = await price.innerText();
    await page.getByText(product.variantLabels[1]!, { exact: true }).click();
    await expect(price).not.toHaveText(before);
  });

  test('emits product structured data matching the page', async ({ page }) => {
    const product = await buyableProduct(page);
    await page.goto(`/product/${product.slug}`);
    // Selected by type, not position: the storefront layout also emits
    // Organization and WebSite, so "the first block" is not the product.
    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    const data = blocks
      .map((b) => JSON.parse(b))
      .find((d) => d['@type'] === 'Product');

    expect(data).toBeTruthy();
    expect(data.name).toBe(product.name);
    expect(data.offers.priceCurrency).toBe('USD');
  });
});

test.describe('bag', () => {
  test('adding a product opens the drawer with the right line', async ({
    page,
  }) => {
    const product = await buyableProduct(page);
    await page.goto(`/product/${product.slug}`);

    await page.getByRole('button', { name: /increase quantity/i }).click();
    await page.getByRole('button', { name: /^add to bag$/i }).click();

    // The drawer opens itself on a successful add.
    const drawer = page.getByRole('dialog', { name: 'Your bag' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(product.name).first()).toBeVisible();

    // Two units went in, so the header badge must say two.
    await expect(page.getByLabel(/Bag, 2 items/i)).toBeVisible();
  });

  test('the bag survives a reload', async ({ page }) => {
    await addToBag(page);

    await page.reload();
    await expect(page.getByLabel(/Bag, \d+ item/i)).toBeVisible();
  });
});
