# Security

## Trust boundaries

Everything crossing one is validated, and validation lives on the server side
of the boundary — never only in the browser.

| Boundary                | Control                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| Environment             | `src/lib/env.ts` — Zod schema, validated at module load, fails at startup |
| Query strings           | `src/lib/catalogue/query.ts` — unparseable values dropped, never thrown  |
| Server actions / APIs   | Zod schemas in `src/lib/validation.ts`                                   |
| SQL                     | Drizzle `sql` tagged templates bind parameters; nothing is concatenated  |
| Sessions                | Signed, HTTP-only cookies; server-side session records                   |

A hand-edited listing URL must never produce a 500 — junk is discarded and the
page renders. This is both a robustness and an availability property.

## Secrets

`src/lib/env.ts` imports `server-only`; importing it from a client component is
a build error rather than a silent leak. Anything the browser may see lives in
`src/lib/public-config.ts` and is read as a literal `process.env.NEXT_PUBLIC_*`
expression. **Never** put a secret behind the `NEXT_PUBLIC_` prefix.

`SESSION_SECRET` must be at least 32 characters. Rotating it invalidates every
active session.

## Authentication

- Passwords are hashed with a memory-hard KDF; hashes are never returned by any
  query or read model.
- Sessions are server-side records keyed by a signed cookie, with separate TTLs
  for customers (`SESSION_TTL_HOURS`) and staff (`STAFF_SESSION_TTL_HOURS`).
  Staff sessions are deliberately short.
- Staff authorisation is permission-based (`src/lib/auth/permissions.ts`), not
  role-string comparison at call sites.

## Authorisation rules that are easy to get wrong

- **Route-locked filters win over user input.** `parseListing` merges the
  route's filters last, so `?brand=…` cannot widen `/brands/kvist`.
- **Reviews cannot self-certify.** `verifiedPurchase` is written by the server
  after finding a delivered order item for that user. A client can never assert
  it.
- **Only approved reviews are public**, and authors are reduced to a first name
  plus last initial.
- **Only published, non-deleted products** are visible to the storefront; the
  condition is one shared SQL fragment rather than repeated per query.

## Production invariants

Refused at startup in production (`src/lib/env.ts`):

- `APP_URL` must be `https://`
- `PAYMENT_DRIVER=mock` is rejected
- `MAIL_DRIVER=log` is rejected
- `PAYHERE_MERCHANT_SECRET` required when the PayHere driver is selected
- Stripe API, publishable, and webhook keys required when Stripe is selected
- `S3_BUCKET` required when storage is S3

These are **startup** invariants and are skipped during `next build`, which
evaluates modules with `NODE_ENV=production` long before those credentials
exist. Skipping them at build time is deliberate; skipping them at boot is not
possible.

## Transport and headers

Set in `next.config.ts` for every response: `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
a restrictive `Permissions-Policy`, and HSTS with preload.

`poweredByHeader` is disabled.

## Stripe

Stripe secret and webhook keys stay in the server environment. Checkout is
Stripe-hosted; Nordic Lux handles no PAN, CVC, or expiry. The webhook reads the
exact raw body and verifies `stripe-signature` before validating the stored
order id/reference, Checkout Session id, amount, and currency. Browser
success/cancel query strings never change payment or order state.

## Rate limiting

`src/lib/rate-limit.ts` is durable only when `REDIS_URL` is set; without it the
limiter is in-process and survives neither a restart nor a second instance.
`rateLimitIsDurable` exposes which mode is active — production must run with
Redis/Valkey.

## Structured data

JSON-LD is serialised server-side from our own query results, never from user
input, and only asserts facts the page also displays.

## Not yet done

- No Content-Security-Policy header is set yet, despite the comment in
  `next.config.ts` referring to one. Adding it requires auditing inline styles
  and the JSON-LD script tags.
- No automated dependency audit in CI.
