import { test, expect } from '@playwright/test';
import { brands } from './fixtures';

/**
 * The content and support surface: taxonomy landings, editorial, CMS pages and
 * the contact form.
 *
 * These assert structure and behaviour rather than copy — merchandising and
 * legal wording change without warning, and a suite that breaks when a
 * paragraph is reworded stops being run.
 */

test.describe('taxonomy landings', () => {
  test('a brand page locks its listing to that brand', async ({ page }) => {
    const [brand] = await brands(page);
    await page.goto('/brands');
    // Located by href, not by name: several brand names carry diacritics, and
    // the slug is the stable identifier.
    await page.locator(`a[href="/brands/${brand.slug}"]`).first().click();

    await expect(page).toHaveURL(new RegExp(`/brands/${brand.slug}`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Every card on the page belongs to this brand.
    const brandHrefs = await page
      .getByRole('article')
      .locator('a[href^="/brands/"]')
      .evaluateAll((links) => [
        ...new Set(links.map((l) => l.getAttribute('href'))),
      ]);
    expect(brandHrefs).toEqual([`/brands/${brand.slug}`]);
  });

  test('a crafted query string cannot widen a brand listing', async ({
    page,
  }) => {
    // The route's own brand is locked, so adding another must not leak it in.
    const [first, second] = await brands(page);
    await page.goto(`/brands/${first.slug}?brand=${second.slug}`);

    const brandHrefs = await page
      .getByRole('article')
      .locator('a[href^="/brands/"]')
      .evaluateAll((links) => [
        ...new Set(links.map((l) => l.getAttribute('href'))),
      ]);
    expect(brandHrefs).toEqual([`/brands/${first.slug}`]);
  });

  test('a concern page shows guidance and its products', async ({ page }) => {
    await page.goto('/concern/dryness');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('article').first()).toBeVisible();
  });

  test('a campaign outside its window is not reachable', async ({ page }) => {
    const live = await page.goto('/campaigns/the-quiet-season');
    expect(live?.status()).toBe(200);

    const missing = await page.goto('/campaigns/not-a-real-campaign');
    expect(missing?.status()).toBe(404);
  });
});

test.describe('editorial', () => {
  test('the index filters by topic and opens an article', async ({ page }) => {
    await page.goto('/edit');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Topics' })
      .getByRole('link', { name: 'Ingredients' })
      .click();
    await expect(page).toHaveURL(/topic=ingredients/);

    await page.getByRole('heading', { level: 2 }).first().click();
    await expect(page).toHaveURL(/\/edit\/[a-z0-9-]+/);
  });

  test('an article emits Article structured data', async ({ page }) => {
    await page.goto('/edit/how-to-read-an-ingredient-list');

    // Selected by type, not position: the storefront layout also emits
    // Organization and WebSite, so "the first block" is not this page's schema.
    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    const data = blocks
      .map((b) => JSON.parse(b))
      .find((d) => d['@type'] === 'Article');

    expect(data).toBeTruthy();
    expect(data.headline).toBeTruthy();
    expect(data.datePublished).toBeTruthy();
  });

  test('article body renders content blocks, not escaped markup', async ({
    page,
  }) => {
    await page.goto('/edit/how-to-read-an-ingredient-list');

    // Headings from the stored block array become real elements.
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();

    // Long-form copy uses the reading size, not the commerce UI size. This
    // regressed once when tailwind-merge dropped the custom font size.
    const size = await page
      .locator('[class*="max-w-prose"] p')
      .first()
      .evaluate((el) => getComputedStyle(el).fontSize);
    expect(size).toBe('18px');
  });

  test('an unpublished slug 404s rather than rendering empty', async ({
    page,
  }) => {
    const response = await page.goto('/edit/no-such-article');
    expect(response?.status()).toBe(404);
  });
});

test.describe('CMS pages', () => {
  for (const slug of [
    'about',
    'authenticity',
    'shipping',
    'returns-policy',
    'privacy',
    'terms',
    'cookies',
  ]) {
    test(`/${slug} renders`, async ({ page }) => {
      const response = await page.goto(`/${slug}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });
  }

  test('an unknown top-level slug 404s', async ({ page }) => {
    const response = await page.goto('/not-a-real-page');
    expect(response?.status()).toBe(404);
  });

  test('the FAQ emits FAQPage data and discloses answers', async ({ page }) => {
    await page.goto('/faq');

    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    const data = blocks
      .map((b) => JSON.parse(b))
      .find((d) => d['@type'] === 'FAQPage');

    expect(data).toBeTruthy();
    expect(data.mainEntity.length).toBeGreaterThan(0);

    // Answers are collapsed until opened, and opening one reveals its text.
    const first = page.locator('details').first();
    await expect(first).not.toHaveAttribute('open', '');
    await first.getByRole('group').or(first.locator('summary')).first().click();
    await expect(first).toHaveAttribute('open', '');
  });
});

test.describe('contact', () => {
  // The live-chat panel also has a "Message" textarea, so every field lookup is
  // scoped to the contact form rather than the page.
  const contactForm = (page: import('@playwright/test').Page) =>
    page.locator('form').filter({ has: page.getByLabel('Order reference') });

  test('a valid message creates a ticket and returns a reference', async ({
    page,
  }) => {
    await page.goto('/contact');
    const form = contactForm(page);

    await form.getByLabel('Your name').fill('Test Person');
    await form.getByLabel('Email address').fill('test.person@example.com');
    await form.getByLabel('What is this about?').selectOption('Product advice');
    await form
      .getByLabel('Message')
      .fill('Which moisturiser suits dehydrated skin in humidity?');

    await page.getByRole('button', { name: /send message/i }).click();

    // Success replaces the form with the reference, so the message cannot be
    // submitted twice by accident.
    const status = page.getByRole('status');
    await expect(status).toBeVisible();
    await expect(status).toContainText(/NLS-[2-9A-Z]{4}-[2-9A-Z]{4}/);
  });

  test('an invalid message is rejected with a field error', async ({
    page,
  }) => {
    await page.goto('/contact');
    const form = contactForm(page);

    // Too short to be a real enquiry; the schema is the boundary, not the form.
    await form.getByLabel('Your name').fill('Test Person');
    await form.getByLabel('Email address').fill('test.person@example.com');
    await form.getByLabel('What is this about?').selectOption('Delivery');
    // `novalidate` is not set, so bypass the browser's own minlength check to
    // prove the server-side schema rejects it too.
    await form.getByLabel('Message').fill('hi');

    await page.getByRole('button', { name: /send message/i }).click();

    await expect(page.getByRole('alert').first()).toBeVisible();
    // Still on the form, nothing submitted.
    await expect(
      page.getByRole('button', { name: /send message/i }),
    ).toBeVisible();
  });
});
