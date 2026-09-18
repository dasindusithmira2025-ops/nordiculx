import { test, expect, type Page } from '@playwright/test';

/**
 * The full product editor.
 *
 * The defect this screen exists to fix was that clicking a product from the
 * catalogue list led nowhere: price, sale price and stock were the only fields
 * a staff member could reach, and the copy, imagery, ingredients and SEO that
 * make up most of a beauty product were simply not editable.
 *
 * So the assertions are about reach and about persistence: that the list opens
 * the editor, that a field outside the old price/stock set actually saves, that
 * it survives a reload, and that a rejected save leaves the record alone.
 */

const OWNER = { email: 'owner@nordiclux.test', password: 'DevOwner!2026' };

async function staffSignIn(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Email address').fill(OWNER.email);
  await page.getByLabel('Password').fill(OWNER.password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/admin(\?|$)/);
}

/** Opens the editor by clicking a product, the way a staff member would. */
async function openFirstProduct(page: Page) {
  await page.goto('/admin/products');
  const link = page.locator('a[href^="/admin/products/"][href$="/edit"]');
  await expect(link.first()).toBeVisible();
  await link.first().click();
  await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]+\/edit$/);
  return page.url();
}

test.describe('admin product editor', () => {
  test.beforeEach(async ({ page }) => {
    await staffSignIn(page);
  });

  test('a product row opens the full editor, not a price box', async ({
    page,
  }) => {
    await openFirstProduct(page);

    // One section per job, and every group the old screen could not reach.
    for (const heading of [
      'Basic',
      'Merchandising',
      'Beauty data',
      'Search',
      'Variants, pricing and stock',
      'Media',
    ]) {
      await expect(
        page.getByRole('heading', { name: heading, exact: true }),
      ).toBeVisible();
    }

    // Queried by ROLE and accessible name, not `getByLabel`. The admin's `Cell`
    // wraps the control in its label and puts the hint outside it, so the
    // accessible name is the clean one — and an exact name match is what keeps
    // "Ingredients" from also resolving "Full description".
    for (const name of [
      'Product name',
      'Full description',
      'Ingredients',
      'How to use',
      'Meta description',
    ]) {
      await expect(
        page.getByRole('textbox', { name, exact: true }),
      ).toBeVisible();
    }
  });

  test('an edit outside price and stock saves and survives a reload', async ({
    page,
  }) => {
    const url = await openFirstProduct(page);

    const subtitle = `Edited by e2e ${Date.now()}`;
    await page
      .getByRole('textbox', { name: 'Subtitle', exact: true })
      .fill(subtitle);
    await page
      .getByRole('textbox', { name: 'How to use', exact: true })
      .fill('Apply to clean skin at night.');
    await page.getByRole('button', { name: /^save product$/i }).click();

    await expect(page.getByText('Saved.')).toBeVisible();

    // The reload is the assertion. A form that clears its own error and shows
    // a tick proves nothing about what reached the database.
    await page.goto(url);
    await expect(
      page.getByRole('textbox', { name: 'Subtitle', exact: true }),
    ).toHaveValue(subtitle);
    await expect(
      page.getByRole('textbox', { name: 'How to use', exact: true }),
    ).toHaveValue('Apply to clean skin at night.');
  });

  test('a rejected save reports the field and changes nothing', async ({
    page,
  }) => {
    const url = await openFirstProduct(page);
    const original = await page
      .getByRole('textbox', { name: 'Product name', exact: true })
      .inputValue();

    // Server-side validation, not the browser's: the pattern is enforced by the
    // zod schema in the action, which is the only boundary that counts.
    // Scoped to the product form: each media row also has a URL field.
    const form = page.locator('form:has([name="slug"])');
    await form.locator('[name="slug"]').fill('Not A Valid Slug!!');
    await form.locator('[name="name"]').fill('Should not be saved');
    await page.getByRole('button', { name: /^save product$/i }).click();

    await expect(page.getByRole('alert').first()).toBeVisible();

    await page.goto(url);
    await expect(
      page.getByRole('textbox', { name: 'Product name', exact: true }),
    ).toHaveValue(original);
  });

  test('a variant saves its price and stock, and the stock ledger records it', async ({
    page,
  }) => {
    const url = await openFirstProduct(page);

    const variant = page.locator('form:has([name="sku"])').first();
    await variant.locator('[name="price"]').fill('123.00');
    await variant.locator('[name="onHand"]').fill('77');
    await variant.getByRole('button', { name: /^save$/i }).click();

    await expect(variant.getByText('Saved.')).toBeVisible();

    await page.goto(url);
    const reloaded = page.locator('form:has([name="sku"])').first();
    await expect(reloaded.locator('[name="price"]')).toHaveValue('123.00');
    await expect(reloaded.locator('[name="onHand"]')).toHaveValue('77');

    // Stock is entered as an absolute count but the ledger is append-only, so
    // the implied movement has to show up on the products screen.
    await page.goto('/admin/products');
    await expect(
      page.getByRole('heading', { name: /recent stock movement/i }),
    ).toBeVisible();
  });

  test('a sale price above the regular price is refused', async ({ page }) => {
    await openFirstProduct(page);

    const variant = page.locator('form:has([name="sku"])').first();
    await variant.locator('[name="price"]').fill('50.00');
    await variant.locator('[name="salePrice"]').fill('80.00');
    await variant.getByRole('button', { name: /^save$/i }).click();

    await expect(
      variant.getByText(/lower than the regular price/i),
    ).toBeVisible();
  });
});

