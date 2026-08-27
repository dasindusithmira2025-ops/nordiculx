# Legacy Nordic Lux — Discovery Report

Ground truth only. Nothing has been fixed, normalised, or imported at this stage.

## Source

| Field | Value |
| --- | --- |
| Repository | https://github.com/thenordiclux-a11y/thnordiclux |
| Branch | main |
| Commit | `cc86865c90fe7dd2e78d677720395a7347cfb665` |
| Product source | `app/lib/seed-products.ts` |
| Media root | `public/products` |
| Generated | 2026-08-18T18:22:16.438Z |

### Sources searched

The whole legacy tree was searched for product-bearing data (`SEED_PRODUCTS`,
product arrays, JSON/CSV/XLSX, SQL inserts, `addProduct`/`addProducts`, SKU
references, image paths). Findings:

| Location | Contains products? | Notes |
| --- | --- | --- |
| `app/lib/seed-products.ts` | **Yes — 33** | The only literal product catalogue in the repository. |
| `app/lib/seed-categories.ts` | No | 6 category records; images are hot-linked manufacturer URLs. |
| `supabase/migrations/001_schema.sql` | No | DDL only — `create table public.products`, zero `insert` statements. |
| `app/lib/products-db.ts` | No | Supabase read/write adapter; falls back to `SEED_PRODUCTS`. |
| `app/contexts/DataContext.tsx` | No | Client state; seeds itself from `SEED_PRODUCTS`. |
| `app/admin/products/page.tsx` | No | CSV/XLSX **import UI**. No bundled data file, no fixtures. |
| `public/products/` | Media | 54 files. |
| `public/images/`, `public/assets/` | No | Site chrome (hero image, hero video). |

No CSV, XLSX, JSON or SQL product export exists anywhere in the legacy tree, so
`seed-products.ts` plus `public/products/` is the complete recoverable catalogue.

## Products

| Metric | Count |
| --- | ---: |
| Products discovered | 33 |
| Unique SKUs | 33 |
| Duplicate SKUs | 0 |
| Missing SKUs | 0 |
| Missing names | 0 |
| Missing brands | 0 |
| Missing categories | 0 |
| Missing prices | 0 |
| Invalid prices (<= 0) | 0 |
| Missing / invalid stock | 0 |
| Missing image reference | 0 |
| Broken image reference (file absent) | 0 |
| Likely duplicate products (brand+name+size) | 0 |
| Products with size/variant label | 33 |
| Products with a sale/original price | 1 |
| Products with structured ingredients | 32 |
| Products with benefits | 33 |
| Products with how-to-use | 33 |
| Products with specification tags | 33 |
| Products carrying rating/review counts | 33 |

### Brands

| Metric | Count |
| --- | ---: |
| CeraVe | 13 |
| The Ordinary | 20 |

### Categories

| Metric | Count |
| --- | ---: |
| Body Care | 2 |
| Cleansers | 7 |
| Eye Care | 3 |
| Hair Care | 1 |
| Lip Care | 1 |
| Moisturizers | 7 |
| Serums | 4 |
| Sets & Kits | 1 |
| Sunscreen | 2 |
| Toners | 1 |
| Treatments | 4 |

### Sizes

| Metric | Count |
| --- | ---: |
| 100ml | 2 |
| 14ml | 1 |
| 15ml | 2 |
| 177ml | 1 |
| 20g | 1 |
| 236ml / 355ml / 473ml | 1 |
| 236ml / 473ml | 4 |
| 236ml | 2 |
| 240ml | 2 |
| 30ml / 100ml | 1 |
| 30ml / 60ml | 1 |
| 30ml | 8 |
| 454g | 1 |
| 50ml / 150ml | 1 |
| 52ml | 2 |
| 60ml | 1 |
| 85g / 144g | 1 |
| Set | 1 |

## Media

| Metric | Count |
| --- | ---: |
| Files in public/products | 54 |
| Image paths referenced by products | 33 |
| Referenced files present | 33 |
| Referenced files missing | 0 |
| Orphaned files (present, unreferenced) | 21 |
| Exact duplicate groups (by sha256) | 1 |
| Redundant duplicate files | 7 |

### File types

| Metric | Count |
| --- | ---: |
| jpg | 33 |
| png | 20 |
| webp | 1 |

### Exact duplicate groups

- `/products/to-acne-set.png`, `/products/to-nmf-betaglucan-100.png`, `/products/to-nmf-phytoceramides-100.png`, `/products/to-retinol-05-30.png`, `/products/to-salicylic-body-240.png`, `/products/to-soothing-barrier-30.png`, `/products/to-squalane-lip-balm-15.png`, `/products/to-uv-spf45-30.png`
### Orphaned files

Present on disk, referenced by no product:

- `/products/to-acne-set.png`
- `/products/to-aha-bha-peel-30.png`
- `/products/to-azelaic-30.png`
- `/products/to-caffeine-30.png`
- `/products/to-glycolic-toner-240.png`
- `/products/to-ha-b5-30.png`
- `/products/to-ha-b5-ceramides-30.png`
- `/products/to-multi-peptide-eye-15.png`
- `/products/to-multi-peptide-hair-60.png`
- `/products/to-niacinamide-30.png`
- `/products/to-niacinamide-30.webp`
- `/products/to-niacinamide-powder.png`
- `/products/to-nmf-betaglucan-100.png`
- `/products/to-nmf-ha-30.png`
- `/products/to-nmf-phytoceramides-100.png`
- `/products/to-retinol-05-30.png`
- `/products/to-salicylic-body-240.png`
- `/products/to-soothing-barrier-30.png`
- `/products/to-squalane-cleanser-50.png`
- `/products/to-squalane-lip-balm-15.png`
- `/products/to-uv-spf45-30.png`

## Data-quality observations

These are recorded, not acted on.

1. **Currency.** Legacy prices are plain decimals (`8.90`) rendered as
   `${price.toFixed(2)}` in `app/components/ProductCard.tsx`, i.e. a dollar
   sign. The new application's money unit is LKR minor units. The numeric
   values are preserved exactly; no exchange rate is applied and none is
   invented. See MIGRATION_STATE.md § Open question — currency.
2. **Ratings and reviews.** Every product carries a rating and a review count
   (e.g. 4.7 / 2840) with no underlying review rows anywhere in the legacy
   repository and no provenance. They are marketing placeholders, so they are
   **not** imported as genuine customer feedback.
3. **`createdAt` / `updatedAt`** are `new Date().toISOString()` evaluated at
   module load, so they carry no historical information and are not migrated.
4. **Structured `ingredients`** are key-ingredient highlights with
   percentages, not INCI lists. They map to key ingredients; the full INCI
   field is left empty rather than filled with a partial list.
5. **Legacy category images** are hot-linked manufacturer URLs and are not
   migrated.
