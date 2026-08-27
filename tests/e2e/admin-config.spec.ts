import { test, expect, type Page } from '@playwright/test';

/**
 * Campaigns, Routine Finder and Staff.
 *
 * These three admin surfaces exist to stop staff needing an engineer, so what
 * matters is that a change made here reaches the storefront, and that the
 * guards which protect the quiz from an unusable state actually hold.
 */

const OWNER = { email: 'owner@nordiclux.test', password: 'DevOwner!2026' };

async function staffSignIn(page: Page, who = OWNER) {
  await page.goto('/admin/login');
  await page.getByLabel('Email address').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/admin(\?|$)/);
}

const unique = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

test.describe('admin campaigns', () => {
  test('a campaign is created, published and reachable', async ({ page }) => {
    const slug = unique('e2e-campaign');
    await staffSignIn(page);

    await page.goto('/admin/campaigns/new');
    await page
      .getByRole('textbox', { name: 'Title', exact: true })
      .fill('E2E campaign');
    await page.getByRole('textbox', { name: 'URL', exact: true }).fill(slug);
    await page
      .getByRole('combobox', { name: 'Status', exact: true })
      .selectOption('published');
    await page
      .getByRole('textbox', { name: 'Body', exact: true })
      .fill('## Hello\n\nA campaign body.');
    await page.getByRole('button', { name: /create campaign/i }).click();

    await expect(page).toHaveURL(/\/admin\/campaigns$/);
    const row = page.getByRole('row').filter({ hasText: slug });
    await expect(row).toContainText('live');

    // Live on the storefront, with the text body rendered as real blocks.
    const live = await page.goto(`/campaigns/${slug}`);
    expect(live?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { level: 2, name: 'Hello' }),
    ).toBeVisible();

    // Ending it takes it off the site rather than deleting the record.
    await page.goto('/admin/campaigns');
    await page
      .getByRole('row')
      .filter({ hasText: slug })
      .getByRole('button', { name: /end now/i })
      .click();
    await expect(page.getByRole('row').filter({ hasText: slug })).toContainText(
      'ended',
    );

    expect((await page.goto(`/campaigns/${slug}`))?.status()).toBe(404);
  });

  test('two campaigns cannot share a URL', async ({ page }) => {
    await staffSignIn(page);
    await page.goto('/admin/campaigns');

    const existing = await page
      .locator('td')
      .filter({ hasText: '/campaigns/' })
      .first()
      .innerText();
    const slug = existing.replace('/campaigns/', '').trim();

    await page.goto('/admin/campaigns/new');
    await page
      .getByRole('textbox', { name: 'Title', exact: true })
      .fill('Clashing campaign');
    await page.getByRole('textbox', { name: 'URL', exact: true }).fill(slug);
    await page.getByRole('button', { name: /create campaign/i }).click();

    // `.first()`: Next's route announcer is also role="alert".
    await expect(page.getByRole('alert').first()).toContainText(
      /already taken/i,
    );
  });
});

test.describe('admin routine finder', () => {
  test('a reworded question shows on the quiz', async ({ page }) => {
    const prompt = `How does your skin behave? ${Date.now()}`;
    await staffSignIn(page);
    await page.goto('/admin/routine-finder');

    // Scoped to the questions section: the first `form` on the page is the
    // sign-out form in the admin sidebar.
    const first = page
      .getByRole('region', { name: 'Questions' })
      .locator('form')
      .first();
    await first.getByRole('textbox', { name: 'Question' }).fill(prompt);
    await first.getByRole('button', { name: /^save$/i }).click();
    await expect(first.getByRole('status')).toContainText('Saved');

    await page.goto('/routine-finder');
    await expect(page.getByText(prompt)).toBeVisible();
  });

  test('a rule naming an answer that does not exist is refused', async ({
    page,
  }) => {
    await staffSignIn(page);
    await page.goto('/admin/routine-finder?tab=rules');

    await page.getByText('New rule', { exact: true }).click();
    const form = page.locator('details form');
    await form
      .getByRole('textbox', { name: 'Rule name' })
      .fill('E2E invalid rule');
    await form
      .getByRole('combobox', { name: 'Product' })
      .selectOption({ index: 1 });
    await form
      .getByRole('textbox', { name: 'Conditions' })
      .fill('{"answers":{"skin_type":["definitely-not-a-value"]}}');
    await form.getByRole('button', { name: /^add$/i }).click();

    await expect(form.getByRole('alert')).toContainText(/no answer/i);
  });

  test('malformed conditions are refused rather than stored', async ({
    page,
  }) => {
    await staffSignIn(page);
    await page.goto('/admin/routine-finder?tab=rules');

    await page.getByText('New rule', { exact: true }).click();
    const form = page.locator('details form');
    await form
      .getByRole('textbox', { name: 'Rule name' })
      .fill('E2E broken rule');
    await form
      .getByRole('combobox', { name: 'Product' })
      .selectOption({ index: 1 });
    await form
      .getByRole('textbox', { name: 'Conditions' })
      .fill('not json at all');
    await form.getByRole('button', { name: /^add$/i }).click();

    await expect(form.getByRole('alert')).toContainText(/valid JSON/i);
  });
});

test.describe('admin staff', () => {
  test('the owner sees roles and truthful MFA status', async ({ page }) => {
    await staffSignIn(page);
    await page.goto('/admin/staff');

    await expect(page.getByRole('table')).toBeVisible();
    // Scoped to the page body: the signed-in email is also in the sidebar.
    const main = page.locator('#main');
    await expect(main.getByText(OWNER.email)).toBeVisible();
    await expect(
      main.getByRole('cell', { name: 'Owner', exact: true }),
    ).toBeVisible();
    // Enrolment is not built, so the page must say so rather than imply it is.
    await expect(
      main.getByText(/required, not enrolled/i).first(),
    ).toBeVisible();
  });

  test('a non-owner cannot reach staff management', async ({ page }) => {
    await staffSignIn(page, {
      email: 'support@nordiclux.test',
      password: 'DevOwner!2026',
    });

    const response = await page.goto('/admin/staff');
    expect(response?.status()).toBeGreaterThanOrEqual(400);
  });
});
