# Final migration report — legacy Nordic Lux → new PostgreSQL catalogue

All 33 legacy products are accounted for, imported, published and verified
against the source. No duplicate SKUs, no price mismatches, no stock
mismatches, no missing images.

One item needs a client decision before the catalogue is treated as
retail-ready: **the currency of the legacy prices** (§ Open question).

## Source

| | |
| --- | --- |
| Repository | https://github.com/thenordiclux-a11y/thnordiclux |
| Branch | `main` |
| Commit | `cc86865c90fe7dd2e78d677720395a7347cfb665` |
| Catalogue | `app/lib/seed-products.ts` |
| Media | `public/products/` |

The legacy repository was cloned read-only into a scratch directory and never
modified, committed to, or pushed. The files the migration depends on are
vendored under `archive/source/`, so every step reruns without network access.

## Discovery

The entire legacy tree was searched for product-bearing data. `seed-products.ts`
is the only catalogue: `001_schema.sql` is DDL with zero inserts,
`products-db.ts` is a Supabase adapter that falls back to `SEED_PRODUCTS`,
`DataContext.tsx` is client state, and `admin/products/page.tsx` is a CSV/XLSX
import UI with no bundled data. No JSON, CSV, XLSX or SQL export exists.

| | |
| --- | ---: |
| Products found | 33 |
| Unique SKUs | 33 |
| Duplicate SKUs in source | 0 |
| Missing prices / brands / categories / images | 0 |
| Media files found | 54 |
| Media files referenced by products | 33 (all present) |
| Orphaned media files | 21 |
| Byte-identical duplicate files | 8 in one group |

Full breakdown: `reports/discovery-report.md`.

## Migration

| | |
| --- | ---: |
| Imported | **33** |
| Published | 33 |
| Draft / review | 0 |
| Skipped (INVALID) | 0 |
| Failed | 0 |

Dry run (`--dry-run`) reported 33 READY / 0 REVIEW / 0 INVALID with zero
catalogue writes before anything was imported: `reports/dry-run-report.md`.

The import runs inside a single `db.transaction`, and every write helper takes
the transaction handle explicitly, so a failure anywhere rolls back every
product, variant, media row and stock movement together.

**Idempotency** is keyed on the legacy SKU, which is unique in both schemas.
Observed across four runs: first run `33 inserted / 0 updated`, second run
`0 inserted / 33 updated`, row counts unchanged.

## Integrity

Verified programmatically against the database, not asserted
(`npm run migrate:legacy-products -- --verify`, output in
`reports/post-import-comparison.md`).

| Check | Result |
| --- | ---: |
| Products compared | 33 |
| Missing from database | **0** |
| Duplicate SKUs | **0** |
| Price mismatches | **0** |
| Stock mismatches | **0** |
| Media mismatches | **0** |
| Name / brand / category / variant / publish-status mismatches | **0** |

Compared per product: name, brand, category, variant label, effective price
(`salePrice ?? price`), the legacy list price, the struck-through original
price, stock on hand, media row count and publish status.

## Database

| | |
| --- | ---: |
| Brands created | 2 (The Ordinary, CeraVe) |
| Brands reused | 0 — neither existed |
| Categories created | 5 (`treatments`, `eye-care`, `toners`, `lip-care`, `sets-kits`) |
| Categories reused | 6 (`serums`, `moisturisers`, `cleansers`, `sun-care`, `body-care`, `hair-treatments`) |
| Variants created | 33 (one per legacy SKU) |
| Inventory items | 33 |
| Inventory movements | 33 opening balances |
| Concern links | 62 |
| Key-ingredient links | 107 |
| Ingredients created | 43 |
| Audit rows | 1 per run, `catalogue.legacy_migration`, carrying the source commit |

Brands are matched on a normalised key (lowercase, punctuation and spacing
stripped), so "CeraVe", "Cerave" and "cera ve" resolve to one row and a brand
cannot fork into duplicates.

Stock was written as an opening balance through the ledger — an
`inventory_movements` row per variant, `referenceType: legacy_migration`,
`referenceId:` the legacy SKU, note `legacy_migration_opening_balance` — never
as a silent overwrite. A re-run whose legacy stock differs writes a second
`stock_take` movement rather than moving the number without explanation.

Money is stored as integer minor units throughout. No floating-point value ever
reaches a price column.

## Media

| | |
| --- | ---: |
| Images migrated | 33 |
| Converted to `.webp` | 33 (2,009,588 → 928,806 bytes) |
| Byte-identical duplicates among migrated files | 0 |
| Missing images | 0 |
| External enrichment used | **none** |

