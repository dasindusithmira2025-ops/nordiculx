# Production inputs required

Everything below must be supplied by the business or its providers before
Nordic Lux can take a real order. None of it can be invented, and none of it is
missing code — the code paths that consume these values are built, tested and
in the repository today.

Ordered by what blocks a launch first.

---

## 1. Payment — PayHere

| Variable | Where it comes from |
| --- | --- |
| `PAYMENT_DRIVER=payhere` | Set at deploy time |
| `PAYHERE_MERCHANT_ID` | PayHere merchant dashboard |
| `PAYHERE_MERCHANT_SECRET` | PayHere merchant dashboard |
| `PAYHERE_SANDBOX=false` | After sandbox testing passes |

`src/lib/env.ts` **refuses to boot in production with `PAYMENT_DRIVER=mock`**,
so this cannot be forgotten silently. The signed-notification handler is at
`src/app/api/payments/notify/route.ts`; PayHere must be configured to call
`https://<domain>/api/payments/notify`.

**Test before launch:** one sandbox order end to end, confirming the order
moves to `confirmed` only after the notification arrives — never on the
browser redirect.

---

## 2. Email — SMTP

| Variable | Notes |
| --- | --- |
| `MAIL_DRIVER=smtp` | `log` only writes to the console |
| `SMTP_HOST`, `SMTP_PORT` | From the mail provider |
| `SMTP_USER`, `SMTP_PASSWORD` | From the mail provider |
| `SMTP_SECURE` | `true` for port 465, `false` for 587 with STARTTLS |
| `MAIL_FROM` | Must be a domain the provider is authorised to send for |

Also required at the DNS level, or messages land in spam: **SPF**, **DKIM** and
a **DMARC** record for the sending domain.

Messages that go out today: order confirmation, guest order-access link, order
dispatched, order lookup, and back-in-stock notification
(`src/lib/mail/templates.ts`).

---

## 3. Domain and TLS

| Variable | Notes |
| --- | --- |
| `APP_URL` | Must be `https://` — production boot refuses anything else |
| `NEXT_PUBLIC_APP_URL` | Same value; used in emails and structured data |

A certificate and HTTPS termination in front of the app. Order-access links,
unsubscribe links and payment callbacks all carry tokens; over plain HTTP they
are readable in transit.

---

## 4. Secrets and infrastructure

| Variable | Notes |
| --- | --- |
| `SESSION_SECRET` | **Generate a new one for production.** The value in `.env` is a development secret and is also the salt for the analytics visitor key |
| `DATABASE_URL` | Production Postgres, with backups configured |
| `REDIS_URL` | Required in production — without it rate limiting degrades to a per-process map, which does not hold across instances (`src/lib/rate-limit.ts`) |
| `STORAGE_DRIVER` / `S3_*` | Only if media moves off the local filesystem |

---

## 5. Legally reviewed copy

The pages exist, render, and are editable by staff at
`/admin/content?tab=pages`. The **words** are placeholder text and have not been
through legal review:

- `/privacy` — privacy policy
- `/terms` — terms of service
- `/returns-policy` — returns policy (the 14-day window in
  `src/lib/returns/model.ts` must match whatever this says)
- `/cookies` — cookie policy
- `/shipping` — delivery terms
- `/authenticity` — sourcing claims

Each is flagged **Needs legal review** in the admin until a member of staff
clears the checkbox, so the outstanding ones are visible at a glance.

---

## 6. Catalogue pricing

Prices are USD and provisional by the client's own decision — they vary
shipment to shipment and staff update them when a shipment lands. This is not a
blocker; it is an operating routine.

- Update from `/admin/products` (per-product) or its bulk actions (whole
  catalogue, a brand, or a selection).
- 61 of 87 products currently carry a placeholder price; the migration report
  `migration/legacy-nordic-lux/reports/PRICE_CONFIRMATION_REQUIRED.md` lists
  exactly which.

---

## 7. Business details in copy

- `WHATSAPP_NUMBER` / `NEXT_PUBLIC_WHATSAPP_NUMBER` — currently a development
  number.
- Contact address and hours on `/contact`.
- Delivery rates and thresholds, if they differ from what
  `src/lib/cart/pricing.ts` charges today.

---

## Known gaps that do not block launch

These are real, deliberate, and safe to ship without:

- **Staff MFA enrolment.** `requiresMfa()` marks the owner and administrator
  roles as needing a second factor and `/admin/staff` reports truthfully that
  nobody is enrolled, but there is no TOTP enrolment or challenge flow. Role
  checks are enforced server-side on every action regardless. Build this
  before the admin is reachable from the open internet by more than a couple of
  people.
- **Meilisearch.** Declared as a driver, never implemented. Postgres full-text
  search is what runs and it works.
- **`next build` needs a reachable database**, because `src/app/sitemap.ts`
  queries the catalogue during static export. The deploy pipeline must have
  `DATABASE_URL` available at build time, not only at runtime.
- **No tested restore drill.** `npm run backup` and `npm run restore` exist and
  refuse to run destructively against a non-local host, but nobody has yet
  restored a backup into a scratch database and confirmed the result.
