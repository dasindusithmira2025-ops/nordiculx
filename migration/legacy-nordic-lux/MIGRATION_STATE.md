# Migration state — legacy Nordic Lux → new PostgreSQL catalogue

Working memory. Kept short on purpose.

## Source (immutable)

| | |
| --- | --- |
| Repo | https://github.com/thenordiclux-a11y/thnordiclux |
| Branch | `main` |
| Commit | `cc86865c90fe7dd2e78d677720395a7347cfb665` |
| Products | `app/lib/seed-products.ts` — **33 products**, the only catalogue in the tree |
| Media | `public/products/` — 54 files (33 referenced `.jpg`, 21 orphaned `.png`/`.webp`) |
| Vendored at | `archive/source/` (excluded from lint + prettier; never edited) |

Confirmed non-sources: `seed-categories.ts` (6 categories, hot-linked images),
`001_schema.sql` (DDL only), `products-db.ts` (Supabase adapter),
`DataContext.tsx` (client state), `admin/products/page.tsx` (CSV/XLSX import UI,
no bundled data). No JSON/CSV/XLSX/SQL product export exists.

## Target schema (as implemented, not as documented)

- `brands` — slug unique. `products.brandId` NOT NULL.
- `categories` — slug unique, self-referencing tree.
- `products` — `benefits` jsonb string[], `howToUse` text (rendered
  `whitespace-pre-line`), `description` text (split on `\n\n` into paragraphs),
  `ingredientsList` text = full INCI, `suitableSkinTypes` enum[], `routineStep`
  enum, `status` draft|published|archived, `ratingAverage`/`ratingCount`
  denormalised.
- `product_variants` — **price lives here**, integer minor units. `sku` globally
  unique. `salePrice` null = not on sale. `compareAtPrice` exists but no
  storefront code reads it; the storefront reads `salePrice ?? price`.
- `product_media` — `url` + non-null `alt` + `sortOrder`.
- `inventory_items` (`onHand`/`reserved`) + append-only `inventory_movements`.
- Media architecture is local: files under `public/media/products/*.webp`,
  referenced by path. No S3 code path exists in `src/` or `scripts/`.

## Mapping decisions

| Legacy | Target | Note |
| --- | --- | --- |
| `sku` | `product_variants.sku` | Verbatim. The traceability key — legacy SKU ≡ new SKU. |
| `name` | `products.name` | Leading brand prefix stripped (brand is its own column now); original kept in the archive and in `seoTitle`. |
| `brand` | `brands` | Matched on `lowercase + strip non-alphanumeric` so casing/punctuation can never fork a brand. |
| `category` | `categories` | Explicit table below. |
| `price` / `originalPrice` | `price` / `salePrice` | With an original price: `price = originalPrice`, `salePrice = price`. Without: `price = price`, `salePrice = null`. Effective charge always equals the legacy price. |
| `type` | `variant.name` verbatim | `volumeMl` parsed only for an unambiguous single `<n>ml`. |
| `stock` | `inventory_items.onHand` + one `inventory_movements` row | reason `received`, note `legacy_migration_opening_balance`. |
| `description` | `products.excerpt` | Short card copy. |
| `overview` | `products.description` | Long PDP copy. |
| `benefits` | `products.benefits` | Verbatim. |
| `howToUse` + `tips` | `products.howToUse` | Newline-joined; tips appended verbatim as their own lines. |
| `ingredients[]` | `ingredients` + `product_ingredients` | Key ingredients with `concentration`. `ingredientsList` (INCI) left NULL — legacy has no INCI list and one is not invented. |
| `specificationTags` | `suitableSkinTypes` + `product_concerns` | Tables below. Unmapped tags are reported, not dropped silently. |
| `country` | `brands.originCountry` | Only when unanimous across the brand's products (it is: The Ordinary UK, CeraVe USA). |
| `image` | `product_media` + `variant.imageUrl` | Converted to webp under `public/media/products/`. |
| `rating`, `reviews` | **not imported** | No review rows, no provenance anywhere in the legacy repo. Marketing placeholders. |
| `createdAt`/`updatedAt` | **not imported** | `new Date()` at module load; carries no history. |
| `badge: 'Bundle'` | — | Covered by the `Sets & Kits` category; no badge field exists. |

### Categories

`Serums→serums`, `Moisturizers→moisturisers`, `Cleansers→cleansers`,
`Sunscreen→sun-care`, `Body Care→body-care`, `Hair Care→hair-treatments`
(reuse existing rows) — `Treatments→treatments`, `Eye Care→eye-care`,
`Toners→toners`, `Lip Care→lip-care` (created under `skincare`),
`Sets & Kits→sets-kits` (created, top level).

