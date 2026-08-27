import { test, expect, type Page } from '@playwright/test';

/**
 * Reviews, end to end: eligibility, submission, moderation, publication.
 *
 * The seeded customer has a delivered order, which is the only thing that
 * makes a review possible — so the fixture is that order, not a product slug.
 */

const OWNER = { email: 'owner@nordiclux.test', password: 'DevOwner!2026' };

/**
 * A review is unique per (product, customer), so the desktop and mobile
 * projects sign in as different seeded customers — each has a delivered order
 * on a product of their own and cannot overwrite the other's row.
 */
function customerFor() {
  const email =
    test.info().project.name === 'mobile'
      ? 'nuwan@nordiclux.test'
      : 'customer@nordiclux.test';
  return { email, password: 'DevCustomer!2026' };
}

// The submission, the moderation and the tamper check all act on that one
// review row, so they run in order rather than racing each other for it.
test.describe.configure({ mode: 'serial' });

async function customerSignIn(page: Page) {
  const customer = customerFor();
  await page.goto('/account/login');
  await page.getByLabel('Email address').fill(customer.email);
  await page.getByLabel('Password').fill(customer.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/account$/);
}

/** The product on this customer's delivered order — the only reviewable one. */
async function deliveredProduct(page: Page) {
  await page.goto('/account/orders');
  const delivered = page
    .getByRole('listitem')
    .filter({ hasText: /delivered/i })
    .first();
  await expect(delivered).toBeVisible();
  await delivered.locator('a[href^="/account/orders/NL-"]').first().click();

  const productLink = page.locator('a[href^="/product/"]').first();
  await expect(productLink).toBeVisible();
  const href = await productLink.getAttribute('href');
  return href!;
}

test.describe('reviews', () => {
  test('a signed-out visitor is invited to sign in, not to write', async ({
    page,
  }) => {
    await page.goto('/shop?stock=1');
    await page.getByRole('article').first().locator('a').first().click();
    await expect(page).toHaveURL(/\/product\//);

    await expect(
      page.getByRole('button', { name: /submit review/i }),
    ).toHaveCount(0);
    await expect(page.getByText(/sign in.*to review/i)).toBeVisible();
  });

  test('a customer who never bought it cannot review it', async ({ page }) => {
    await customerSignIn(page);
    const bought = await deliveredProduct(page);

    // Any other product in the catalogue: signed in, but no delivered order
    // for this one, so there is nothing to write with.
    await page.goto('/shop?stock=1');
    const other = await page
      .locator('a[href^="/product/"]')
      .evaluateAll(
        (links, exclude) =>
          links
            .map((l) => l.getAttribute('href'))
            .find((href) => href && href !== exclude) ?? null,
        bought,
      );

    expect(other).toBeTruthy();
    await page.goto(other!);
    await expect(
      page.getByRole('button', { name: /submit review/i }),
    ).toHaveCount(0);
    await expect(page.getByText(/sign in.*to review/i)).toHaveCount(0);
  });

  test('a delivered purchase can be reviewed, moderated and published', async ({
    page,
  }) => {
    await customerSignIn(page);
    const href = await deliveredProduct(page);
    await page.goto(href);

    const body = `Genuinely useful in the humidity. ${Date.now()}`;
    // Clicking the star label is the real interaction; the radio itself is
    // sr-only and sits underneath it.
    await page.getByTitle('4 out of 5').click();
    await page.getByLabel('Your review').fill(body);
    await page.getByRole('button', { name: /submit review/i }).click();

    await expect(page.getByRole('status')).toContainText(/moderation/i);

    // Unmoderated, so it is not on the page yet.
    await page.reload();
    await expect(page.getByText(body)).toHaveCount(1); // only inside the form
    await expect(page.getByText('Waiting for moderation')).toBeVisible();

    // Staff publish it.
    await page.goto('/admin/login');
    await page.getByLabel('Email address').fill(OWNER.email);
    await page.getByLabel('Password').fill(OWNER.password);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    // Wait for the staff session to land: navigating straight away races the
    // cookie and bounces back to the login screen.
    await expect(page).toHaveURL(/\/admin(\?|$)/);
    await page.goto('/admin/reviews?status=pending');

    const queued = page.locator('li').filter({ hasText: body }).first();
    await expect(queued).toBeVisible();
    await expect(queued.getByText('Verified purchase')).toBeVisible();
    await queued.getByRole('button', { name: /^publish$/i }).click();

    await page.goto('/admin/reviews?status=approved');
    await expect(page.getByText(body)).toBeVisible();

    // And it is now on the storefront, with the product's rating updated.
    await page.goto(href);
    await expect(page.getByText(body).first()).toBeVisible();
    await expect(page.getByText('No reviews yet')).toHaveCount(0);
  });

  test('a review with no rating is refused by the server', async ({ page }) => {
    await customerSignIn(page);
    const href = await deliveredProduct(page);
    await page.goto(href);

    // No star chosen: the browser cannot enforce that, so the schema has to.
    await page.getByLabel('Your review').fill('A body long enough to pass.');
    await page.getByRole('button', { name: /(submit|update) review/i }).click();

    await expect(page.getByRole('alert').first()).toBeVisible();
  });
});