Files were copied into the application's own media architecture
(`public/media/products/*.webp`, referenced by `product_media.url` and
`product_variants.imageUrl`). Nothing points at the legacy repository and no
manufacturer site is hot-linked. The source→target map with content hashes is
`archive/media-source-map.json`.

The 21 orphaned `.png`/`.webp` files were not migrated: they are unreferenced,
superseded by the `.jpg` photography added in the final legacy commit, and 8 of
them are the same placeholder image byte for byte.

## Not imported, by design

| Legacy field | Why |
| --- | --- |
| `rating`, `reviews` (all 33 products) | No review rows exist anywhere in the legacy repository and there is no provenance. Importing 2,840 "reviews" as genuine customer feedback would be a fabrication. Products show "No reviews yet". |
| `createdAt`, `updatedAt` | `new Date()` evaluated at module load — no historical information. |
| `badge: 'Bundle'` | No badge field in the target schema; the `Sets & Kits` category carries the same meaning. |
| Full INCI list | Legacy has key-ingredient highlights, not an INCI list. `ingredientsList` is left empty rather than filled with a partial one. |
| 26 legacy filter tags | No honest equivalent in the current taxonomy (`Keratosis Pilaris`, `Dark Circles`, `Puffiness`, `SPF 45`…). Listed in `reports/dry-run-report.md`; creating taxonomy for them is a client content decision. All are preserved verbatim in `archive/legacy-products.json`. |

## Verification

| Gate | Result |
| --- | --- |
| `npm run format:check` | pass |
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm test` | **169 passed** (142 pre-existing + 27 new migration tests) |
| `npm run build` | pass, 44 routes |
| `npx playwright test` | **148 passed, 2 skipped, 2 failed** — both failures reproduce without the migration, see § E2E |
| Database comparison | 33/33, zero mismatches |

### Storefront

Checked against the running application, not against JSX:

- All **33** product pages return 200 and render name, brand, price, size,
  stock, description, benefits, how-to-use and key ingredients.
- All **33** migrated image URLs return 200 through `/media/products/…`.
- Homepage, `/shop`, `/brands/the-ordinary`, `/brands/cerave`, the five new
  category pages, `/concern/blemishes`, brand-filtered shop, `/api/search`
  and `/sitemap.xml` (132 URLs) all include migrated products.
- Facets are correct: brand counts (CeraVe 13, The Ordinary 20), category
  counts, concern counts and the price range.

Visual sample (`.screenshots/`), chosen to cover the edge cases rather than
33 near-identical pages:

| Case | Result |
| --- | --- |
| Sale product (`TO-ACNE-SET`) | `-23%` badge, LKR 29.90 with LKR 38.60 struck through |
| Unusual characters (`Niacinamide 10% + Zinc 1%`) | renders in heading, slug, breadcrumb and JSON-LD |
| Long title (`Hyaluronic Acid 2% + B5 (with Ceramides)`) | wraps cleanly on card and PDP |
| Missing optional fields (acne set has no ingredients) | "Key ingredients" section omitted, no empty block |
| Low stock | "Only 2 left" / `LOW STOCK` badge |
| Newly created category (`Sets & Kits`) | renders with working facets |
| Brand with no story or hero image | degrades cleanly, no empty section |
| Mobile PDP | full render including unit price ("LKR 2.97 / 10ml") |

No systemic UI bug was exposed, so no component needed changing.

### E2E

Final run on a reset, re-seeded, re-migrated database with Valkey flushed:

```
148 passed, 2 skipped, 2 failed  (152 total, 2.4m)
  [mobile] account.spec.ts:47  a wrong password is rejected without revealing the account exists
  [mobile] account.spec.ts:150 one customer cannot read another customer's order
