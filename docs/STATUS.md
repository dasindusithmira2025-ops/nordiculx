# Nordic Lux — build status

Updated after every completed slice. This file is the single source of truth
for what is finished, what is unverified, and what is genuinely blocked.

**Last updated:** 2026-08-21

---

## Recovery note — second resume (2026-08-18)

Picked the project back up after the same power loss. The working tree was
sound: no truncated or partially written files, every source file ends on a
complete statement, and `lint`, `typecheck`, `format:check`, the 92-test suite
and `next build` were all green on arrival. The seeded database still held
exactly the documented row counts.

Two things were genuinely broken, both environmental rather than code:

| Symptom                                                    | Cause                                                                                        | Status |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------ |
| Every `docker` command failed                              | Docker Desktop never restarted after the power loss; all containers were down                 | Fixed  |
| `/_next/image` hung forever, so no page could be screenshot | A wedged `next dev` process (454s CPU, 2 GB RSS) left behind after screenshot runs were killed | Fixed  |

The second one is worth remembering: when image requests hang but page HTML
still returns quickly, the dev server is wedged — restart it rather than
looking for a fault in the page.

One real code defect surfaced during this session's testing. See
**`cn()` dropped custom font sizes** below.

---

## Recovery note — unplanned shutdown

The machine lost power mid-session. On resume the working tree was intact (no
truncated or half-written source files, and the seed data in Postgres was
complete and internally consistent), but several things were broken or missing:

| Symptom                                                      | Cause                                                                                          | Status   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | -------- |
| `npm run lint` crashed with "Converting circular structure"   | `eslint.config.mjs` used the `FlatCompat` shim; `eslint-config-next` v16 ships flat configs      | Fixed    |
| `npm run build` failed on `/_not-found`                       | Production env invariants ran during `next build`, which evaluates modules with `NODE_ENV=production` | Fixed    |
| 6 lint errors, `react-hooks/set-state-in-effect`              | React 19 rule; three were genuine cascading renders                                             | Fixed    |
| 61 files failing `prettier --check`                           | Formatting pass never completed before shutdown                                                 | Fixed    |
| `docker compose up valkey` failed to bind                     | Port 6379 held by an unrelated project on this machine                                          | Fixed    |
| `docs/` absent entirely                                       | Referenced by `.env.example`, `next.config.ts` and many source comments, but never committed     | Rebuilt  |

Two further defects were found by testing the recovered code, neither caused by
the shutdown — see **Defects found and fixed** below.

---

## Completed and verified

Verified means: typechecks, passes lint and the test suite, builds for
production, and has been rendered in a browser and looked at.

### Foundation

- **Design system** — `src/app/globals.css`. Tokens for colour, type scale,
  spacing, easing and duration; light and dark palettes; custom utilities
  (`page-x`, `section-y`, `eyebrow`, `link-underline`, `link-retract`).
- **UI primitives** — `button`, `field`, `display`, `icons`, `overlay`.
  Overlays are native `<dialog>`, so focus trapping, Escape and the backdrop
  come from the platform.
- **Layout** — announcement bar, header with mega navigation, mobile drawer,
  footer, support launcher.
- **Data layer** — 49-table schema, migrations, and a seed producing 27
  products, 41 variants, 8 brands, 23 categories, 9 concerns, 6 articles,
  4 orders and 14 reviews.
- **Catalogue queries** — `listProducts`, `getProductFacets`,
  `getProductBySlug`, `getRelatedProducts`, `getProductReviews`, plus the whole
  taxonomy/content query surface.
- **Cart** — cookie-backed cart, server actions, pricing engine with
  promotions and shipping, mini-cart drawer.
- **Search** — predictive search dialog implementing the ARIA combobox pattern,
  backed by Postgres full-text with a prefix fallback.
- **Wishlist, newsletter, live chat** — actions, APIs and UI.
- **Routine Finder** — `src/lib/routine/engine.ts` is pure and unit-tested:
  rules are matched, weights summed per product per step, and candidates ranked
  deterministically so the same answers always give the same routine. The page
  resolves availability on top, preferring sellable stock. Nothing is written to
  the database to *view* a result — the routine is a function of the answers, so
  `routine_results` stays free of abandoned quizzes and saving is explicit.
- **Account and authentication** — sign-in with per-account lockout
  (`failed_login_count` / `locked_until`) *and* per-connection rate limiting;
  identical messaging for an unknown address and a wrong password; registration
  that does not confirm whether an address is already taken; `?next=`
  destinations validated against off-site and protocol-relative URLs; password
  change requiring the current password and revoking every other session. Every
  account query filters on the session's user id, so another customer's order
  reference 404s rather than rendering — covered by an e2e test.
