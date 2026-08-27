/**
 * Configuration that is safe to ship to the browser.
 *
 * This is the ONLY config module a client component may import.
 * `src/lib/env.ts` is server-only — it describes the whole environment,
 * including the session secret and provider credentials, and importing it from
 * a client component would pull that schema into the browser bundle.
 *
 * Each value is read as a literal `process.env.NEXT_PUBLIC_*` expression
 * because that is what the bundler statically replaces; a computed lookup like
 * `process.env[name]` would silently become `undefined` in the browser.
 */

export const publicConfig = {
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'Nordic Lux',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  /** International format, digits only. */
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '94776316512',
  analyticsEnabled: process.env.NEXT_PUBLIC_ANALYTICS_ENABLED !== 'false',
} as const;