### Skin types

`All Skin Types→all`, `Dry Skin→dry`, `Oily Skin→oily`, `Normal Skin→normal`,
`Combination Skin→combination`, `Sensitive Skin→sensitive`.

### Concerns (existing rows only, no new taxonomy invented)

`Dry Skin→dryness`, `Hydration`/`Dehydrated Skin→dehydration`,
`Sensitive Skin`/`Eczema`/`Soothing→sensitivity`, `Redness→redness`,
`Acne-Prone`/`Blemish Control→blemishes`, `Brightening→dullness + uneven-tone`,
`Anti-Aging`/`Fine Lines→firmness`, `Barrier Repair→barrier-support`.

## Commands

```
npx tsx migration/legacy-nordic-lux/scripts/extract.ts   # phases 1–4, no DB
npm run migrate:legacy-products -- --dry-run             # phase 10, zero writes
npm run migrate:legacy-products                          # phase 12, one transaction
npm run migrate:legacy-products -- --verify              # phase 13
```

## Currency and pricing

The client has confirmed that the storefront should use USD and that product
prices change shipment by shipment. The repeated `$19.99` catalogue/default
price remains a placeholder from the source systems, but it is now accepted as
a temporary operational price so the full catalogue can be published. These
temporary prices are not treated as historically verified retail prices, and
staff can replace them from `/admin/products` as shipments arrive.

## Status

- [x] Phase 1–4 discovery — 33 products, 0 duplicate SKUs, 0 missing images
- [x] Phase 5–7 target schema + mapper
- [x] Phase 8 media migration
- [x] Phase 10–12 dry run + import
- [x] Phase 13 integrity verification
- [x] Phase 15 storefront verification
- [x] Phase 14 derived systems — `search:reindex` (Postgres FTS, no Meilisearch
      driver exists; nothing was faked), sitemap is DB-driven and picked the
      products up automatically
- [x] Phase 16 tests + gates — 169 unit, build 44 routes, E2E green on a reset
      baseline

Outcome: 33/33 imported, published and verified. Zero duplicate SKUs, zero
price/stock/media mismatches. See `reports/FINAL_MIGRATION_REPORT.md`.

Before an E2E gate, run `npm run db:reset -- --seed`, flush Valkey, then
re-run the import — accumulated checkout reservations and `rl:*` rate-limit
keys from earlier E2E runs otherwise fail tests unrelated to the catalogue.

---

# Second migration — full 88-product catalogue (PDF)

The first migration above moved the old website's 33 products. This one takes
the client's own catalogue export as the source of truth and folds that content
into it. See `reports/FINAL_CATALOGUE_REPORT.md`.

## Source (immutable)

| | |
| --- | --- |
| PDF | `archive/source-pdf/Nordic_Lux_Product_Catalogue.pdf` |
| sha256 | `bef2eba27d10e31a28968220011b92558979b4156b84a4a3e23d15aeab00b346` |
| Contents | 24 pages, 88 product cards, 48 embedded JPEGs, 12 section banners |

Parsed with node:zlib + a small ASCII85 decoder — no PDF dependency was added.

## Authority per field

| Field | Source | Note |
| --- | --- | --- |
| SKU, stock, which products exist | PDF | real inventory export |
| price | legacy website only | PDF's `$19.99` × 87 is a default, never imported |
| names, categories | derived | PDF titles are marketplace listings |
| copy, ingredients, usage | legacy → official → PDF | first available wins |
| imagery | official → legacy → PDF | 143 / 14 / 20 |
| ratings, reviews | **none** | all-5-star PDF data has no provenance |

## Key decisions

- **PDF SKU is the catalogue key.** Legacy SKUs were slug-derived; zero overlap.
  The two are linked by the hand-verified `LEGACY_LINKS` table (27 links), not
  by similarity scoring, which cannot separate "SA Smoothing Cleanser" from
  "SA Smoothing Cream" safely.
- **Brand comes from product identity, not the section banner.** 12 banners
  collapse to 11 brands (both Centella banners are SKIN1004; "OTHER" is Purito).
- **Temporary-priced products import as `published`.** The client explicitly
  allows temporary USD prices until shipment prices are updated by staff.
  Provenance is kept in `reports/PRICE_CONFIRMATION_REQUIRED.md`.
- **SK80CT0120 folded into SK80CT0135** (same CeraVe AM SPF50, stock combined).
  SK80CT0136/0138 deliberately *not* merged — uncertain, so kept separate.
