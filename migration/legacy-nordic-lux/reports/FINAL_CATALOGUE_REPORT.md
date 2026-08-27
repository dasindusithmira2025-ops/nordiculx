# Nordic Lux — full catalogue migration

Completion report for the 88-product catalogue supplied as
`Nordic_Lux_Product_Catalogue.pdf` (sha256
`bef2eba27d10e31a28968220011b92558979b4156b84a4a3e23d15aeab00b346`, archived at
`archive/source-pdf/`).

This is the second migration into this database. The first moved 33 products
from the old website; that work is reported separately in
`FINAL_MIGRATION_REPORT.md` and is superseded by this one, which treats the
PDF as Nordic Lux's own inventory export and folds the old site's content into
it.

---

## Numbers

```
PDF products expected:                    88
Products accounted for:                   88 / 88
  resolved and imported                   87
  duplicate confirmed and merged           1   (SK80CT0120 → SK80CT0135)
Products imported:                        87

Public placeholders:                       0
Missing product images:                    0
Broken product images:                     0
Unresolved product identities:             0
Duplicate SKUs:                            0
Duplicate slugs:                           0
Duplicate brands:                          0

Products with verified legacy pricing:     26
Products using temporary USD pricing:       61   (client-approved operational prices)
Stock mismatches:                          0
Total stock units migrated:               124   (matches the PDF exactly)

External official product pages used:      60
Nordic Lux live-site pages read:          87
External images recovered:                207
Fake reviews imported:                      0
Fake ratings imported:                      0
```

Brands: 11 · Categories: 12 · Media rows: 177
(local product media with provenance retained)

---

## What the sources actually were

| Source | Trusted for | Not trusted for |
| --- | --- | --- |
| **Nordic Lux's live site** (87 rows) | per-SKU imagery, descriptions, pack size | price, country, category — all system defaults |
| **The PDF** (88 rows) | which products exist, SKU, stock, brand sections | price, ratings, names, descriptions |
| **Legacy repo** (33 rows) | long-form copy, benefits, ingredients, usage, price | identity — its SKUs were slug-derived and synthetic |
| **Manufacturer sites** (7 domains) | canonical names, descriptions, imagery, ingredients | price, stock |

### Nordic Lux's own storefront

`thnordiclux.vercel.app` turned out to publish the same catalogue, keyed by the
same `SK80CT####` SKUs, and it is the best source available for everything
except price — because for each SKU it states the description Nordic Lux wrote
and the photograph Nordic Lux chose. That removes the identity inference
entirely: the manufacturer-matching pass had to *prove* a page was the same
product, whereas here the retailer has already said so.

It is client-rendered and paginates client-side, so it is read with local
Playwright and cached per product; a re-run costs nothing.

What it changed:

- **79 of 87 products now lead with Nordic Lux's own product image** (was: 0).
- **80 of 87 descriptions are now Nordic Lux's own copy**, untruncated.
- **15 of the 20 unknown pack sizes were filled** from its "Product type"
  field. The other five list the sizes of the whole *range*
  ("30ml,50ml,100ml") rather than that SKU's, so they are not evidence about
  the line and remain on the confirmation list rather than being guessed.

What it confirmed, and this is the important part:

- **Every one of its 87 prices is `$19.99`.** The same default as the PDF, on a
  second independent system. That is now conclusive: the figure is a
  placeholder, not a selling price.
- **Its stock counts agree with the PDF on all 87 products**, which
  cross-validates the inventory figures completely.
- **Every product shows "(0 reviews)".** Nordic Lux's own storefront has no
  review data either, so the PDF's uniform five stars were never real, and
  showing "No reviews yet" matches what they publish today.

Three properties of the PDF drove most of the work:

1. **Price is a default, not a price.** `$19.99` appears on 87 of 88 rows and
   `$99.9` on the last one. A single value repeated across a whole catalogue
   carries no commercial authority, so none of it was imported.
2. **Every rating is five stars.** No review provenance exists anywhere, so no
   review rows and no rating aggregates were created. Products display
   "No reviews yet".
3. **Descriptions are cut mid-word** by the layout engine ("…and leave sk").
   Where a PDF blurb was the only copy available it was trimmed back to its
   last complete sentence, so nothing is shown mid-word.

40 of the 88 rows printed `[ No Image ]`. All 40 now have imagery.

---

## How each field was resolved

