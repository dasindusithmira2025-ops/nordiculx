import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

/**
 * Visual QA for signed-in pages.
 *
 * Same idea as `shot.ts`, but signs in first so the account and checkout
 * surfaces can actually be looked at. Credentials come from the seed and this
 * only ever runs against a local dev server.
 *
 *   npx tsx scripts/shot-auth.ts /account /account/orders
 *   npx tsx scripts/shot-auth.ts /account --mobile --full
 */

const args = process.argv.slice(2);
const routes = args.filter((a) => !a.startsWith('--'));
const full = args.includes('--full');
const mobile = args.includes('--mobile');
const base = process.env.SHOT_BASE_URL ?? 'http://localhost:3000';
const email = process.env.SHOT_EMAIL ?? 'customer@nordiclux.test';
const password = process.env.SHOT_PASSWORD ?? 'DevCustomer!2026';

if (routes.length === 0) routes.push('/account');

const OUT = '.screenshots';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext(
  mobile
    ? { ...devices['iPhone 14'] }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
);

const page = await context.newPage();
const errors: string[] = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`PAGE ERROR: ${e.message}`));

const isStaff = routes.some((r) => r.startsWith('/admin'));
await page.goto(`${base}${isStaff ? '/admin/login' : '/account/login'}`);
await page.getByLabel('Email address').fill(email);
await page.getByLabel('Password').fill(password);
await page.getByRole('button', { name: /^sign in$/i }).click();
await page.waitForURL((url) => !url.pathname.endsWith('/login'), {
  timeout: 20_000,
});
console.warn(`signed in as ${email}`);

for (const route of routes) {
  const url = `${base}${route}`;
  const response = await page.goto(url, {
    waitUntil: 'networkidle',
    timeout: 45_000,
  });

  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);

  const name =
    route.replace(/^\//, '').replace(/[/?=&]/g, '-') +
    (mobile ? '-mobile' : '-desktop') +
    (full ? '-full' : '');

  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  console.warn(`${response?.status()} ${url} -> ${OUT}/${name}.png`);
}

if (errors.length > 0) {
  console.warn('\nConsole errors:');
  for (const error of [...new Set(errors)]) console.warn(`  - ${error}`);
}

await browser.close();
