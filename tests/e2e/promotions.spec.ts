import { test, expect, type Page } from '@playwright/test';
import { addToBag } from './fixtures';

/**
 * Promotions, from the staff screen that creates them to the money a customer
 * actually saves.
 *
 * The discount engine has unit tests; what had never been proven is that the
 * two ends are connected — until this suite was written there was no admin
 * screen to create a code and no storefront input to redeem one.
 */

const OWNER = { email: 'owner@nordiclux.test', password: 'DevOwner!2026' };

async function staffSignIn(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Email address').fill(OWNER.email);
  await page.getByLabel('Password').fill(OWNER.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/admin(\?|$)/);
}

/** Unique per test so parallel workers cannot collide on the code index. */
const uniqueCode = (prefix: string) =>
  `${prefix}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();

async function createPercentagePromotion(page: Page, code: string) {
  await page.goto('/admin/promotions');
  await page.getByRole('group').filter({ hasText: 'New promotion' }).click();

  const form = page.locator('details form');
  await form.getByLabel('Name').fill(`E2E ${code}`);
  await form.getByLabel('Code').fill(code);
  await form.getByLabel('Percent off').fill('25');
  await form.getByLabel('Enabled').check();
  await form.getByRole('button', { name: /create promotion/i }).click();

  await expect(
    page.getByRole('cell', { name: code, exact: true }),
  ).toBeVisible();
}

test.describe('promotions', () => {
  test('a staff-created code discounts a real checkout', async ({ page }) => {
    const code = uniqueCode('E2E');
    await staffSignIn(page);
    await createPercentagePromotion(page, code);

    // Same browser, storefront session: staff and customer cookies are
    // separate, so no sign-out is needed.
    await addToBag(page);
    await page.goto('/checkout');

    const summary = page.getByRole('complementary', { name: 'Order summary' });
    const total = summary.getByRole('definition').last();
    const before = await total.innerText();

    await summary.getByLabel('Promotion code').fill(code);
    await summary.getByRole('button', { name: /^apply$/i }).click();

    // The code is shown as applied, a discount line appears, and the total moved.
    await expect(summary.getByText(`Code ${code} applied`)).toBeVisible();
    await expect(summary.getByText('Discount')).toBeVisible();
    await expect(total).not.toHaveText(before);

    // And it survives into the order that is actually written.
    await page.getByLabel('Email address').fill('promo.buyer@example.com');
    await page.getByLabel('Phone', { exact: true }).fill('0771234567');
    await page.getByLabel('Recipient name').fill('Amaya Perera');
    await page.getByLabel('Delivery phone').fill('0771234567');
    await page.getByLabel('Address', { exact: true }).fill('42 Galle Road');
    await page.getByLabel('City').fill('Colombo');
    await page.getByRole('button', { name: /place order/i }).click();
    await expect(page).toHaveURL(/\/order\/NL-/);
    await expect(page.getByText(/discount/i).first()).toBeVisible();

    // Staff see the usage against the promotion they created.
    await page.goto('/admin/promotions');
    const row = page.getByRole('row').filter({ hasText: code });
    await expect(row).toContainText('1');
  });

  test('a disabled code is refused at checkout', async ({ page }) => {
    const code = uniqueCode('OFF');
    await staffSignIn(page);
    await createPercentagePromotion(page, code);

    const row = page.getByRole('row').filter({ hasText: code });
    await row.getByRole('button', { name: 'Turn off' }).click();
    await expect(row.getByRole('button', { name: 'Turn on' })).toBeVisible();

    await addToBag(page);
    await page.goto('/checkout');

    const summary = page.getByRole('complementary', { name: 'Order summary' });
    await summary.getByLabel('Promotion code').fill(code);
    await summary.getByRole('button', { name: /^apply$/i }).click();

    await expect(summary.getByRole('alert')).toBeVisible();
    await expect(summary.getByText('Discount')).toHaveCount(0);
  });

  test('an unknown code is refused without revealing anything', async ({
    page,
  }) => {
    await addToBag(page);
    await page.goto('/checkout');

    const summary = page.getByRole('complementary', { name: 'Order summary' });
    await summary.getByLabel('Promotion code').fill('NOT-A-REAL-CODE');
    await summary.getByRole('button', { name: /^apply$/i }).click();

    await expect(summary.getByRole('alert')).toBeVisible();
    await expect(summary.getByText('Discount')).toHaveCount(0);
  });
});
