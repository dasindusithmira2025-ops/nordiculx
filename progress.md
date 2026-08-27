# Progress log

Session of 2026-08-18 — resuming Nordic Lux after the power loss.

---

## 1. Recovery and baseline

The working tree turned out to be **sound**. No truncated or half-written files —
every `.ts`/`.tsx` in `src`, `tests` and `scripts` ended on a complete
statement. The seeded database still held exactly the documented row counts
(27 products, 41 variants, 8 brands, 23 categories, 10 homepage sections,
4 orders, 14 reviews, 4 quiz questions / 16 options / 14 rules).

On arrival, all of these were already green: `format:check`, `lint`,
`typecheck`, 92 unit + integration tests, and `next build`.

Two things were genuinely broken, both environmental rather than code:

| Symptom | Cause | Fixed |
| --- | --- | --- |
| Every `docker` command failed | Docker Desktop never restarted after the power loss | ✅ |
| `/_next/image` hung forever, so no page could be screenshotted | A wedged `next dev` process (454s CPU, 2 GB RSS) left behind by killed screenshot runs | ✅ |

Worth remembering: when image requests hang but page HTML still returns in
~100 ms, the dev server is wedged — restart it instead of hunting for a page
fault.

---

## 2. Defects found and fixed

All eight were found by **testing**, not by reading. The first two were latent in
code previously marked "completed and verified"; numbers 6-8 are in section 5.

1. **`cn()` silently dropped custom font sizes.** `tailwind-merge` only knows
   Tailwind's default scales, so an unrecognised token falls through to the
   catch-all for its prefix — and for `text-*` that catch-all is *colour*.
   `text-read text-fg-muted` therefore looked like two colours and the size was
   discarded, rendering **all long-form copy at 15px instead of 18px**. The same
   collision hit `[&_h2]:text-display-sm [&_h2]:text-fg` in `Prose`, which is
   why editorial headings came out *smaller* than their body text. Fixed by
   teaching `extendTailwindMerge` the custom `--text-*` and `--shadow-*` names;
   pinned by `tests/unit/cn.test.ts`. Invisible in review because the class was
   present in the JSX and only vanished at runtime.

2. **A raw `db.execute` does not decode timestamps.** `getOrdersForUser` read
   `created_at` from raw SQL, where Drizzle's decoders do not run, so it arrived
   as a string. `Intl.DateTimeFormat.format` throws `RangeError: Invalid time
   value` on a string — which 500'd the account overview and order list, and
   because the post-login redirect targets `/account`, made **signing in appear
   to silently do nothing**. Fixed with `new Date(...)`, matching what
   `products.ts` already does.

3. **A successful sign-in never cleared its own rate-limit window.**
   `clearRateLimit` existed and was documented as "called after a successful
   login so honest users reset" — but nothing called it. Someone who mistyped a
   few times then got it right stayed throttled for the rest of the window,
   which is common behind a shared NAT. Now called on success; failure counters
   untouched.

4. **A multi-select quiz question could never take a second answer.** The page
   shows the first *unanswered* question, so ticking one concern immediately
   advanced past it and "Continue" was unreachable. Fixed with an explicit
   `confirmed` list in the URL; completeness is still judged on answers alone so
   a fully-answered shared link goes straight to the result.

5. **`aria-pressed` on a link.** I had put it on the quiz options, but it is only
   valid on `role="button"`. Replaced with visually-hidden "(selected)" text,
   which every screen reader announces as part of the link name.

Also fixed two bugs in my own address code before they shipped: `returning()`
gives the *new* value (so it could not report what the default *was*), and the
default-promotion query would have resurrected a soft-deleted address.

---

## 3. Built this session

Everything below is typechecked, linted, formatted, unit- and e2e-tested, built
for production, and **looked at in a browser**.

### Shared foundations
- `src/components/content/blocks.tsx` — renderer for stored `ContentBlock[]`
  through a fixed component map, no `dangerouslySetInnerHTML` anywhere. Product
  blocks are resolved in one batched query, not per block. Shared by editorial,
  campaigns and CMS pages.
- `src/lib/routine/engine.ts` — pure, unit-tested quiz scoring.
- `src/lib/account/index.ts` — account queries, all scoped by session user id.
- `src/lib/mail/` — `log` and `smtp` drivers plus plain-text templates. Sending
  never throws into the caller: a confirmation email failing must not roll back
  an order the customer already paid for.
- `src/lib/payments/index.ts` — `mock` and `payhere` drivers. A payment is only
  ever marked paid from a **verified** provider callback, compared in constant
  time; the browser return URL carries no authority.
- `src/lib/checkout/place-order.ts` — the order-placement transaction; see
  section 5.
- `src/proxy.ts` — Next 16's rename of Middleware. Redirects signed-out requests
  to the login form with the requested path preserved. Optimistic cookie check
  only; `requireUser()` remains the authorisation boundary.
- `src/app/api/health/route.ts` — the endpoint `docker-compose.yml` was already
  probing but which had never been written.
- `scripts/shot-auth.ts` — screenshot helper that signs in first, so account and
  checkout pages can actually be reviewed.

