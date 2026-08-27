import { test, expect, type Page } from '@playwright/test';

/**
 * Returns: request, review, progress.
 *
 * Each project signs in as a different seeded customer, because a return
 * consumes the quantity it is raised against — two projects sharing one
 * delivered order would make the second run find nothing left to return.
 */

const OWNER = { email: 'owner@nordiclux.test', password: 'DevOwner!2026' };

function customerFor() {
  return test.info().project.name === 'mobile'
    ? { email: 'ishara@nordiclux.test', password: 'DevCustomer!2026' }
    : { email: 'nuwan@nordiclux.test', password: 'DevCustomer!2026' };
}

async function customerSignIn(page: Page) {
  const customer = customerFor();
  await page.goto('/account/login');
  await page.getByLabel('Email address').fill(customer.email);
  await page.getByLabel('Password').fill(customer.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/account$/);
}

/** This customer's delivered order — the only one a return can be raised on. */
async function deliveredOrder(page: Page) {
  await page.goto('/account/orders');
  const row = page
    .getByRole('listitem')
    .filter({ hasText: /delivered/i })
    .first();
  await expect(row).toBeVisible();
  // Rows also carry product thumbnails that link to the PDP, so the order
  // link is selected by its href rather than by position.
  await row.locator('a[href^="/account/orders/NL-"]').first().click();
  await expect(page).toHaveURL(/\/account\/orders\/NL-/);
  return new URL(page.url()).pathname.split('/').pop()!;
}

// One return per delivered order, so these run in order rather than racing.
test.describe.configure({ mode: 'serial' });

test.describe('returns', () => {
  test('an undelivered order offers no return', async ({ page }) => {
    await customerSignIn(page);
    await page.goto('/account/orders');

    const open = page
      .getByRole('listitem')
      // The rendered labels, not the enum values: 'preparing' shows as
      // 'Being prepared'.
      .filter({ hasText: /being prepared|confirmed|dispatched/i })
      .first();
    await expect(open).toBeVisible();
    await open.locator('a[href^="/account/orders/NL-"]').first().click();

    await expect(
      page.getByText(/returns open once your order has been delivered/i),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /request a return/i }),
    ).toHaveCount(0);
  });

  test('another customer cannot open this order at all', async ({
    page,
    browser,
  }) => {
    await customerSignIn(page);
    const reference = await deliveredOrder(page);

    // A separate context rather than a sign-out: a second session is what an
    // attacker actually has, and it cannot inherit anything from the first.
    const stranger = await browser.newContext();
    const strangerPage = await stranger.newPage();
    await strangerPage.goto('/account/login');
    await strangerPage
      .getByLabel('Email address')
      .fill('customer@nordiclux.test');
    await strangerPage.getByLabel('Password').fill('DevCustomer!2026');
    await strangerPage.getByRole('button', { name: /^sign in$/i }).click();
    await expect(strangerPage).toHaveURL(/\/account$/);

    // A 404, not a 403: a 403 would confirm the reference exists.
    const response = await strangerPage.goto(`/account/orders/${reference}`);
    expect(response?.status()).toBe(404);
    await stranger.close();
  });

  test('a delivered order can be returned and progressed by staff', async ({
    page,
  }) => {
    await customerSignIn(page);
    const reference = await deliveredOrder(page);

    await page.getByRole('button', { name: /request a return/i }).click();

    const form = page
      .locator('form')
      .filter({ hasText: /reason/i })
      .first();
    await form.locator('input[type="number"]').first().fill('1');
    await form.getByLabel('Reason').selectOption('Item is faulty');
    await form.getByLabel(/anything else/i).fill('The pump does not prime.');
    await form.getByRole('button', { name: /submit return request/i }).click();

    const confirmation = page.getByRole('status');
    await expect(confirmation).toContainText(/NLR-/);
    const returnRef = (await confirmation.innerText()).match(
      /NLR-[2-9A-Z]{4}-[2-9A-Z]{4}/,
    )![0];

    // Staff see it, and can move it along its workflow.
    await page.goto('/admin/login');
    await page.getByLabel('Email address').fill(OWNER.email);
    await page.getByLabel('Password').fill(OWNER.password);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/admin(\?|$)/);

    await page.goto('/admin/returns');
    const queued = page.getByRole('listitem').filter({ hasText: returnRef });
    await expect(queued).toBeVisible();
    await expect(queued).toContainText('Item is faulty');
    await expect(queued).toContainText(reference);

    await queued.getByLabel('Move to').selectOption('approved');
    await queued.getByLabel('Note to customer').fill('Send it back to us.');
    await queued.getByRole('button', { name: /^apply$/i }).click();
    // The row leaves the requested queue once the action lands; navigating
    // before then races the write.
    await expect(queued).toHaveCount(0);

    await page.goto('/admin/returns?status=approved');
    await expect(page.getByText(returnRef)).toBeVisible();

    // The customer sees the new status and the note.
    await page.goto(`/account/orders/${reference}`);
    await expect(page.getByText(returnRef)).toBeVisible();
    await expect(page.getByText('Approved').first()).toBeVisible();
    await expect(page.getByText('Send it back to us.')).toBeVisible();
  });

  test('a return with nothing selected is refused', async ({ page }) => {
    await customerSignIn(page);
    await deliveredOrder(page);

    const trigger = page.getByRole('button', { name: /request a return/i });
    test.skip(
      (await trigger.count()) === 0,
      'the whole order is already on a return',
    );
    await trigger.click();

    const form = page
      .locator('form')
      .filter({ hasText: /reason/i })
      .first();
    await form.getByLabel('Reason').selectOption('Changed my mind');
    await form.getByRole('button', { name: /submit return request/i }).click();

    await expect(form.getByRole('alert')).toContainText(/at least one item/i);
  });
});
