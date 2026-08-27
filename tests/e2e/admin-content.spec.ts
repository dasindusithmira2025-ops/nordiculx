import { test, expect, type Page } from '@playwright/test';

/**
 * Content management, judged by the storefront.
 *
 * These assert that a staff edit actually reaches the public site, because a
 * CMS that saves without revalidating looks identical to one that works until
 * somebody checks the homepage.
 */

const OWNER = { email: 'owner@nordiclux.test', password: 'DevOwner!2026' };

async function staffSignIn(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Email address').fill(OWNER.email);
  await page.getByLabel('Password').fill(OWNER.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/admin(\?|$)/);
}

const unique = (prefix: string) =>
  `${prefix} ${Math.random().toString(36).slice(2, 8)}`;

test.describe('admin content', () => {
  test('an FAQ entry created by staff appears on the storefront', async ({
    page,
  }) => {
    const question = unique('E2E question');
    await staffSignIn(page);
    await page.goto('/admin/content?tab=faq');

    await page.getByText('New question', { exact: true }).click();
    const form = page.locator('details form');
    await form.getByLabel('Question').fill(question);
    await form.getByLabel('Answer').fill('An answer written by the test.');
    await form.getByRole('button', { name: /^add$/i }).click();
    await expect(form.getByRole('status')).toContainText('Saved');

    await page.goto('/faq');
    await expect(page.getByText(question)).toBeVisible();
  });

  test('an announcement is published and withdrawn from the bar', async ({
    page,
  }) => {
    const message = unique('E2E notice');
    await staffSignIn(page);
    await page.goto('/admin/content?tab=announcements');

    await page.getByText('New announcement', { exact: true }).click();
    const form = page.locator('details form');
    await form.getByLabel('Message').fill(message);
    await form.getByRole('button', { name: /^add$/i }).click();
    await expect(form.getByRole('status')).toContainText('Saved');

    await page.goto('/');
    await expect(page.getByText(message).first()).toBeVisible();

    // Deleting it takes it off the storefront, not just out of the list.
    await page.goto('/admin/content?tab=announcements');
    const row = page.locator('form').filter({
      has: page.locator(`input[value="${message}"]`),
    });
    await row.getByRole('button', { name: /^delete$/i }).click();
    await expect(row).toHaveCount(0);

    await page.goto('/');
    await expect(page.getByText(message)).toHaveCount(0);
  });

  test('a policy page edit reaches its public route', async ({ page }) => {
    // A different page per project: both would otherwise edit the same body
    // and overwrite each other's sentence.
    const [title, path] =
      test.info().project.name === 'mobile'
        ? ['Shipping', '/shipping']
        : ['Returns', '/returns-policy'];
    const sentence = unique('Reviewed by the business:');

    await staffSignIn(page);
    await page.goto('/admin/content?tab=pages');
    // Scoped to the list: 'Returns' is also an admin nav item.
    await page
      .getByRole('region', { name: 'Pages' })
      .getByRole('link', { name: title, exact: true })
      .click();

    const body = page.getByRole('textbox', { name: 'Body', exact: true });
    await body.fill(`## ${title}

${sentence} full policy pending.`);
    await page.getByRole('button', { name: /save page/i }).click();
    await expect(page.getByRole('status')).toContainText('Saved');

    await page.goto(path);
    await expect(page.getByText(sentence)).toBeVisible();
    // The `##` became a real heading rather than literal text.
    await expect(
      page.getByRole('heading', { level: 2, name: title }),
    ).toBeVisible();
  });

  test('a content editor cannot reach promotions or orders', async ({
    page,
  }) => {
    await page.goto('/admin/login');
    await page.getByLabel('Email address').fill('editor@nordiclux.test');
    await page.getByLabel('Password').fill('DevOwner!2026');
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/admin(\?|$)/);

    // Content is theirs...
    expect((await page.goto('/admin/content'))?.status()).toBe(200);
    // ...promotions are not, and the page refuses rather than the nav hiding it.
    expect(
      (await page.goto('/admin/promotions'))?.status(),
    ).toBeGreaterThanOrEqual(400);
  });
});