**Identity.** The PDF SKU (`SK80CT####`) is the catalogue key — these are the
numbers on Nordic Lux's picking slips, with real per-line stock. The legacy
site's SKUs were derived from its own slugs and had zero overlap, so the two
catalogues were linked by a hand-verified table
(`scripts/canonical.ts` → `LEGACY_LINKS`, 27 links) rather than by similarity
scoring. Scoring could not safely separate "SA Smoothing Cleanser" from "SA
Smoothing Cream" (different products) while still matching "Renewing Salicylic
Acid Cleanser" to "SA Smoothing Cleanser" (one product, two market names).

**Brand.** The PDF prints 12 all-caps section banners, but a banner is a
section, not a brand: "CENTELLA" and "MADAGASCAR CENTELLA" are both SKIN1004's
Madagascar Centella range, "ORDINARY" contains one SKIN1004 product, and
"OTHER" is a single Purito item. Brand is therefore read from the product
identity, with the banner as fallback — giving 11 real brands. Casing and
punctuation are folded to one key so `LA ROCHE POSAY` / `La Roche Posay` /
`La Roche-Posay` cannot fork into three records.

**Names.** Source titles are marketplace listings written for search. Batch and
expiry text (`EXP 01/27`, `SEALED NIB`, `Brand New`) is stripped rather than
baked into a permanent title; keyword tails are cut at the pack size (which
belongs on the variant); shouted titles are title-cased; and a small table of
unambiguous source typos is corrected (`Moistursing`, `Madagaskar`,
`Hari Food`, `Gel-Crem`).

**Category.** The PDF files 87 of 88 products under one label, "Skin Care",
which carries no shelf information, so category is derived from the product
identity. The Ordinary's range needed a specific rule: it names most products
as "<active> <strength>" with no format word at all, and those are serums.

**Price.** Only the legacy website's own prices have historical provenance.
The client has since clarified that prices change shipment by shipment and that
temporary USD prices are acceptable until staff update them. The 61 products
without legacy prices are therefore imported as **published** with temporary
operational USD prices. See `PRICE_CONFIRMATION_REQUIRED.md`.

**Stock.** Taken from the PDF inventory export and written through the stock
ledger as an auditable opening balance
(`legacy_migration_opening_balance`), never as a silent overwrite. The merged
duplicate's stock was added to the row that was kept, so no inventory was lost:
the migrated total is 124, exactly the PDF's.

---

## Imagery

| Source | Images | How it was used |
| --- | --- | --- |
| Nordic Lux's live site | 79 | primary — their own choice per SKU |
| Manufacturer sites | 108 | primary where the live site had none, else gallery |
| Legacy repo | 13 | Nordic Lux's own existing assets |
| PDF embedded JPEGs | 7 | backstop where nothing better exists |

The PDF's 48 embedded product photographs were recovered by decoding its
image XObjects directly (ASCII85 + DCT), and mapped to products through each
page's `/Resources /XObject` dictionary and draw order — not by guessing from
position.

Everything is downloaded, hashed, deduplicated, re-encoded to webp q82 and
stored under `public/media/products/`. **No manufacturer URL is hot-linked.**
Provenance for every asset — source URL, domain, retrieval date, content hash —
is recorded in `archive/media-provenance.json` so usage rights can be reviewed.
Public availability is not a licence, and 143 of these images are the
manufacturers' own photography.

### Not guessing the product

A wrong photograph is worse than no photograph, so a manufacturer page is only
accepted as a match when it clears a weighted-token threshold, beats its runner
up by a margin, agrees on any strength stated (%/SPF), and does not differ by a
variant modifier. That last rule matters: it is what stops
"Anthelios UVMune 400 Invisible Fluid" from being illustrated with the
**Tinted** Fluid, and "CeraVe Moisturizing Cream" from being illustrated with
**Baby** Moisturizing Cream. Both were caught and rejected.

Nine products whose brands block automated access or whose own titles differ
from the listing were resolved individually against the manufacturer's page,
each recorded with its evidence in `scripts/manual-sources.ts`. Cetaphil and
La Roche-Posay were read with local Playwright because they render client-side
and answer scripted requests with 403 — no paid service was used anywhere in
this migration.

---

## Verification

`npm run migrate:catalogue -- --verify` re-reads the database and compares every
row against the plan: name, slug, brand, category, variant, price, status,
stock, media count and alt text.

```
expected rows: 87 · found: 87 · missing: 0 · mismatches: 0
```

The importer is idempotent and transactional. A second run reports
`0 inserted, 87 updated, 0 inventory movements` — prices and copy update in
place, stock is not double-counted.

A forensic audit (`scripts/audit.ts`) checks the database *and* the served
storefront for placeholder text, missing or corrupt image files, empty alt
text, duplicate SKUs or brands, batch text in names, truncated copy, fabricated
ratings, published rows without a price, and unreachable product URLs.