- **Proxy** — `src/proxy.ts` (Next 16's rename of Middleware) redirects
  signed-out requests to the login form with the requested path preserved. It is
  an optimistic cookie-presence check only; `requireUser()`/`requireStaff()`
  remain the authorisation boundary.
- **Checkout and orders** — `src/lib/checkout/place-order.ts` runs one
  transaction: totals recomputed server-side from the cart's own priced lines,
  stock reserved with a conditional `UPDATE ... WHERE on_hand - reserved >= qty`
  so the database arbitrates the last unit, the cart row locked `FOR UPDATE` and
  marked converted so a double-submit cannot create two orders, and an
  append-only ledger movement per line. Out-of-stock aborts via a typed error
  because Drizzle's `tx.rollback()` throws and could not otherwise return a
  reason. Confirmation is idempotent — providers retry, and a retry must not
  send a second email or re-confirm.
- **Payments and mail** — `mock` and `payhere` drivers; `log` and `smtp` mail.
  A payment is only ever marked paid from a signature-verified notification
  compared in constant time, never from the browser's return URL. Sending mail
  never throws into the caller: a failed confirmation email must not roll back an
  order that has already been paid for.
- **Staff area** — a separate cookie and session from the storefront, so a
  signed-in customer is not thereby signed in to the admin. `requireStaff()` in
  the `(shell)` layout means a new admin page cannot be added unprotected, and
  each page and action checks its own permission on top; the role-filtered nav is
  presentation only, which an e2e test proves by navigating straight to a hidden
  URL. Marking an order dispatched converts the reservation into a real stock
  decrement with its ledger row, in the same transaction as the status change,
  and emails the customer only after that commits. Every staff mutation and both
  sign-in and sign-out write an append-only audit row carrying actor, role and a
  `{ from, to }` diff of the fields that actually moved.
- **SEO** — `sitemap.ts` builds from live rows, so an unpublished product leaves
  the sitemap the moment it leaves the shop, and nothing under `/account`,
  `/checkout`, `/order` or `/track` is ever listed (an order reference in a
  sitemap is a privacy failure, not just an SEO one). Organization and WebSite
  are declared once in the storefront layout; BreadcrumbList is emitted by the
  `Breadcrumbs` component itself, so the structured trail is always the one
  actually rendered.
- **Operational scripts** — the five commands `package.json` had always
  advertised now exist: `db:reset`, `search:reindex`, `staff:create`, `backup`,
  `restore`. The destructive ones refuse to run with `NODE_ENV=production` or
  against a non-local host without `--force`. `search:reindex` exits non-zero
  under `SEARCH_DRIVER=meilisearch` rather than reporting success for work it
  cannot do — there is no Meilisearch indexer yet.
- **Content blocks** — `src/components/content/blocks.tsx` renders the stored
  `ContentBlock[]` through a fixed component map with no
  `dangerouslySetInnerHTML`, shared by editorial, campaigns and CMS pages.

### Routes

| Route              | Notes                                                                             |
| ------------------ | --------------------------------------------------------------------------------- |
| `/`                | Fully CMS-driven from `homepage_sections`; 10 scheduled sections                   |
| `/shop`            | Facets, sort, pagination, price range, active-filter chips, zero-result recovery   |
| `/category/[slug]` | Locked category filter, subcategory chips, parent breadcrumb; includes descendants |
| `/product/[slug]`  | Gallery, variant selection, stock, add-to-bag, reviews with distribution, related products, Product JSON-LD |
| `/brands`          | Featured photographic cards plus an A–Z index with live product counts             |
| `/brands/[slug]`   | Brand story then listing; brand is route-locked and its facet hidden               |
| `/concern`         | Concern grid, with a route into the quiz for people who cannot self-diagnose        |
| `/concern/[slug]`  | `guidance` copy leads, then the listing; concern route-locked                       |
| `/collection`      | Index, so a collection breadcrumb has a real parent                                |
| `/collection/[slug]` | Curated listing; `collectionSlug` locked so two collections cannot be unioned     |
| `/campaigns/[slug]` | Shared `Hero` plus content blocks; 404s outside its publish window                |
| `/edit`            | Lead article plus three-up grid, topic filtering via validated query param         |
| `/edit/[slug]`     | Article with content blocks, "Shop the story", further reading, Article JSON-LD    |
| `/api/health`      | Liveness probe that touches the database; the endpoint compose already referenced  |
| `/[slug]`          | One route for all seven CMS pages (about, authenticity, shipping, returns-policy, privacy, terms, cookies) |
| `/faq`             | Grouped `<details>` disclosures, in-page section nav, FAQPage JSON-LD              |
| `/contact`         | Creates a support ticket with a non-sequential reference; prefilled when signed in |
| `/routine-finder`  | Four-question quiz, answers in the query string; scored result with per-step reasoning |
| `/routine-finder/[reference]` | A saved routine by short code; replays the snapshot, refreshes prices. `noindex` |
| `/account/login`, `/account/register` | Sign in and register. Public by necessity, `noindex`         |
| `/account`         | Overview: order in motion, counts from one query, recent orders                    |
| `/account/orders`, `/account/orders/[reference]` | List and detail; detail scoped to the owner  |
| `/account/addresses` | Address book CRUD in a native `<dialog>`, default handling                        |
| `/account/wishlist` | Saved products, add-to-bag inline, honest out-of-stock state                       |
| `/account/settings` | Details and password change (revokes every other session)                         |
| `/checkout`        | One-page checkout, guest or signed-in; saved addresses preselected                  |
| `/order/[reference]` | Confirmation, readable only by the owner or the guest cookie                     |
| `/track`, `/track/[reference]` | Guest lookup; emails a fresh token rather than opening the order  |
| `/api/payments/notify` | Signature-verified provider callback — the only path that marks an order paid  |
| `/sitemap.xml`     | 92 URLs from live rows; private and single-use routes deliberately excluded        |
| `/robots.txt`      | Disallows account/checkout/order/track/api and faceted duplicates                  |
| `/admin/login`     | Staff sign-in on a separate cookie and session from the storefront                 |
| `/admin`           | Overview with actionable counts and environment warnings                           |
| `/admin/orders`, `/admin/orders/[reference]` | Filterable list; status transitions gated on `orders.manage` |
| `/admin/products`  | Operational product catalogue: search/filter, quick price/sale/stock/status edits, ledger-backed restocks/adjustments, bulk actions, product creation |
| `/admin/reviews`   | Moderation queue, full review text, publish/reject                                 |
| `/admin/support`   | Ticket triage, open first, close/reopen gated on `support.respond`                 |

### Tests

- 142 unit and integration tests (`npm test`). Integration tests run against a
  real seeded Postgres and skip cleanly when no database is reachable.
- 7 end-to-end specs across desktop and mobile projects (`npm run test:e2e`),
  covering browse → refine → PDP → variant → add to bag → reload.
- 19 further end-to-end specs in `tests/e2e/content.spec.ts` covering the
  taxonomy landings (including that a crafted query string cannot widen a
  route-locked listing), editorial, all seven CMS pages, the FAQ and both the
  success and rejection paths of the contact form.
- 9 end-to-end specs in `tests/e2e/routine.spec.ts` covering the full quiz walk,
  multi-select behaviour, determinism, rejection of invented answer values, and
  save-then-replay.
- 15 end-to-end specs in `tests/e2e/account.spec.ts`: the sign-in/sign-out
  round trip, deep-link return, both open-redirect guards, non-disclosure on a
  failed sign-in and on registering an existing address, and the cross-customer
  order IDOR check.
- 10 end-to-end specs in `tests/e2e/checkout.spec.ts`: guest purchase, signed-in
  purchase landing in order history, empty-bag redirect, server-side validation,
  the bag badge clearing on the redirect, and that a confirmation is unreadable
  from a browser holding neither the session nor the guest cookie.
- 5 end-to-end specs in `tests/e2e/seo.spec.ts` covering sitemap contents and
  exclusions, robots directives, and that structured data parses and agrees with
  the visible page.
- 11 end-to-end specs in `tests/e2e/admin.spec.ts` covering staff sign-in,
  that a customer session grants no admin access, role-filtered navigation, that
  a hidden link is not the protection, and a full dispatch.
- 76 specs on desktop, 74 on mobile (2 skipped as desktop-rail only).

---

## Defects found and fixed

Both were pre-existing, found by testing rather than by reading:

1. **Closed drawers swallowed clicks across the whole site.** `Drawer` applied
   Tailwind's `flex` to the `<dialog>`. An author `display` declaration beats
   the UA's `dialog:not([open]) { display: none }`, so every closed drawer
   stayed laid out at 416×900 with `pointer-events: auto` — invisible, but
   intercepting every click in that region on every page. Fixed by using
   `open:flex`. This is why the filter rail could not be clicked.

2. **Faceted search could not multi-select.** `getProductFacets` counted every
   dimension against all active filters including its own, so selecting one
   brand reduced the brand list to that single brand and a second could never
   be added. Fixed to standard drill-down faceting: each dimension is counted
   with its own selection removed, while route-locked filters (the category on
   `/category/skincare`) are always reapplied. The price range now likewise
   ignores its own bounds, so narrowing it cannot collapse the slider.

3. **`cn()` dropped custom font sizes.** tailwind-merge only knows Tailwind's
   default scales, so a token whose name it does not recognise falls through to
   the catch-all for that prefix — and for `text-*` that catch-all is *colour*.
   `text-read text-fg-muted` therefore looked like two colours and the size was
   discarded, rendering all long-form copy at `--text-base` (15px) instead of
   `--text-read` (18px). The same collision hit
   `[&_h2]:text-display-sm [&_h2]:text-fg` inside `Prose`, which is why
   editorial headings rendered *smaller* than the paragraphs beneath them.
   Fixed by teaching `extendTailwindMerge` the custom `--text-*` and
   `--shadow-*` names in `src/lib/cn.ts`, and pinned by `tests/unit/cn.test.ts`.
   Any new token in those scales must be added there too.

   Worth noting for the record: this was latent in code previously marked
   "completed and verified". It was invisible in review because the class was
   present in the JSX and only vanished at runtime.

4. **A raw `db.execute` does not decode timestamps.** `getOrdersForUser` read
   `created_at` from a raw SQL query, where Drizzle's column decoders do not
   run, so the value arrived as a string. `Intl.DateTimeFormat.format` throws
   `RangeError: Invalid time value` on a string, which 500'd the account
   overview and the order list — and, because the post-login redirect targets
   `/account`, made signing in appear to silently do nothing. Fixed by coercing
   with `new Date(...)`, matching what `src/lib/catalogue/products.ts` already
   does for `new_until`. Any new raw-SQL query returning a timestamp needs the
   same treatment.

5. **A successful sign-in did not clear its own rate-limit window.**
   `clearRateLimit` existed and was documented as "called after a successful
   login so honest users reset", but nothing called it. A customer who mistyped
   a few times and then got it right stayed throttled for the rest of the
   window, which is far more likely than it sounds behind a shared NAT. Now
   called on success; the failure counters are untouched.

---

## Current catalogue operating state

- The live working catalogue contains 87 canonical Nordic Lux products, 11 real
  brands, 0 fake reviews and 0 demo catalogue products.
- All 87 products are published. The client's shipment-by-shipment pricing
  decision means the default USD catalogue prices are temporary operational
  prices, not historically verified retail prices.
- Staff can update product prices, sale prices, stock movements and publication
  state from `/admin/products`; ordinary shipment updates do not require code
  edits, migration scripts or redeploys.

## Not started

Ordered by dependency. Each has its data layer already in place.

Nothing. Every slice of the original scope is now built, tested and verified in
a browser.

Deliberately left for a later pass, and noted so they are not mistaken for
oversights:

- Meilisearch is a declared `SEARCH_DRIVER` with no implementation; search runs
  on Postgres. `search:reindex` exits non-zero rather than pretending otherwise.
- Staff MFA: `requiresMfa()` and the `mfa_secret` column exist and owners and
  administrators are flagged as requiring it, but no enrolment or challenge flow
  is built yet.

---

## Blocked on external input

Nothing is blocking development. These block **production launch only**:

| Item                  | Detail                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| Payment provider      | `PAYMENT_DRIVER=mock` is rejected in production by `src/lib/env.ts`. Real PayHere merchant ID and secret are client-supplied. |
| Transactional email    | `MAIL_DRIVER=log` is rejected in production. Needs real SMTP credentials.                              |
| Production domain/TLS | `APP_URL` must be `https://` in production.                                                             |
| Product photography   | All imagery is generated placeholder art from `scripts/generate-media.ts`.                              |
| Legal copy            | Privacy, terms, returns and cookie text are seeded placeholders and need review before launch.          |

---

## Local environment notes

- Valkey is published on **6380**, not the stock 6379 — a Redis already running
  on the host would otherwise both block the container and silently accept the
  app's connection, mixing Nordic Lux keys into an unrelated datastore.
- E2E runs with `workers: 2`. A single Next dev server is the bottleneck; one
  worker per core makes first-compile exceed the expect timeout and produces
  failures unrelated to the app.
