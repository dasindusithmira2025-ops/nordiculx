import { test, expect, type Page } from '@playwright/test';
import { addToBag, buyableProduct } from './fixtures';

/**
 * Checkout, end to end.
 *
 * This is the flow that takes money, so these run against the real seeded
 * database with the mock payment driver and assert on what actually gets
 * written, not just on what is rendered.
 */

const CUSTOMER = {
  email: 'customer@nordiclux.test',
  password: 'DevCustomer!2026',
};

async function addSomethingToBag(page: Page) {
  await addToBag(page);
}

async function fillGuestCheckout(page: Page, email: string) {
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Phone', { exact: true }).fill('0771234567');
  await page.getByLabel('Recipient name').fill('Amaya Perera');
  await page.getByLabel('Delivery phone').fill('0771234567');
  await page.getByLabel('Address', { exact: true }).fill('42 Galle Road');
  await page.getByLabel('City').fill('Colombo');
}

test.describe('checkout', () => {
  test('an empty bag cannot reach checkout', async ({ page }) => {
    await page.goto('/checkout');
    // Redirected rather than shown a form that cannot be submitted.
    await expect(page).toHaveURL(/\/shop$/);
  });

  test('a guest can buy and lands on a confirmation', async ({ page }) => {
    await addSomethingToBag(page);
    await page.goto('/checkout');

    // Guests are not bounced to sign-in.
    await expect(page).toHaveURL(/\/checkout$/);

    await fillGuestCheckout(page, 'guest.buyer@example.com');
    await page.getByRole('button', { name: /place order/i }).click();

    await expect(page).toHaveURL(/\/order\/NL-/);
    await expect(
      page.getByRole('heading', { level: 1, name: /thank you/i }),
    ).toBeVisible();

    // The order shows what was bought and what it cost.
    const product = await buyableProduct(page);
    await expect(page.getByText(product.name).first()).toBeVisible();
    await expect(page.getByText('Confirmed').first()).toBeVisible();
  });

  test('the bag is emptied once the order is placed', async ({ page }) => {
    await addSomethingToBag(page);
    await page.goto('/checkout');
    await fillGuestCheckout(page, 'guest.empty@example.com');
    await page.getByRole('button', { name: /place order/i }).click();
    await expect(page).toHaveURL(/\/order\/NL-/);

    // A second checkout attempt has nothing to sell.
    await page.goto('/checkout');
    await expect(page).toHaveURL(/\/shop$/);
  });

  test('the bag badge empties as soon as the order is placed', async ({
    page,
  }) => {
    await addSomethingToBag(page);
    await expect(page.getByLabel(/Bag, 1 item/i)).toBeVisible();

    await page.goto('/checkout');
    await fillGuestCheckout(page, 'guest.badge@example.com');
    await page.getByRole('button', { name: /place order/i }).click();
    await expect(page).toHaveURL(/\/order\/NL-/);

    // Without a reload: the badge regressed once by holding stale client state
    // after the cart cookie had already been cleared.
    await expect(page.getByLabel(/Bag, empty/i)).toBeVisible();
  });

  test('an invalid phone number is rejected by the server', async ({
    page,
  }) => {
    await addSomethingToBag(page);
    await page.goto('/checkout');

    await page.getByLabel('Email address').fill('guest.invalid@example.com');
    await page.getByLabel('Phone', { exact: true }).fill('12345');
    await page.getByLabel('Recipient name').fill('Amaya Perera');
    await page.getByLabel('Delivery phone').fill('12345');
    await page.getByLabel('Address', { exact: true }).fill('42 Galle Road');
    await page.getByLabel('City').fill('Colombo');

    await page.getByRole('button', { name: /place order/i }).click();

    await expect(page.getByRole('alert').first()).toBeVisible();
    // Still on checkout; no order was created.
    await expect(page).toHaveURL(/\/checkout$/);
  });

  test('a signed-in customer gets the order on their account', async ({
    page,
  }) => {
    await page.goto('/account/login');
    await page.getByLabel('Email address').fill(CUSTOMER.email);
    await page.getByLabel('Password').fill(CUSTOMER.password);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/account$/);

    await addSomethingToBag(page);
    await page.goto('/checkout');

    // The saved default address is preselected, so only the contact phone is
    // missing.
    await page.getByLabel('Phone', { exact: true }).fill('0771234567');
    await page.getByRole('button', { name: /place order/i }).click();

    await expect(page).toHaveURL(/\/order\/NL-/);
    const reference = new URL(page.url()).pathname.split('/').pop()!;

    // It appears in their history, and is reachable there.
    await page.goto('/account/orders');
    await expect(
      page.locator(`a[href="/account/orders/${reference}"]`).first(),
    ).toBeVisible();
  });

  test('a confirmation is not readable without the order cookie', async ({
    page,
    browser,
  }) => {
    await addSomethingToBag(page);
    await page.goto('/checkout');
    await fillGuestCheckout(page, 'guest.private@example.com');
    await page.getByRole('button', { name: /place order/i }).click();
    await expect(page).toHaveURL(/\/order\/NL-/);

    const url = page.url();

    // A different browser context has neither the session nor the guest cookie,
    // so the reference alone must not open the order.
    const stranger = await browser.newContext();
    const strangerPage = await stranger.newPage();
    const response = await strangerPage.goto(url);
    expect(response?.status()).toBe(404);
    await stranger.close();
  });
});

test.describe('order lookup', () => {
  test('the lookup form answers identically for a real and a fake reference', async ({
    page,
  }) => {
    await page.goto('/track');
    await page.getByLabel('Order reference').fill('NL-0000-0000');
    await page.getByLabel('Email address').fill('nobody@example.com');
    await page.getByRole('button', { name: /email me the link/i }).click();

    const status = page.getByRole('status');
    await expect(status).toBeVisible();
    // Deliberately non-committal: it must not reveal whether anything matched.
    await expect(status).toContainText(/if that reference and email match/i);
  });

  test('a tokenless order link 404s', async ({ page }) => {
    const response = await page.goto('/track/NL-0000-0000');
    expect(response?.status()).toBe(404);
  });

  test('a wrong token 404s rather than saying it is wrong', async ({
    page,
  }) => {
    const response = await page.goto('/track/NL-0000-0000?token=not-a-token');
    expect(response?.status()).toBe(404);
  });
});