```
Auditing 87 migrated catalogue products
Image files verified: 177 · Routes checked: 38 (38 OK)
PASS — no failures.
```

---

## Storefront

| Surface | Result |
| --- | --- |
| Shop | PASS |
| PDP | PASS |
| Mobile PDP | PASS |
| Brands | PASS |
| Categories | PASS |
| Filters | PASS |
| Search | PASS (Postgres FTS reindexed; no Meilisearch driver exists and none was faked) |

Visual QA screenshots 9 pages × 2 viewports, choosing the sample from the
database so it always covers the awkward cases — longest name, most images,
single image, out of stock, longest ingredient list — and checks for horizontal
overflow, broken images and clipped text. `reports/visual-qa.md`:
**no layout defects**.

### One UI defect found and fixed

Real data exposed a genuine problem: 47 of the imported assets were narrower
than 640px, which is the widest variant a product card requests at mobile
device-pixel-ratio. Those images were being enlarged downstream on every
request — softer cards, and on the dev image optimiser one particular asset
hung the homepage `load` event outright, failing a mobile E2E test.

Fixed in the media pipeline rather than per product: every asset is now
normalised to at least 640px with a lanczos kernel, and a gallery alternate
that is softer than the shot beside it is dropped rather than shipped. Result:
0 assets below 640px, media rows 203 → 177, mobile suite green, and the mobile
run got ~40% faster.

---

## Quality gates

| Gate | Result |
| --- | --- |
| format | PASS |
| lint | PASS (0 errors, 5 warnings) |
| typecheck | PASS |
| unit tests | PASS — 205 passed (169 before, +36 for this migration) |
| desktop E2E | PASS — 77 passed |
| mobile E2E | PASS — 75 passed, 2 intentional skips |
| production build | PASS |

The 36 new tests cover the PDF decoder, card parsing (including the regression
where a rating run leaked into the next product's name), brand and name
normalisation, batch/expiry stripping, size parsing and fl-oz equivalence,
category rules, duplicate keys, and the match-safety rules for strength and
variant modifiers.

Run E2E the way the notes in `MIGRATION_STATE.md` describe — reset and seed,
flush Valkey, re-import. The login and admin specs share a per-IP rate limit,
and stale `rl:*` keys from an earlier run will fail tests that have nothing to
do with the catalogue.

---

## What remains, and why

**61 products use temporary shipment pricing.** This remains a source-history
fact: the PDF's price column is a default, the old website covers only 26 of
these products, and a manufacturer's price is not Nordic Lux's price. The client
has approved temporary USD prices, so these products are now published and staff
replace prices in the backend when shipment pricing arrives.

The same file also lists **20 products whose pack size is not printed** in the
catalogue, and **one pair of CeraVe listings** that may be a single product in
two packs — deliberately not merged, because merging an uncertain pair destroys
a real inventory line.

---

## The demo catalogue is out of the store

The repo ships a development seed containing eight fictional brands
(Björk & Linden, KVIST, Halvør Atelier, SUND Copenhagen and the rest). It is
labelled sample data and refuses to run against production, but it was still
being seeded into the same database as the real catalogue, so those products
appeared on the storefront alongside it. They are gone.

`scripts/seed.ts` now takes `--no-demo-catalogue`, which seeds everything
except the fictional brands and products — taxonomy, concerns, ingredients,
editorial, navigation, staff, customers and sample orders all still land, so
the application is fully exercisable, but the catalogue is left empty for the
real one to be imported into. Every product-dependent fixture in the seed was
already written to skip missing products, so nothing else had to change.

**The database a client sees:**

```
npm run db:reset -- --seed --no-demo-catalogue
npm run migrate:catalogue
npm run search:reindex
```

That is the state this work leaves the database in: **87 products, 11 brands,
0 reviews — every row a real Nordic Lux product.** The audit confirms it:
`Auditing 87 migrated catalogue products (of 87 total)`.

**The database the E2E suite needs** is the one with the fixture:

```
npm run db:reset -- --seed        # includes the demo catalogue
npm run migrate:catalogue
```

The suite is kept on the fixture deliberately. It asserts on things the real
catalogue cannot exercise yet — a product with two size variants, and the
routine finder's recommendation rules — and the honest way to cover those is a
fixture, not a second variant and a made-up price invented for a real product.
Both suites pass against it (77 desktop, 75 mobile + 2 skips).

One piece of seed copy was factually wrong once the brand list became real:
the homepage brand section was headed "Eight studios, deliberately". It now
reads "Chosen, not collected" — a count baked into editorial goes stale the
moment the catalogue changes.