- **Media normalised to ≥640px.** Anything narrower is enlarged downstream on
  every request; one sub-640 asset hung the dev image optimiser and broke a
  mobile E2E test. Also drops gallery alternates softer than their primary.

## Commands

```
npx tsx migration/legacy-nordic-lux/scripts/pdf-extract.ts       # parse the PDF
npx tsx migration/legacy-nordic-lux/scripts/official.ts          # harvest brand catalogues (cached)
npx tsx migration/legacy-nordic-lux/scripts/official-browser.ts  # Cetaphil + La Roche-Posay via Playwright
npx tsx migration/legacy-nordic-lux/scripts/enrich.ts            # match products to official pages
npx tsx migration/legacy-nordic-lux/scripts/media-fetch.ts       # build public/media/products
npx tsx migration/legacy-nordic-lux/scripts/plan.ts              # the import plan + counts
npm run migrate:catalogue -- --dry-run                           # zero writes
npm run migrate:catalogue                                        # one transaction, idempotent
npm run migrate:catalogue -- --verify                            # re-read DB, compare
npx tsx migration/legacy-nordic-lux/scripts/audit.ts             # forensic audit (needs the app running)
npx tsx migration/legacy-nordic-lux/scripts/visual-qa.ts         # screenshots + layout defects
```

`official.ts` caches every HTTP response under `archive/official-cache/`, so a
re-run costs nothing. Pass `--refresh` to re-fetch.

## Status

- [x] PDF parsed — 88/88 cards, 88 unique SKUs, 48 images recovered
- [x] Reconciled against legacy + existing DB
- [x] Imagery — 87/87 products, 0 missing, 0 below 640px
- [x] Names, brands, categories normalised
- [x] Content — 87/87 have a description (official 42, legacy 26, PDF 19)
- [x] Imported transactionally, verified 0 missing / 0 mismatches, idempotent
- [x] Forensic audit PASS, visual QA no defects
- [x] Gates — format, lint, typecheck, 205 unit, 77 desktop E2E, 75 mobile E2E, build

Outstanding source-history notes: **61 temporary prices**, **20 pack sizes**,
and one CeraVe pair to confirm — all in
`reports/PRICE_CONFIRMATION_REQUIRED.md`. The temporary prices no longer block
publication.

## Two database states — pick the right one

The dev seed's eight fictional brands were being seeded alongside the real
catalogue, so they showed up on the storefront. `scripts/seed.ts` now accepts
`--no-demo-catalogue`.

```
# The store — real catalogue only. 87 products, 11 brands, 0 reviews.
npm run db:reset -- --seed --no-demo-catalogue
npm run migrate:catalogue
npm run search:reindex

# The E2E fixture — includes the demo catalogue the suite asserts against.
npm run db:reset -- --seed
npm run migrate:catalogue
```

The suite stays on the fixture on purpose: it covers a multi-variant PDP and
the routine finder's rules, neither of which the real catalogue can exercise
yet, and inventing a second variant or a price for a real product to satisfy a
test would be fabricating commercial data.

Flush Valkey between suite runs — checkout, login and admin all share per-IP
rate limits, and stale `rl:*` keys fail tests unrelated to the catalogue.

## Third source — Nordic Lux's own live storefront

`https://thnordiclux.vercel.app` publishes the same catalogue under the same
`SK80CT####` SKUs. It is the best source for everything except price, because
it states the copy Nordic Lux wrote and the image Nordic Lux chose for each
SKU — no identity inference needed.

```
npx tsx migration/legacy-nordic-lux/scripts/live-site.ts [--refresh]
```

Client-rendered and client-paginated, so it is read with Playwright (clicking
Next through the listing) and cached per product under
`archive/live-site-cache/`. Only a complete read is cached, so a page caught
mid-render is retried rather than being baked in as a gap.

| Field | Verdict |
| --- | --- |
| description | **trusted** — 80/87 now come from here, untruncated |
| product image | **trusted** — 79/87 lead with Nordic Lux's own choice |
| "Product type" (size) | **trusted when single-valued** — filled 15 of 20 unknown sizes. Multi-valued entries ("30ml,50ml,100ml") list the range's sizes, not the SKU's, and are ignored |
| stock | **corroborates the PDF on all 87** |
| price | **rejected** — all 87 are `$19.99`, the same default as the PDF |
| country | **rejected** — all 87 say "USA" |
| category | **rejected** — all 87 say "Skin Care" |
| reviews | all show "(0 reviews)" — confirms there is no review data to import |

The price finding is the significant one: the same placeholder on two
independent systems is conclusive, and is recorded in
`reports/PRICE_CONFIRMATION_REQUIRED.md`.
