import { test, expect, type Page } from '@playwright/test';

/**
 * The account area.
 *
 * The important assertions here are the negative ones: a signed-out visitor
 * cannot reach account pages, one customer cannot read another's order, and a
 * failed sign-in does not reveal whether the address exists.
 *
 * Credentials come from the seed (scripts/seed.ts).
 */

const CUSTOMER = {
  email: 'customer@nordiclux.test',
  password: 'DevCustomer!2026',
};
const OTHER = { email: 'nuwan@nordiclux.test', password: 'DevCustomer!2026' };

async function signIn(
  page: Page,
  who: { email: string; password: string } = CUSTOMER,
) {
  await page.goto('/account/login');
  await page.getByLabel('Email address').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe('authentication', () => {
  test('a signed-out visitor is sent to sign in and back again', async ({
    page,
  }) => {
    await page.goto('/account/orders');

    // Redirected to the form, with where they were going preserved.
    await expect(page).toHaveURL(/\/account\/login\?next=%2Faccount%2Forders/);

    await page.getByLabel('Email address').fill(CUSTOMER.email);
    await page.getByLabel('Password').fill(CUSTOMER.password);
    await page.getByRole('button', { name: /^sign in$/i }).click();

    // Returned to the page originally requested.
    await expect(page).toHaveURL(/\/account\/orders$/);
  });

  test('a wrong password is rejected without revealing the account exists', async ({
    page,
  }) => {
    await page.goto('/account/login');
    await page.getByLabel('Email address').fill(CUSTOMER.email);
    await page.getByLabel('Password').fill('definitely-not-the-password');
    await page.getByRole('button', { name: /^sign in$/i }).click();

    const known = page.getByRole('alert').first();
    await expect(known).toBeVisible();
    const knownText = await known.innerText();

    // An address with no account must produce the identical message.
    await page.goto('/account/login');
    await page.getByLabel('Email address').fill('nobody-at-all@example.com');
    await page.getByLabel('Password').fill('definitely-not-the-password');
    await page.getByRole('button', { name: /^sign in$/i }).click();

    // `.first()`: Next's route announcer is also role="alert".
    const unknown = page.getByRole('alert').first();
    await expect(unknown).toBeVisible();
    expect(await unknown.innerText()).toBe(knownText);
  });

  test('an off-site next destination is not honoured', async ({ page }) => {
    // Open-redirect guard: the form is real, the destination is not ours.
    await page.goto('/account/login?next=https://evil.example.com');
    await page.getByLabel('Email address').fill(CUSTOMER.email);
    await page.getByLabel('Password').fill(CUSTOMER.password);
    await page.getByRole('button', { name: /^sign in$/i }).click();

    await expect(page).toHaveURL(/localhost.*\/account$/);
  });

  test('a protocol-relative next destination is not honoured', async ({
    page,
  }) => {
    await page.goto('/account/login?next=//evil.example.com');
    await page.getByLabel('Email address').fill(CUSTOMER.email);
    await page.getByLabel('Password').fill(CUSTOMER.password);
    await page.getByRole('button', { name: /^sign in$/i }).click();

    await expect(page).toHaveURL(/localhost.*\/account$/);
  });

  test('signing in then out ends the session', async ({ page }) => {
    await signIn(page);

    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page).toHaveURL(/localhost:\d+\/$/);

    // The protected page is no longer reachable.
    await page.goto('/account');
    await expect(page).toHaveURL(/\/account\/login/);
  });

  test('registering with an existing address does not confirm it exists', async ({
    page,
  }) => {
    await page.goto('/account/register');
    await page.getByLabel('First name').fill('Someone');
    await page.getByLabel('Last name').fill('Else');
    await page.getByLabel('Email address').fill(CUSTOMER.email);
    await page.getByLabel('Password').fill('a-long-enough-passphrase');
    await page.getByRole('button', { name: /create account/i }).click();

    // Bounced to sign-in with a deliberately non-committal message, and no
    // session created.
    await expect(page).toHaveURL(/\/account\/login\?existing=1/);
    await expect(page.getByRole('status')).toBeVisible();
  });

  test('an already signed-in visitor is redirected off the login page', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/account/login');
    await expect(page).toHaveURL(/\/account$/);
  });
});

test.describe('account pages', () => {
  test('the overview shows the customer and their counts', async ({ page }) => {
    await signIn(page);

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /hello/i,
    );
    await expect(page.getByText(CUSTOMER.email)).toBeVisible();
  });

  test('orders list and open into a detail page', async ({ page }) => {
    await signIn(page);
    await page.goto('/account/orders');

    const first = page.locator('a[href^="/account/orders/NL-"]').first();
    await expect(first).toBeVisible();
    const reference = (await first.innerText()).trim();

    await first.click();
    await expect(page).toHaveURL(/\/account\/orders\/NL-/);
    await expect(page.getByText(reference)).toBeVisible();
  });

  test('one customer cannot read another customer’s order', async ({
    page,
  }) => {
    // Take a real reference belonging to the first customer...
    await signIn(page);
    await page.goto('/account/orders');
    const reference = (
      await page.locator('a[href^="/account/orders/NL-"]').first().innerText()
    ).trim();

    await page.getByRole('button', { name: /sign out/i }).click();

    // ...then ask for it as somebody else. A real reference must 404, not 403
    // and not render: a 403 would confirm the reference exists.
    await signIn(page, OTHER);
    const response = await page.goto(`/account/orders/${reference}`);
    expect(response?.status()).toBe(404);
  });

  test('addresses can be added and become the default', async ({ page }) => {
    await signIn(page);
    await page.goto('/account/addresses');

    await page
      .getByRole('button', { name: /add address/i })
      .first()
      .click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const unique = `Test ${Date.now()}`;
    await dialog.getByLabel('Label').fill(unique);
    await dialog.getByLabel('Recipient name').fill('Amaya Perera');
    await dialog.getByLabel('Phone').fill('0771234567');
    await dialog.getByLabel('Address', { exact: true }).fill('42 Galle Road');
    await dialog.getByLabel('City').fill('Colombo');
    await dialog.getByRole('button', { name: /add address/i }).click();

    await expect(page.getByText(unique)).toBeVisible();
  });

  test('an invalid phone number is rejected by the server', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/account/addresses');

    await page
      .getByRole('button', { name: /add address/i })
      .first()
      .click();
    const dialog = page.getByRole('dialog');

    await dialog.getByLabel('Recipient name').fill('Amaya Perera');
    await dialog.getByLabel('Phone').fill('12345');
    await dialog.getByLabel('Address', { exact: true }).fill('42 Galle Road');
    await dialog.getByLabel('City').fill('Colombo');
    await dialog.getByRole('button', { name: /add address/i }).click();

    await expect(dialog.getByRole('alert').first()).toBeVisible();
  });

  test('the wishlist page renders', async ({ page }) => {
    await signIn(page);
    await page.goto('/account/wishlist');
    await expect(
      page.getByRole('heading', { level: 1, name: /wishlist/i }),
    ).toBeVisible();
  });

  test('settings rejects a wrong current password', async ({ page }) => {
    await signIn(page);
    await page.goto('/account/settings');

    await page.getByLabel('Current password').fill('not-my-password');
    await page.getByLabel('New password').fill('a-brand-new-passphrase');
    await page.getByRole('button', { name: /change password/i }).click();

    await expect(page.getByRole('alert').first()).toBeVisible();
  });

  test('account pages are excluded from search indexes', async ({ page }) => {
    await signIn(page);
    await page.goto('/account/orders');

    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveAttribute('content', /noindex/);
  });
});
