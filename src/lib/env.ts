import 'server-only';
import { z } from 'zod';

/**
 * Server-side environment contract.
 *
 * Validated once at module load. A missing or malformed production variable
 * fails the process at startup rather than at the first request that needs it.
 * Never import this module from a client component — it would leak secrets
 * into the browser bundle. Client-visible values live in `publicEnv` below and
 * must be prefixed `NEXT_PUBLIC_`.
 */

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

/**
 * An optional URL where an empty variable means "not configured".
 * `.env.example` ships these keys blank so the shape is discoverable, and a
 * blank value must not be a boot failure.
 */
const optionalUrl = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.url().optional(),
);

const serverSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  // --- application -------------------------------------------------------
  APP_URL: z.url().default('http://localhost:3000'),
  APP_NAME: z.string().default('Nordic Lux'),
  INVOICE_SELLER_NAME: z.string().optional(),
  INVOICE_SELLER_ADDRESS: z.string().optional(),
  INVOICE_SELLER_TAX_ID: z.string().optional(),

  // --- database ----------------------------------------------------------
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required (postgres://user:pass@host:5432/db)'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  // --- security ----------------------------------------------------------
  // 32+ random bytes, base64/hex. Rotating this invalidates all sessions.
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).default(720),
  STAFF_SESSION_TTL_HOURS: z.coerce.number().int().min(1).default(12),

  // --- cache / rate limiting --------------------------------------------
  REDIS_URL: z.string().optional(),

  // --- search ------------------------------------------------------------
  SEARCH_DRIVER: z.enum(['postgres', 'meilisearch']).default('postgres'),
  MEILISEARCH_HOST: z.string().optional(),
  MEILISEARCH_API_KEY: z.string().optional(),

  // --- media storage -----------------------------------------------------
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./storage'),
  STORAGE_PUBLIC_URL: z.string().default('/media'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool,

  // --- mail --------------------------------------------------------------
  MAIL_DRIVER: z.enum(['log', 'smtp']).default('log'),
  MAIL_FROM: z.string().default('Nordic Lux <thenordiclux@gmail.com>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: bool,

  // --- payments ----------------------------------------------------------
  // `mock` is a development-only provider. Production must name a real one.
  PAYMENT_DRIVER: z.enum(['mock', 'payhere', 'stripe']).default('mock'),
  PAYHERE_MERCHANT_ID: z.string().optional(),
  PAYHERE_MERCHANT_SECRET: z.string().optional(),
  PAYHERE_SANDBOX: bool,
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),

  // --- integrations ------------------------------------------------------
  WHATSAPP_NUMBER: z.string().default('94770130299'),
  CRON_SECRET: z.string().optional(),
  ANALYTICS_ENABLED: bool,

  // --- social profiles ---------------------------------------------------
  // Optional overrides. The client-supplied profile URLs are the defaults in
  // src/lib/social.ts.
  SOCIAL_INSTAGRAM_URL: optionalUrl,
  SOCIAL_FACEBOOK_URL: optionalUrl,
  SOCIAL_TIKTOK_URL: optionalUrl,
});

type ServerEnv = z.infer<typeof serverSchema>;

/**
 * Cross-field rules that only apply in production. Keeping them separate from
 * the schema keeps local development runnable with almost no configuration.
 */
function assertProductionInvariants(env: ServerEnv): string[] {
  // `next build` evaluates server modules with NODE_ENV=production to collect
  // page data. Deployment credentials are not present then and are not needed
  // to compile — these are startup invariants, so skip them during the build.
  if (process.env.NEXT_PHASE === 'phase-production-build') return [];
  const errors: string[] = [];

  if (env.PAYMENT_DRIVER === 'stripe') {
    if (!env.STRIPE_SECRET_KEY) errors.push('STRIPE_SECRET_KEY is required');
    if (!env.STRIPE_WEBHOOK_SECRET)
      errors.push('STRIPE_WEBHOOK_SECRET is required');
    if (!env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
      errors.push('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is required');
    if (
      env.NODE_ENV !== 'production' &&
      env.STRIPE_SECRET_KEY &&
      !env.STRIPE_SECRET_KEY.startsWith('sk_test_') &&
      !env.STRIPE_SECRET_KEY.startsWith('rk_test_')
    ) {
      errors.push('Stripe sandbox requires a test-mode API key');
    }
    if (
      env.NODE_ENV !== 'production' &&
      env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY &&
      !env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.startsWith('pk_test_')
    ) {
      errors.push('Stripe sandbox requires a pk_test_ publishable key');
    }
  }

  if (env.NODE_ENV !== 'production') return errors;

  if (!env.CRON_SECRET || env.CRON_SECRET.length < 32) {
    errors.push(
      'CRON_SECRET must contain at least 32 characters in production',
    );
  }

  if (env.APP_URL.startsWith('http://')) {
    errors.push('APP_URL must use https:// in production');
  }
  if (env.PAYMENT_DRIVER === 'mock') {
    errors.push(
      'PAYMENT_DRIVER=mock cannot be used in production — configure a real provider',
    );
  }
  if (env.PAYMENT_DRIVER === 'payhere' && !env.PAYHERE_MERCHANT_SECRET) {
    errors.push(
      'PAYHERE_MERCHANT_SECRET is required when PAYMENT_DRIVER=payhere',
    );
  }
  if (env.MAIL_DRIVER === 'log') {
    errors.push(
      'MAIL_DRIVER=log cannot be used in production — configure SMTP',
    );
  }
  if (env.MAIL_DRIVER === 'smtp' && !env.SMTP_HOST) {
    errors.push('SMTP_HOST is required when MAIL_DRIVER=smtp');
  }
  if (env.STORAGE_DRIVER === 's3' && !env.S3_BUCKET) {
    errors.push('S3_BUCKET is required when STORAGE_DRIVER=s3');
  }
  if (env.SEARCH_DRIVER === 'meilisearch' && !env.MEILISEARCH_HOST) {
    errors.push('MEILISEARCH_HOST is required when SEARCH_DRIVER=meilisearch');
  }
  return errors;
}

function load(): ServerEnv {
  const parsed = serverSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const invariants = assertProductionInvariants(parsed.data);
  if (invariants.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${invariants.map((e) => `  - ${e}`).join('\n')}`,
    );
  }

  return parsed.data;
}

export const env = load();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/**
 * Server-side view of the browser-safe values. Client components must import
 * `publicConfig` from src/lib/public-config.ts instead — importing this module
 * from the client would pull the whole secret schema into the bundle.
 */
export const publicEnv = {
  appName: env.APP_NAME,
  appUrl: env.APP_URL,
  whatsappNumber: env.WHATSAPP_NUMBER,
  analyticsEnabled: env.ANALYTICS_ENABLED,
} as const;