### Routes
| Route | Notes |
| --- | --- |
| `/brands`, `/brands/[slug]` | Featured cards + A–Z index; brand route-locked, its facet hidden |
| `/concern`, `/concern/[slug]` | `guidance` copy leads before the grid |
| `/collection`, `/collection/[slug]` | Curated listing; two collections cannot be unioned |
| `/campaigns/[slug]` | Shared `Hero` + content blocks; 404s outside its publish window |
| `/edit`, `/edit/[slug]` | Lead + three-up grid, topic filtering, "Shop the story", Article JSON-LD |
| `/[slug]` | One route for all seven CMS pages (about, authenticity, shipping, returns-policy, privacy, terms, cookies) |
| `/faq` | Grouped native `<details>`, in-page nav, FAQPage JSON-LD |
| `/contact` | Creates a support ticket with a non-sequential reference |
| `/routine-finder` | Four-question quiz, answers in the URL, per-step reasoning |
| `/routine-finder/[reference]` | Saved routine by short code; replays the snapshot, refreshes prices |
| `/account/login`, `/account/register` | Public by necessity, `noindex` |
| `/account` | Overview: order in motion, counts in one query |
| `/account/orders`, `/account/orders/[reference]` | List + full detail with tracking timeline |
| `/account/addresses` | CRUD in a native `<dialog>`, default handling |
| `/account/wishlist` | Add-to-bag inline, honest out-of-stock state |
| `/account/settings` | Password change; revokes every *other* session |

### Security properties, each covered by a test
- A crafted query string cannot widen a route-locked listing.
- Invented quiz answer values are dropped, and a single-choice question cannot
  be turned into a multi-select to make every rule fire at once.
- Failed sign-in gives the **same** message for an unknown address and a wrong
  password; a dummy hash is still verified so timing does not leak either.
- Registering an existing address does not confirm it exists.
- `?next=` rejects off-site and protocol-relative destinations.
- Per-account lockout **and** per-connection rate limiting.
- One customer requesting another's real order reference gets a **404, not a
  403** — a 403 would confirm the reference is real.
- Account pages are `noindex`.

---

## 4. Test and build status

| Check | Result |
| --- | --- |
| `format:check` | pass |
| `lint` | pass |
| `typecheck` | pass |
| `npm test` | **142 passed** (was 92) |
| `test:e2e` desktop | **76 passed** (was 7) |
| `test:e2e` mobile | 74 passed, 2 skipped (desktop-rail only, intentional) |
| `npm run build` | pass — 45 routes + proxy |

Also cleared the `middleware` → `proxy` deprecation warning, per AGENTS.md
("heed deprecation notices").

---

## 5. Completed since

**Checkout, orders and guest tracking.** `place-order.ts` runs one transaction:
totals recomputed server-side from the cart's own priced lines, stock reserved
with a conditional `UPDATE … WHERE on_hand - reserved >= qty` so the database
arbitrates the last unit, the cart locked `FOR UPDATE` and marked converted
against double-submits. Payment confirmation is idempotent because providers
retry. Verified against the database, not just the screen: real SKUs on order
lines, guest tokens only for guests, and the inventory ledger showing `reserved`
climbing 1→4 with `on_hand` untouched.

**Payments and mail.** `mock`/`payhere` and `log`/`smtp` drivers. An order is
only ever marked paid from a signature-verified notification compared in
constant time — never from the browser's return URL.

**SEO.** `sitemap.ts` (92 URLs, built from live rows, no private route ever
listed), `robots.ts`, and Organization/WebSite/BreadcrumbList structured data.
BreadcrumbList is emitted by the `Breadcrumbs` component itself, so it cannot
drift from the trail actually shown.

**The five missing npm scripts.** `db:reset`, `search:reindex`, `staff:create`,
`backup`, `restore` — the destructive ones refuse to run with
`NODE_ENV=production` or against a non-local host without `--force`, all
verified. `search:reindex` exits non-zero under `SEARCH_DRIVER=meilisearch`
rather than reporting success for work it cannot do.

**Staff area.** Separate cookie and session from the storefront. `requireStaff()`
in the shell layout, per-page and per-action permission checks on top, and an
append-only audit row for every mutation. Dispatch converts the reservation into
a real stock decrement with its ledger row inside the status-change transaction
— verified end to end: 51/29 → 50/28, ledger `order_reserved` then
`order_fulfilled`, audit row with actor and `{from,to}`, dispatch email sent.

Three more defects were found and fixed by testing this work:

6. **A scoped promotion would have vanished at checkout.** I rebuilt the priced
   lines in `place-order` with empty brand/category/collection ids, so a
   brand- or category-scoped code would have stopped applying at the final step
   and charged more than the bag displayed. Fixed by having the cart expose the
   exact lines it priced, so there is one derivation rather than two.
7. **The bag badge kept its count after checkout.** `useState(initialCount)`
   reads the prop once, so the cleared cart did not reach the badge until a full
   reload. Fixed by syncing during render — an effect would have reintroduced the
   `set-state-in-effect` cascade this project already fixed once.
8. **Guest checkout was blocked.** My first `proxy.ts` matcher included
   `/checkout`, which would have redirected every guest to sign-in.

Two rate limits were also loosened after they proved too tight for a shared NAT
— checkout 10→30 per 10 min, contact 5→10 per 15 min. Both are IP-bucketed, and
blocking a paying customer at the final step is far worse than letting a script
through a few more times.

---

## 6. Not started

Nothing from the original scope. Deliberately deferred, and noted so they are
not mistaken for oversights:

- The admin catalogue is read-only; a product editor is a much larger surface.
- Meilisearch is a declared driver with no implementation.
- Staff MFA: the columns and `requiresMfa()` exist, the enrolment flow does not.

## 7. Blocked on external input only

Nothing blocks development. These block **production launch**: a real PayHere
merchant ID and secret, real SMTP credentials, an `https://` production domain,
genuine product photography (all current imagery is generated placeholder art),
and legal review of the seeded privacy/terms/returns/cookie copy.
