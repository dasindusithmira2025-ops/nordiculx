# Nordic Lux Full Website Completion Audit

Re-run against **landed code**, a live Postgres, and a full verification sweep:
`format`, `lint`, `typecheck`, `npm test` (212 unit tests), `next build`, and
the complete Playwright suite on **both** the desktop and mobile projects
(197 passed, 5 skipped, 0 failed). Every PASS/FAIL below is backed by a test
that runs, a query that was executed, or a page that was opened — not by
reading the source.

## Executive Summary

```text
Previous functional completion: 74%
New functional completion: 93%

Previous launch readiness: 55%
New launch readiness: 85%
```

The previous audit's headline claim — that the catalogue renders generated
placeholder art — **was wrong**, and the investigation that disproved it also
found a real bug it had masked. Separately, five defects that no test covered
were found and fixed while building the missing operational surfaces; three of
them made features that the previous audit marked COMPLETE actually
non-functional against the real catalogue.

What remains is genuinely external: payment credentials, SMTP credentials, an
HTTPS domain, and legally reviewed copy. These are enumerated in
`PRODUCTION_INPUTS_REQUIRED.md`.

---

## Required reporting

```text
E2E fixture drift: FIXED
Real catalogue imagery: PASS

Admin promotions: PASS
Admin CMS: PASS
Admin customers: PASS
Review submission: PASS
Returns: PASS
Back in stock: PASS
Campaign admin: PASS
Routine admin: PASS
Staff management: PASS
Analytics critical funnel: PASS
Demo operating data: CLEAN
```

---

## Phase 0 — the image contradiction, resolved

**The previous audit was incorrect.** It reported that "every catalogue image
currently resolves to generated imagery" from `scripts/generate-media.ts`.

Evidence gathered:

| Check | Result |
| --- | --- |
| `product_media` rows cross-referenced against `archive/media-provenance.json` | **197/197 present, with a recorded source URL, source domain, retrieval timestamp and SHA-256** |
| Files resolved on disk under `public/media/` | **197/197 present, 0 missing, 0 broken** |
| Provenance origins | `official` 98, `nordic-lux-live` 79, `legacy` 13, `pdf` 7 |
| Filenames written by `generate-media.ts` | Slug-based (`bjork-body-oil.webp`); the catalogue's are **SKU-based** (`sk80ct0145.webp`) |
| `generate-media.ts` reachable from the real catalogue | **No.** It runs only from the demo-catalogue seed path, which `--no-demo-catalogue` skips |

The audit confused the demo fixture files still sitting in
`public/media/products/` with the catalogue's own media rows. They share a
directory and nothing else.

**But the investigation found a real defect.** One product —
`SKIN1004 Madagascar Centella Tone Brightening Capsule Ampoule` (SK80CT0118) —
had **zero** images. `migration/legacy-nordic-lux/scripts/plan.ts` deduplicated
media by file hash **across SKUs**, so the three photographs shared with the
100ml sibling (SK80CT0113) were dropped, leaving that product with nothing. A
second filter rejected images by byte size alone, which threw away eighteen
genuine 1000×1000 studio shots that compress well on flat backgrounds.

Both filters were fixed at the source and the catalogue re-imported:

```text
Real catalogue images:               197 (was 177)
Products with imagery:               87/87  (was 86/87)
Generated placeholder catalogue art: 0
Missing images:                      0
Broken images:                       0
```

---

## Defects found and fixed

Five bugs that no test covered. Three made features the previous audit marked
COMPLETE non-functional against the real catalogue.

1. **The Routine Finder returned an empty routine.** All recommendation rules
   were seeded against demo product slugs, so importing the real catalogue left
   `routine_recommendation_rules` empty — the quiz asked four questions and
   produced nothing. Marked COMPLETE previously. Fixed by deriving rules from
   the catalogue's own classification (`products.routine_step`,
   `suitable_skin_types`, `product_concerns`) in `scripts/routine-rules.ts`;
   161 rules now cover 8 of 10 steps. The two uncovered steps are `fragrance`
   and `wellness`, which the catalogue genuinely has no products for, and the
   admin flags this.

2. **The admin "Publish" button on reviews never worked.** It posted status
   `'published'`; the enum is `'approved'`. Every approval was silently
   rejected by the schema.

3. **Publishing a review never updated the product's rating.** Nothing
   recomputed `products.rating_average` / `rating_count`, which is what the
   listing sorts on and what the PDP's JSON-LD advertises. Both write paths now
   route through one `refreshProductRating`.

4. **Promotions could not be redeemed by anyone.** `applyPromotionCode` existed
   as a server action and **no component called it** — there was no promotion
   code input anywhere on the storefront. The engine was fully implemented and
   completely unreachable.

