# Deployment

## Local development

```bash
cp .env.example .env
docker compose up -d postgres valkey mailpit
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

- App: http://localhost:3000
- Mailpit inbox: http://localhost:8025
- Postgres: 5432
- Valkey: **6380** (not the stock 6379 — see below)

### Why Valkey is on 6380

A Redis already running on the host would both block the container from binding
and silently accept the app's connection, mixing Nordic Lux cache and
rate-limit keys into an unrelated datastore. Publishing on 6380 makes the
collision impossible. `REDIS_URL` in `.env.example` matches.

## Verification

```bash
npm run verify     # format:check, lint, typecheck, unit + integration tests
npm run build      # production build
npm run test:e2e   # Playwright, desktop + mobile
```

`npm run verify` must be clean before anything is considered done.

E2E runs with `workers: 2`. The single Next dev server is the bottleneck, not
the browsers; one worker per core makes route first-compile exceed the expect
timeout and produces failures unrelated to the app.

## Production build

```bash
npm run build
npm run start
```

`output: 'standalone'` is set, so `Dockerfile` ships only the traced runtime.

Note: production **startup** validates cross-field environment invariants
(HTTPS, real payment driver, real mail driver). `next build` deliberately skips
them — it evaluates server modules with `NODE_ENV=production` before deployment
credentials exist, so enforcing them at build time would make the build
impossible to run anywhere but production.

## Required production configuration

Every variable is documented in `.env.example` and validated by
`src/lib/env.ts`. The ones that will refuse to boot if wrong:

| Variable                                  | Requirement                                       |
| ----------------------------------------- | ------------------------------------------------- |
| `APP_URL`                                 | Must be `https://`                                |
| `SESSION_SECRET`                          | ≥32 random bytes; rotating invalidates sessions   |
| `DATABASE_URL`                            | Required                                          |
| `PAYMENT_DRIVER`                          | Must not be `mock`                                |
| `PAYHERE_MERCHANT_ID` / `_SECRET`         | Required when `PAYMENT_DRIVER=payhere`            |
| `MAIL_DRIVER`                             | Must not be `log`                                 |
| `SMTP_HOST`                               | Required when `MAIL_DRIVER=smtp`                  |
| `S3_BUCKET`                               | Required when `STORAGE_DRIVER=s3`                 |
| `REDIS_URL`                               | Not enforced, but required for durable rate limiting |

## Release checklist

1. `npm run verify` clean.
2. `npm run build` succeeds.
3. `npm run test:e2e` green against the built app.
4. Migrations applied: `npm run db:migrate`.
5. `REDIS_URL` set — otherwise rate limiting is per-process and resets on
   deploy.
6. Real payment and SMTP credentials in place.
7. Legal pages reviewed (they are seeded placeholders).
8. Product photography replaced (current imagery is generated placeholder art).

## Scripts that do not exist yet

`package.json` declares five commands whose scripts were never written. They
fail with "module not found" if run:

| Command                | Needed for                                   |
| ---------------------- | -------------------------------------------- |
| `npm run staff:create` | Bootstrapping the first admin account         |
| `npm run db:reset`     | Dev convenience — drop, migrate, reseed       |
| `npm run backup`       | Pre-migration database dump                   |
| `npm run restore`      | Restoring a dump                              |
| `npm run search:reindex` | Only relevant when `SEARCH_DRIVER=meilisearch` |

Until then, take backups with `pg_dump` directly:

```bash
docker exec nordiclux-postgres pg_dump -U nordiclux nordiclux > backup.sql
```

Take a backup before every migration that drops or rewrites a column.