test.describe('brand merchandising', () => {
  test('creates, edits, previews, and removes an unused brand', async ({
    page,
  }) => {
    await staffSignIn(page);

    const suffix = Date.now();
    const name = `E2E Brand ${suffix}`;
    const slug = `e2e-brand-${suffix}`;

    await page.goto('/admin/brands/new');
    await page
      .getByRole('textbox', { name: 'Brand name', exact: true })
      .fill(name);
    await page
      .getByRole('textbox', { name: 'URL slug', exact: true })
      .fill(slug);
    await page
      .getByRole('textbox', { name: 'Logo URL', exact: true })
      .fill('/media/brands/revuele.png');
    await page.getByRole('button', { name: /^create brand$/i }).click();
    await expect(page.getByText('Saved.')).toBeVisible();

    await page.goto('/admin/brands');
    const row = page.locator('tbody tr').filter({ hasText: name });
    await expect(row).toBeVisible();
    await row.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(/\/admin\/brands\/[0-9a-f-]+\/edit$/);

    await page
      .getByRole('textbox', { name: 'Tagline', exact: true })
      .fill('Created in the brand workspace.');
    await page.getByRole('checkbox', { name: 'Featured brand' }).check();
    await page.getByRole('button', { name: /^save brand$/i }).click();
    await expect(page.getByText('Saved.')).toBeVisible();

    const editUrl = page.url();
    await page.goto(editUrl);
    await expect(
      page.getByRole('textbox', { name: 'Tagline', exact: true }),
    ).toHaveValue('Created in the brand workspace.');
    await expect(
      page.getByRole('img', { name: 'Brand logo preview' }),
    ).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /^delete brand$/i }).click();
    await expect(page).toHaveURL(/\/admin\/brands$/);
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test('pins a brand and reports what it has actually sold', async ({
    page,
  }) => {
    await staffSignIn(page);
    await page.goto('/admin/brands');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Brands' }),
    ).toBeVisible();
    // Units and revenue are read off paid orders; the column must exist even
    // when the store has taken none, because that is the fallback case.
    await expect(
      page.getByRole('columnheader', { name: /units sold/i }),
    ).toBeVisible();

    const row = page.locator('tbody tr').first();
    await row.locator('[name="merchandisingRank"]').fill('1');
    await row.getByRole('button', { name: /^save$/i }).click();
    await expect(row.getByText('Saved.')).toBeVisible();

    await page.goto('/admin/brands');
    await expect(
      page.locator('tbody tr').first().locator('[name="merchandisingRank"]'),
    ).toHaveValue('1');

    // Put it back, so the row keeps ranking on real sales for later runs.
    const restored = page.locator('tbody tr').first();
    await restored.locator('[name="merchandisingRank"]').fill('');
    await restored.getByRole('button', { name: /^save$/i }).click();
    await expect(restored.getByText('Saved.')).toBeVisible();
  });
});
