import { test, expect, type Page } from '@playwright/test';
import { placeGuestOrder } from './fixtures';

/**
 * The staff area.
 *
 * The assertions that matter are about authorisation: that a customer cannot
 * reach it at all, that a limited role cannot perform actions outside its
 * permissions, and that the storefront session and the staff session stay
 * separate. Everything else here is incidental.
 */

const OWNER = { email: 'owner@nordiclux.test', password: 'DevOwner!2026' };
const SUPPORT = { email: 'support@nordiclux.test', password: 'DevOwner!2026' };
const CUSTOMER = {
  email: 'customer@nordiclux.test',
  password: 'DevCustomer!2026',
};

async function staffSignIn(
  page: Page,
  who: { email: string; password: string },
) {
  await page.goto('/admin/login');
  await page.getByLabel('Email address').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/admin(\?|$)/);
}

test.describe('staff authentication', () => {
  test('the admin is not reachable while signed out', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin/);
  });

  test('a customer account cannot sign in to the admin', async ({ page }) => {
    await page.goto('/admin/login');
    await page.getByLabel('Email address').fill(CUSTOMER.email);
    await page.getByLabel('Password').fill(CUSTOMER.password);
    await page.getByRole('button', { name: /^sign in$/i }).click();

    // Correct credentials, but not staff — and the message must not say which.
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('a customer session does not grant admin access', async ({ page }) => {
    // Sign in on the storefront...
    await page.goto('/account/login');
    await page.getByLabel('Email address').fill(CUSTOMER.email);
    await page.getByLabel('Password').fill(CUSTOMER.password);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/account$/);

    // ...and the staff area is still shut. Separate cookie, separate session.
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('an owner can sign in and out', async ({ page }) => {
    await staffSignIn(page, OWNER);
    await expect(
      page.getByRole('heading', { level: 1, name: /good to see you/i }),
    ).toBeVisible();

    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/admin\/login/);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('an off-admin next destination is not honoured', async ({ page }) => {
    await page.goto('/admin/login?next=https://evil.example.com');
    await page.getByLabel('Email address').fill(OWNER.email);
    await page.getByLabel('Password').fill(OWNER.password);
    await page.getByRole('button', { name: /^sign in$/i }).click();

    await expect(page).toHaveURL(/localhost.*\/admin$/);
  });
});

test.describe('permissions', () => {
  test('an owner sees every section', async ({ page }) => {
    await staffSignIn(page, OWNER);

    const nav = page.getByRole('navigation', { name: 'Admin' });
    for (const label of ['Orders', 'Products', 'Reviews', 'Support']) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible();
    }
  });

  test('a support role is not offered moderation it cannot perform', async ({
    page,
  }) => {
    await staffSignIn(page, SUPPORT);

    const nav = page.getByRole('navigation', { name: 'Admin' });
    await expect(nav.getByRole('link', { name: 'Orders' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Support' })).toBeVisible();
    // `support` does not hold reviews.moderate.
    await expect(nav.getByRole('link', { name: 'Reviews' })).toHaveCount(0);
  });

  test('hiding a link is not the protection — the page refuses too', async ({
    page,
  }) => {
    await staffSignIn(page, SUPPORT);

    // Navigating straight to the URL must not work just because the nav item
    // was hidden. requireStaff() is what actually decides.
    const response = await page.goto('/admin/reviews');
    expect(response?.status()).toBeGreaterThanOrEqual(400);
  });

  test('a role without orders.manage cannot change a status', async ({
    page,
  }) => {
    const reference = await placeGuestOrder(page, 'e2e.readonly@example.com');

    await staffSignIn(page, SUPPORT);
    await page.goto(`/admin/orders/${reference}`);

    // Readable, but the fulfilment control is absent and says why.
    await expect(
      page.getByText(/view orders but not change them/i),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /update status/i }),
    ).toHaveCount(0);
  });
});

test.describe('order fulfilment', () => {
  test('an owner can move an order through a status', async ({ page }) => {
    // The order this test dispatches is the one it just placed, so it never
    // depends on the seed leaving a `confirmed` order lying around.
    const reference = await placeGuestOrder(page, 'e2e.dispatch@example.com');

    await staffSignIn(page, OWNER);
    await page.goto('/admin/orders?status=confirmed');
    await page.locator(`a[href="/admin/orders/${reference}"]`).first().click();

    // Exact: the filter nav is also labelled "Filter by status".
    await page.getByLabel('Status', { exact: true }).selectOption('preparing');
    await page.getByLabel('Note').fill('Picking now');
    await page.getByRole('button', { name: /update status/i }).click();

    // The change lands and appears on the customer-facing timeline.
    await expect(page.getByText('Being prepared').first()).toBeVisible();
    await expect(page.getByText('Picking now')).toBeVisible();
  });

  test('the admin is excluded from search indexes', async ({ page }) => {
    await staffSignIn(page, OWNER);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      /noindex/,
    );
  });
});
