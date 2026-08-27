import { chromium, devices } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

/**
 * Visual QA helper.
 *
 * Renders one or more routes at a chosen viewport and writes PNGs to
 * `.screenshots/`, so rendered pages can be reviewed rather than judged from
 * JSX. Not part of the test suite — this is a development tool.
 *
 *   npx tsx scripts/shot.ts /                     desktop, above the fold
 *   npx tsx scripts/shot.ts / --full              whole page
 *   npx tsx scripts/shot.ts /shop --mobile
 *   npx tsx scripts/shot.ts / /shop /product/x --full
 */

const args = process.argv.slice(2);
const routes = args.filter((a) => !a.startsWith('--'));
const full = args.includes('--full');
const mobile = args.includes('--mobile');
const base = process.env.SHOT_BASE_URL ?? 'http://localhost:3000';

if (routes.length === 0) routes.push('/');

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
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(`PAGE ERROR: ${error.message}`));

for (const route of routes) {
  const url = `${base}${route}`;
  const response = await page.goto(url, {
    waitUntil: 'networkidle',
    timeout: 45_000,
  });

  // Let fonts settle and any entrance animation finish before capturing.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);

  const name =
    (route === '/'
      ? 'home'
      : route.replace(/^\//, '').replace(/[/?=&]/g, '-')) +
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