5. **The E2E suite consumed real stock and filed test orders into the
   operating dataset.** Now isolated in its own database
   (`scripts/e2e-db.ts`).

---

## Phase 1 — E2E fixture drift: FIXED

The previous audit found 7 failing specs. The real number was higher: `shop`,
`content` and `seo` also named demo brands (`kvist`, `halvor-atelier`) that the
real catalogue does not contain.

**Fixed by removing hard-coded fixtures entirely.** `tests/e2e/fixtures.ts`
resolves a buyable product and the live brands from the running storefront, so
the suite follows whatever catalogue is loaded and a merchandising change can
no longer turn it red.

Two deeper isolation problems were fixed at the same time:

- **A dedicated E2E database** (`nordiclux_e2e`), rebuilt per run from the same
  migrations, the same real catalogue import and the same seed. The suite buys
  real products; pointed at the operating database it permanently drained
  stock and filed test orders into the business's own history.
- **Sample orders built from the real catalogue.** The seed's orders named demo
  SKUs; `scripts/seed-sample-orders.ts` builds them from what is actually in
  the catalogue, which is what makes returns and reviews exercisable at all.

```text
Full suite, desktop + mobile: 197 passed, 5 skipped, 0 failed
```

---

## What staff can now do without an engineer

| Surface | Route | Proven by |
| --- | --- | --- |
| Promotions — create, edit, activate, schedule, limit, expire, inspect usage | `/admin/promotions` | `promotions.spec.ts`: a staff-created code discounts a real checkout and shows its usage back |
| Content — homepage, announcements, FAQ, policy pages, navigation | `/admin/content` | `admin-content.spec.ts`: an FAQ entry, an announcement and a policy edit each reach the public site |
| Customers — list, search, spend, order history, addresses | `/admin/customers` | Opened live; read-only by design |
| Returns — queue, approve/reject/progress, refund record | `/admin/returns` | `returns.spec.ts`: request → approve → customer sees the status and note |
| Campaigns — create, schedule, publish, unpublish, end | `/admin/campaigns` | `admin-config.spec.ts`: created, live at its URL, then 404s once ended |
| Routine Finder — question wording, answers, rules, weights | `/admin/routine-finder` | `admin-config.spec.ts`: a reworded question reaches the quiz; invalid rules refused |
| Staff — accounts, roles, permissions, MFA status | `/admin/staff` | `admin-config.spec.ts`: owner sees it, support is refused |

Customer-facing additions: review submission on the PDP, return requests from
an order, back-in-stock subscription, and a promotion code field at checkout.

---

## Feature matrix — changes since the previous audit

| Area | Was | Now | Evidence |
| --- | --- | --- | --- |
| Product photography | BLOCKED (claimed generated) | **COMPLETE** | 197 media rows, all with recorded provenance; 87/87 products |
| Checkout/cart e2e proof | BROKEN | **COMPLETE** | Fixtures resolved at runtime; full suite green on both projects |
| Routine Finder | COMPLETE | **COMPLETE** (was broken) | 161 rules; quiz returns an ordered routine |
| Promotions | PARTIAL | **COMPLETE** | Admin CRUD + storefront redemption + usage reporting |
| Admin CMS | NOT IMPLEMENTED | **COMPLETE** | Five surfaces, each verified against the storefront |
| Admin customers | NOT IMPLEMENTED | **COMPLETE** | `/admin/customers` list + detail |
| Review submission | NOT IMPLEMENTED | **COMPLETE** | Delivered-purchase gate, verified badge derived server-side, moderation, dedupe, rate limit |
| Returns | NOT IMPLEMENTED | **COMPLETE** | Customer request + admin workflow; IDOR-tested |
| Back-in-stock | NOT IMPLEMENTED | **COMPLETE** | Subscribe, dedupe, restock trigger on both admin paths, one-shot notify, tokenised unsubscribe |
| Campaign admin | NOT IMPLEMENTED | **COMPLETE** | Create, schedule, publish, end |
| Routine admin | NOT IMPLEMENTED | **COMPLETE** | Wording + rules, with guards against unusable states |
| Staff management | PARTIAL | **COMPLETE (read-only, by design)** | Roles, permissions, truthful MFA status |
| Analytics | PARTIAL (2 of 11) | **COMPLETE (11 of 11)** | All 11 observed in the database during the E2E run |
| Demo operating data | PARTIAL | **CLEAN** | 0 orders, 0 reviews, 87 real products; `npm run data:cleanup` |
| Review rating aggregate | (undetected bug) | **COMPLETE** | Recomputed on submission and moderation |

