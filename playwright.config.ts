import { defineConfig, devices } from '@playwright/test';
import { e2eDatabaseUrl } from './scripts/e2e-db';

// Not 3000: a dev server already running there is pointed at the operating
// database, and silently reusing it would defeat the isolated E2E database.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // A single Next dev server is the bottleneck, not the browsers: with one
  // worker per core, first-compile of a route can exceed the expect timeout and
  // produce failures that have nothing to do with the app.
  workers: 2,
  reporter: process.env.CI
    ? [['github'], ['html']]
    : [['list'], ['html', { open: 'never' }]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    { name: 'mobile', use: { ...devices['iPhone 14'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // The database is built here, not in globalSetup: Playwright starts
        // the web server first, and the dev server needs it to exist.
        command: `npm run e2e:db && npm run dev -- --port ${PORT}`,
        url: baseURL,
        // Never reuse: an already-running dev server is pointed at the
        // operating database, which is exactly what this isolates against.
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          DATABASE_URL: e2eDatabaseUrl(),
          APP_URL: baseURL,
          NEXT_PUBLIC_APP_URL: baseURL,
        },
      },
});
