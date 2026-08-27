import { test, expect } from '@playwright/test';

/**
 * The Routine Finder, end to end.
 *
 * Answers live in the query string, so these tests also cover the property that
 * matters most about that choice: a routine URL is shareable and reproducible.
 */

const COMPLETE =
  '/routine-finder?skin_type=dry&concerns=dryness&sensitivity=high&routine_size=full';

/** The routine list, distinguished from the breadcrumb's <ol>. */
const routineSteps = (page: import('@playwright/test').Page) =>
  page.getByRole('list', { name: 'Your routine, in order' }).locator('> li');

test.describe('routine finder', () => {
  test('answering every question produces an ordered routine', async ({
    page,
  }) => {
    await page.goto('/routine-finder');

    // Question 1: single choice advances on selection.
    await expect(page.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '1',
    );
    await page.getByRole('link', { name: /^Dry/ }).click();

    // Question 2: multi-select needs an explicit continue.
    await expect(page.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '2',
    );
    await page.getByRole('link', { name: /Dryness/ }).click();
    await expect(page).toHaveURL(/concerns=dryness/);
    await page.getByRole('link', { name: 'Continue' }).click();

    // Question 3.
    await expect(page.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '3',
    );
    await page.getByRole('link', { name: /Often/ }).click();

    // Question 4.
    await expect(page.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '4',
    );
    await page.getByRole('link', { name: /The full ritual/ }).click();

    // The result: steps in routine order, each with a product.
    await expect(
      page.getByRole('heading', { level: 1, name: /suggest/i }),
    ).toBeVisible();
    const steps = routineSteps(page);
    await expect(steps.first()).toBeVisible();
    expect(await steps.count()).toBeGreaterThanOrEqual(3);
  });

  test('a multi-select cannot be continued while empty', async ({ page }) => {
    await page.goto('/routine-finder?skin_type=dry');

    // Nothing chosen yet, so there is no Continue link to follow.
    await expect(page.getByRole('link', { name: 'Continue' })).toHaveCount(0);
    await expect(page.getByText(/choose at least one/i)).toBeVisible();
  });

  test('the same answers always give the same routine', async ({ page }) => {
    await page.goto(COMPLETE);
    const first = await routineSteps(page).allInnerTexts();

    await page.reload();
    const second = await routineSteps(page).allInnerTexts();

    // Determinism matters: a routine that changed on refresh would look broken.
    expect(second).toEqual(first);
  });

  test('invented answer values are ignored rather than trusted', async ({
    page,
  }) => {
    // Values no question offers must not reach the rule engine.
    const response = await page.goto(
      '/routine-finder?skin_type=not-a-skin-type&concerns=made-up',
    );
    expect(response?.status()).toBe(200);

    // Falls back to the first unanswered question rather than a broken result.
    await expect(page.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '1',
    );
  });

  test('back returns to the previous question with choices intact', async ({
    page,
  }) => {
    // Question 3, having confirmed the multi-select on question 2.
    await page.goto(
      '/routine-finder?skin_type=dry&concerns=dryness&confirmed=concerns',
    );
    await expect(page.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '3',
    );

    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '2',
    );

    // Going back to a multi-select must not wipe what was already ticked.
    await expect(
      page.getByRole('link', { name: /Dryness \(selected\)/ }),
    ).toBeVisible();
  });

  test('a multi-select keeps the question open so a second option can be added', async ({
    page,
  }) => {
    // The defect this covers: advancing on the first tick made a second concern
    // impossible to choose.
    await page.goto('/routine-finder?skin_type=dry');

    await page.getByRole('link', { name: /Dryness/ }).click();
    // Wait on the URL, not the progress bar: this question is number 2 both
    // before and after the click, so the bar is no barrier and the next click
    // would otherwise race the first navigation.
    await expect(page).toHaveURL(/concerns=dryness/);

    await page.getByRole('link', { name: /^Barrier support/ }).click();
    await expect(page).toHaveURL(/concerns=barrier/);
    // Both are now selected, which is only possible because the question stayed.
    await expect(
      page.getByRole('link', { name: /Dryness \(selected\)/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Barrier support \(selected\)/ }),
    ).toBeVisible();
  });

  test('saving a routine returns a shareable code that replays it', async ({
    page,
  }) => {
    await page.goto(COMPLETE);

    const before = await routineSteps(page).allInnerTexts();

    await page.getByRole('button', { name: /save routine/i }).click();

    const status = page.getByRole('status');
    await expect(status).toBeVisible();
    await expect(status).toContainText(/[2-9A-Z]{8}/);

    // Follow the saved link; the steps must be the ones that were saved.
    await status.getByRole('link').click();
    await expect(page).toHaveURL(/\/routine-finder\/[2-9A-Z]{8}/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const after = await routineSteps(page).allInnerTexts();
    expect(after).toEqual(before);
  });

  test('an unknown routine code 404s', async ({ page }) => {
    const response = await page.goto('/routine-finder/ZZZZZZZZ');
    expect(response?.status()).toBe(404);
  });

  test('a malformed routine code 404s without querying', async ({ page }) => {
    const response = await page.goto('/routine-finder/nope');
    expect(response?.status()).toBe(404);
  });
});
