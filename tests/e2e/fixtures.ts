import { expect, type Page } from '@playwright/test';

/**
 * Catalogue fixtures resolved from the running storefront, not hard-coded.
 *
 * The suite used to name demo-catalogue slugs (`halvor-hydrating-serum`,
 * `kvist`). The real 87-product import does not contain them, so every spec
 * that touched a product or a brand 404'd — the checkout path lost its
 * automated proof entirely. Reading the fixture off `/shop` instead means the
 * suite follows whatever catalogue is actually loaded, and a merchandising
 * change can no longer turn it red.
 *
 * Resolution is cached per worker: it costs one page load, not one per test.
 */

export type ProductFixture = {
  slug: string;
  name: string;
  /** Sizes offered on the PDP. Most of the real catalogue ships a single one. */
  variantLabels: string[];
};

export type BrandFixture = { slug: string; name: string };

let productCache: Promise<ProductFixture> | null = null;
/** At least two, so a spec can always assert one facet against another. */
type BrandPair = [BrandFixture, BrandFixture, ...BrandFixture[]];

let brandCache: Promise<BrandPair> | null = null;

/** A published, in-stock product that can actually be bought. */
export function buyableProduct(page: Page): Promise<ProductFixture> {
  productCache ??= resolveProduct(page);
  return productCache;
}

async function resolveProduct(page: Page): Promise<ProductFixture> {
  // `stock=1` is the listing's own in-stock facet, so an out-of-stock product
  // can never be handed to a checkout spec.
  await page.goto('/shop?stock=1');
  const link = page
    .getByRole('article')
    .first()
    .locator('a[href^="/product/"]');
  await expect(link.first()).toBeVisible();

  const href = await link.first().getAttribute('href');
  const slug = href!.replace('/product/', '');

  await page.goto(`/product/${slug}`);
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toBeVisible();
  const name = (await heading.innerText()).trim();

  // The size fieldset renders only when a product has more than one variant,
  // so an empty list is a valid catalogue state, not a failure.
  const variantLabels = await page
    .locator('fieldset:has(input[name="variant"]) label')
    .allInnerTexts();

  return { slug, name, variantLabels: variantLabels.map((v) => v.trim()) };
}

/** Brands that currently carry products, in listing order. */
export function brands(page: Page): Promise<BrandPair> {
  brandCache ??= resolveBrands(page);
  return brandCache;
}

async function resolveBrands(page: Page): Promise<BrandPair> {
  await page.goto('/brands');
  const links = page.locator('a[href^="/brands/"]');
  await expect(links.first()).toBeVisible();

  const found = await links.evaluateAll((els) =>
    els
      .map((el) => ({
        slug: (el.getAttribute('href') ?? '').replace('/brands/', ''),
        name: (el.textContent ?? '').trim(),
      }))
      .filter((b) => b.slug && !b.slug.includes('/')),
  );

  const unique = new Map(found.map((b) => [b.slug, b]));
  const list = [...unique.values()];
  expect(list.length).toBeGreaterThan(1);
  return list as BrandPair;
}

/** Puts one unit of a real product in the bag and waits for the drawer. */
export async function addToBag(page: Page, slug?: string) {
  const product = slug ? null : await buyableProduct(page);
  await page.goto(`/product/${slug ?? product!.slug}`);
  await page.getByRole('button', { name: /^add to bag$/i }).click();
  await expect(page.getByRole('dialog', { name: 'Your bag' })).toBeVisible();
  return product;
}

/**
 * Places a real guest order and returns its reference.
 *
 * Admin specs used to reach for whatever orders the seed happened to leave
 * behind, which coupled them to demo data that has since been purged. Creating
 * the order they act on makes them self-contained and keeps the operating
 * dataset free of fixtures.
 */
export async function placeGuestOrder(page: Page, email: string) {
  await addToBag(page);
  await page.goto('/checkout');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Phone', { exact: true }).fill('0771234567');
  await page.getByLabel('Recipient name').fill('Amaya Perera');
  await page.getByLabel('Delivery phone').fill('0771234567');
  await page.getByLabel('Address', { exact: true }).fill('42 Galle Road');
  await page.getByLabel('City').fill('Colombo');
  await page.getByRole('button', { name: /place order/i }).click();

  await expect(page).toHaveURL(/\/order\/NL-/);
  return new URL(page.url()).pathname.split('/').pop()!;
}
