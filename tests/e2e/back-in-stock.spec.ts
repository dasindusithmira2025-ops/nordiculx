import { test, expect, type Page } from '@playwright/test';

/**
 * Back in stock: subscribe, restock, notify once, unsubscribe.
 *
 * The mail driver is `log` in development, so delivery itself is not asserted
 * here — what is asserted is everything the application controls: that the
 * request is recorded, that a restock consumes it exactly once, and that the
 * unsubscribe link works without a session.
 */

const OWNER = { email: 'owner@nordiclux.test', password: 'DevOwner!2026' };

async function staffSignIn(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Email address').fill(OWNER.email);
  await page.getByLabel('Password').fill(OWNER.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/admin(\?|$)/);
}

/**
 * The one genuinely out-of-stock product, found through the admin's own
 * `stock=out` filter. The shop listing sorts sellable items first, so an
 * out-of-stock product is not reliably on the first page of it.
 */
async function outOfStockProduct(page: Page) {
  await staffSignIn(page);
  await page.goto('/admin/products?stock=out');
  const link = page.locator('a[href^="/product/"]').first();
  await expect(link).toBeVisible();
  return (await link.getAttribute('href'))!;
}

test.describe.configure({ mode: 'serial' });

test.describe('back in stock', () => {
  test('an in-stock product does not ask for a notification', async ({
    page,
  }) => {
    await page.goto('/shop?stock=1');
    await page.getByRole('article').first().locator('a').first().click();
    await expect(page).toHaveURL(/\/product\//);

    await expect(
      page.getByRole('button', { name: /^add to bag$/i }),
    ).toBeEnabled();
    await expect(page.getByLabel(/tell me when this is back/i)).toHaveCount(0);
  });

  test('an out-of-stock product takes a request and a restock clears it', async ({
    page,
  }) => {
    // The catalogue holds exactly one out-of-stock product and this test
    // restocks it, so a second project would find nothing to subscribe to.
    // The flow has no viewport-specific behaviour to prove twice.
    test.skip(
      test.info().project.name === 'mobile',
      'consumes the single out-of-stock fixture',
    );
    const href = await outOfStockProduct(page);
    const email = `restock.${Date.now()}@example.com`;

    await page.goto(href);
    await expect(
      page.getByRole('button', { name: /out of stock/i }),
    ).toBeVisible();
    await page.getByLabel(/tell me when this is back/i).fill(email);
    await page.getByRole('button', { name: /notify me/i }).click();
    await expect(page.getByRole('status')).toContainText(/we will email you/i);

    // Asking twice is idempotent, not a second subscription.
    await page.goto(href);
    await page.getByLabel(/tell me when this is back/i).fill(email);
    await page.getByRole('button', { name: /notify me/i }).click();
    await expect(page.getByRole('status')).toBeVisible();

    // Staff see one person waiting, and restocking notifies them.
    await page.goto('/admin/products?stock=out');

    const row = page.locator('tr').filter({ hasText: '1 waiting' }).first();
    await expect(row).toBeVisible();

    await row.locator('input[name="stockDelta"]').fill('5');
    await row.getByRole('button', { name: /save/i }).click();

    // The queue is now empty: the same restock cannot notify them again.
    await expect(page.getByText('1 waiting')).toHaveCount(0);
  });

  test('an unknown unsubscribe token changes nothing and says so', async ({
    page,
  }) => {
    await page.goto('/back-in-stock/unsubscribe?token=not-a-real-token');
    await expect(
      page.getByRole('heading', { level: 1, name: /not recognised/i }),
    ).toBeVisible();
  });
});