Everything the previous audit marked COMPLETE in the storefront core —
homepage, navigation, catalogue, PDP, search, wishlist, cart, checkout, order
confirmation, tracking, account, editorial, WhatsApp, live chat, SEO,
accessibility, security — remains COMPLETE and is still covered by the suite.

---

## Analytics

All 11 declared events are wired and were **observed landing in the database**
during the E2E run:

```text
page_view 339 · product_view 84 · add_to_cart 26 · begin_checkout 24
purchase 16 · routine_finder_complete 8 · routine_finder_start 6
article_view 6 · campaign_view 4 · search ✓ · remove_from_cart ✓
```

Privacy held throughout. Properties carry ids, counts and totals only; the
order reference is in the module's forbidden-key list and never appears. The
one browser-callable entry point (`recordPageView`) accepts a path and nothing
else — an open `trackEvent(name, properties)` endpoint would let anyone write
arbitrary rows under an event name the funnel is measured on.

---

## Operating data

```text
Orders:            0    (was 4 orphaned fictional demo orders)
Reviews:           0    ("No reviews yet" is the honest state)
Products:          87   real, all with real photography
Customer accounts: 3    seeded development accounts on RFC 2606 .test addresses
Stock reserved:    0    reservations released with a ledger entry
```

`npm run data:cleanup` removes demo records conservatively: only orders with no
real-provider payment that are either fully orphaned (null product and variant
ids, SKUs absent from the catalogue) or addressed to an RFC 2606 reserved
domain. It reports before it writes, supports `--dry-run`, and **releases the
stock each removed order had reserved** — without which those units stay locked
against an order that no longer exists and the product silently becomes
unsellable.

---

## Remaining genuine gaps

**External inputs** — see `PRODUCTION_INPUTS_REQUIRED.md`:

1. PayHere merchant credentials. Production refuses to boot on `mock`.
2. SMTP credentials, plus SPF/DKIM/DMARC on the sending domain.
3. An HTTPS production domain. Production refuses a non-`https` `APP_URL`.
4. A freshly generated production `SESSION_SECRET`.
5. Legally reviewed privacy, terms, returns, cookie and shipping copy. The
   pages render and are staff-editable; the words are placeholder and each is
   flagged **Needs legal review** in the admin.
6. Verified per-shipment pricing. Not a blocker by the client's own decision —
   61 of 87 products carry a provisional price and staff update them from
   `/admin/products` when a shipment lands.

**Code gaps, none launch-blocking:**

1. **Staff MFA enrolment.** `requiresMfa()` gates the owner and administrator
   roles and `/admin/staff` reports truthfully that nobody is enrolled, but
   there is no TOTP enrolment or challenge. Role checks are enforced
   server-side on every action regardless. Worth building before the admin is
   used by more than a handful of people.
2. **Meilisearch.** Declared as a driver, never implemented. Postgres full-text
   search is what runs, and it works.
3. **Rich content blocks are not editable from the admin.** The page and
   campaign editors handle prose (headings, paragraphs, lists, quotes,
   callouts, dividers) and **refuse to touch** a body containing an image or
   product-grid block rather than round-trip it through a format that would
   drop it. Adding those blocks still needs an engineer.
4. **No multi-variant product to prove the size selector against.** Every one
   of the 87 live products has exactly one variant. The code and its unit tests
   exist; the E2E assertion skips with a stated reason rather than pretending.
5. **`next build` requires a reachable database**, because `src/app/sitemap.ts`
   queries the catalogue during static export. A deploy-pipeline dependency,
   not a bug.
6. **No tested restore drill.** The backup and restore scripts exist with
   safety guards; nobody has yet restored into a scratch database and confirmed
   the result.

---

## Verification performed

```text
prettier --check      clean
eslint                0 errors (2 warnings, both in an unrelated .tmp scratch script)
tsc --noEmit          clean
vitest run            212 passed / 212
next build            succeeds, all new routes present
playwright (desktop)  passed
playwright (mobile)   passed
                      197 passed, 5 skipped, 0 failed
```

The 5 skips are stated and deliberate: desktop-only filter-rail assertions, the
multi-variant selector with no multi-variant product to exercise, and the
back-in-stock flow, which consumes the catalogue's single out-of-stock product
and has no viewport-specific behaviour to prove twice.

New admin pages were opened in a browser and reviewed after the suite passed.

## Final recommendation

The gap between this codebase and a live shop is now **credentials and legal
copy**, not features. Supply the six items in `PRODUCTION_INPUTS_REQUIRED.md`,
run one sandbox payment end to end, and Nordic Lux staff can operate the
business — merchandising, content, promotions, returns, campaigns and
fulfilment — without an engineer.