```

**Every catalogue-touching spec passes** — `shop`, `seo`, `checkout`,
`content`, `routine` and `admin` are green on both projects.

The two failures are a **pre-existing flake in `account.spec.ts`, not a
migration regression**. Evidence:

- Both tests **pass in isolation**, with the migration applied
  (`-g "one customer cannot read" --project=mobile` → 1 passed, 6.6s).
- Running the same spec file on a database with **no migrated products at all**
  (`db:reset --seed`, 27 seed products) also fails one of its tests
  (`account.spec.ts:47`) — same spec, same cause, migration absent.
- Cause: sign-in is rate limited per IP (`rl:signin:*` in Valkey). The desktop
  and mobile projects run in parallel from the same address, so this
  sign-in-heavy spec races itself. Which of its tests loses the race varies
  between runs; the failure mode is a 45s timeout waiting for the sign-in form.
- Neither test loads a product, a category, a brand or a price.

Two earlier rounds of failures were investigated and also traced to accumulated
environment state rather than the catalogue:

1. `shop.spec.ts` variant tests failed because `HAL-BHS-030` — a **seed**
   product the migration never touches — had `on_hand 50 / reserved 50` from
   51 units of prior E2E checkout orders. With the default variant unsellable
   the PDP auto-selected the 50ml, and the test's `getByText('50ml')` matched
   both the legend and the label. Gone after a reset.
2. `register`, `order-lookup` and `contact` failed on the same per-IP rate
   limiting. Gone after a Valkey flush.

Run `npm run db:reset -- --seed`, flush Valkey and re-run the import before
using E2E as a gate.

## Repairs made outside the catalogue

Two small fixes were required because they blocked verification. Both are
build tooling, neither changes application behaviour or weakens a guard:

- `scripts/reset.ts` and the `db:seed` script now pass
  `--conditions=react-server` to `tsx`. `seed.ts` reaches
  `@/lib/db → @/lib/env → server-only`, whose default entry point throws by
  design; under Node 24 without that condition `npm run db:seed` and
  `npm run db:reset -- --seed` both crashed. The `server-only` guard itself is
  untouched — the migration importer builds its own client rather than
  weakening it, exactly as `scripts/migrate.ts` already did.
- `.prettierignore` and `eslint.config.mjs` exclude
  `migration/legacy-nordic-lux/archive/**`, so the verbatim legacy snapshot is
  never reformatted.

## Open question — currency (client decision, not a blocker)

Legacy prices are plain decimals (`8.90`, `29.90`) rendered with a **dollar
sign** by `app/components/ProductCard.tsx`. The new application's money unit is
**LKR minor units**.

The numeric values were preserved exactly — `8.90 → 890` minor units, shown as
**LKR 8.90**. No exchange rate was applied, because inventing one would
silently alter all 33 prices, and the mandate is explicit that Nordic Lux
pricing is authoritative and must never be quietly changed.

The effect is visible on `/shop`, where migrated products sit at LKR 6.90–29.90
next to existing products at LKR 6,800–16,500. **Until the client confirms the
intended currency, the migrated catalogue should not be treated as
retail-ready.**

If a conversion is confirmed, it is one constant in
`migration/legacy-nordic-lux/scripts/map.ts` plus a re-run — the importer is
idempotent and updates prices in place.

## Remaining review

No product is unresolved. Three items are noted for the client, none blocking:

1. **Currency** — above.
2. **Nine multi-size labels** (`236ml / 473ml`, `30ml / 100ml`, `85g / 144g`…).
   Legacy holds one price, one SKU and one stock figure for each, so they were
   imported as a single variant with the label kept verbatim, exactly as the
   legacy site sold them. Splitting them into real variants needs per-size
   prices, SKUs and stock the legacy data does not contain. Flagged per SKU in
   `reports/dry-run-report.md`.
3. **Header navigation** — the five new categories are reachable at
   `/category/<slug>`, from shop facets and from breadcrumbs, but the header
   menu is driven by the separate CMS-curated `navigation_items` table.
   Adding them is a merchandising placement decision (which group, what order),
   so it was left to the client rather than guessed at.

Editorial content that legacy simply never had — brand stories, brand and
category hero imagery, concern guidance copy, full INCI lists — remains empty
and is a client-supplied production input.

## Artifacts

```
migration/legacy-nordic-lux/
  MIGRATION_STATE.md
  archive/
    source/                     vendored legacy files (never edited)
    legacy-products.json        immutable snapshot, 33 products
    legacy-media-manifest.json  54 files, hashes, references
    media-source-map.json       source → target with content hashes
    media/products/             the legacy image files
  reports/
    discovery-report.md
    dry-run-report.md
    post-import-comparison.md
    FINAL_MIGRATION_REPORT.md
  scripts/
    extract.ts   phases 1–4, no database
    map.ts       the single mapping implementation, pure and tested
    media.ts     phase 8
    import.ts    phases 10–13
tests/unit/legacy-migration.test.ts   27 tests
```

## Commands

```
npx tsx migration/legacy-nordic-lux/scripts/extract.ts   snapshot + discovery
npm run migrate:legacy-products -- --dry-run             zero writes
npm run migrate:legacy-products                          one transaction
npm run migrate:legacy-products -- --verify              compare DB to source
```
