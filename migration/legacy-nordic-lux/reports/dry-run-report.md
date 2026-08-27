# Dry-run report — legacy Nordic Lux catalogue

Generated 2026-08-20T10:39:20.278Z. **No catalogue rows were written.**

Source: `https://github.com/thenordiclux-a11y/thnordiclux@cc86865c90fe7dd2e78d677720395a7347cfb665` → `app/lib/seed-products.ts`

## Outcome

| Metric | Count |
| --- | ---: |
| Products discovered | 33 |
| READY (import + publish) | 33 |
| REVIEW (import as draft) | 0 |
| INVALID (not imported) | 0 |
| Already in database (would update) | 33 |
| New to database (would insert) | 0 |

## Data issues

| Metric | Count |
| --- | ---: |
| Duplicate SKUs | 0 |
| Missing images | 0 |
| Missing prices | 0 |
| Missing brands | 0 |
| Missing categories | 0 |

## Reference data

| Metric | Count |
| --- | ---: |
| Brands reused | 2 |
| Brands to create | 0 |
| Categories reused | 11 |
| Categories to create | 0 |
| Ingredients to create | 0 |

- Brands to create: —
- Categories to create: —

## Media

| Metric | Count |
| --- | ---: |
| Legacy images referenced | 33 |
| Converted to webp | 33 |
| Byte-identical duplicates | 0 |
| Source bytes | 2,009,588 |
| Output bytes | 928,806 |

## Pricing to be written

| SKU | Legacy | List (minor units) | Sale (minor units) | Effective |
| --- | ---: | ---: | ---: | ---: |
| `TO-NIACINAMIDE-30` | 8.90 | 890 | — | 8.90 |
| `TO-NIACINAMIDE-POWDER` | 6.90 | 690 | — | 6.90 |
| `TO-CAFFEINE-30` | 7.90 | 790 | — | 7.90 |
| `TO-HA-B5-CERAMIDES-30` | 10.90 | 1090 | — | 10.90 |
| `TO-HA-B5-30` | 9.90 | 990 | — | 9.90 |
| `TO-SALICYLIC-BODY-240` | 12.90 | 1290 | — | 12.90 |
| `TO-GLYCOLIC-TONER-240` | 11.90 | 1190 | — | 11.90 |
| `TO-AZELAIC-30` | 9.90 | 990 | — | 9.90 |
| `TO-NMF-HA-30` | 8.90 | 890 | — | 8.90 |
| `TO-NMF-PHYTOCERAMIDES-100` | 10.90 | 1090 | — | 10.90 |
| `TO-NMF-BETAGLUCAN-100` | 10.90 | 1090 | — | 10.90 |
| `TO-SQUALANE-CLEANSER-50` | 9.90 | 990 | — | 9.90 |
| `TO-SQUALANE-LIP-BALM-15` | 6.90 | 690 | — | 6.90 |
| `TO-AHA-BHA-PEEL-30` | 10.90 | 1090 | — | 10.90 |
| `TO-RETINOL-05-30` | 8.60 | 860 | — | 8.60 |
| `TO-MULTI-PEPTIDE-EYE-15` | 14.90 | 1490 | — | 14.90 |
| `TO-MULTI-PEPTIDE-HAIR-60` | 18.90 | 1890 | — | 18.90 |
| `TO-UV-SPF45-30` | 12.90 | 1290 | — | 12.90 |
| `TO-SOOTHING-BARRIER-30` | 11.90 | 1190 | — | 11.90 |
| `TO-ACNE-SET` | 29.90 | 3860 | 2990 | 29.90 |
| `CV-MOISTURIZING-CREAM-454` | 18.90 | 1890 | — | 18.90 |
| `CV-MOISTURIZING-LOTION-236` | 14.90 | 1490 | — | 14.90 |
| `CV-FACIAL-LOTION-PM-52` | 13.90 | 1390 | — | 13.90 |
| `CV-FACIAL-LOTION-AM-SPF50-52` | 15.90 | 1590 | — | 15.90 |
| `CV-EYE-REPAIR-CREAM-14` | 12.90 | 1290 | — | 12.90 |
| `CV-ADVANCED-REPAIR-OINTMENT-85` | 11.90 | 1190 | — | 11.90 |
| `CV-CREAM-TO-FOAM-CLEANSER-236` | 12.90 | 1290 | — | 12.90 |
| `CV-FOAMING-CLEANSER-236` | 11.90 | 1190 | — | 11.90 |
| `CV-HYDRATING-CLEANSER-236` | 11.90 | 1190 | — | 11.90 |
| `CV-FOAMING-OIL-CLEANSER-236` | 13.90 | 1390 | — | 13.90 |
| `CV-BLEMISH-CONTROL-CLEANSER-236` | 12.90 | 1290 | — | 12.90 |
| `CV-SA-SMOOTHING-CLEANSER-236` | 12.90 | 1290 | — | 12.90 |
| `CV-SA-SMOOTHING-CREAM-177` | 14.90 | 1490 | — | 14.90 |

## Exceptions

#### `TO-NIACINAMIDE-30` — READY

- Note: legacy rating 4.7/2840 reviews not imported (no provenance)

#### `TO-NIACINAMIDE-POWDER` — READY

- Note: legacy rating 4.5/620 reviews not imported (no provenance)

#### `TO-CAFFEINE-30` — READY

- Note: legacy rating 4.6/1950 reviews not imported (no provenance)

#### `TO-HA-B5-CERAMIDES-30` — READY

- Note: legacy rating 4.8/3100 reviews not imported (no provenance)

#### `TO-HA-B5-30` — READY

- Note: size label "30ml / 60ml" covers several sizes but legacy holds one price, one SKU and one stock figure — kept as a single variant, as the legacy site sold it
- Note: legacy rating 4.7/2600 reviews not imported (no provenance)

#### `TO-SALICYLIC-BODY-240` — READY

- Note: legacy rating 4.5/870 reviews not imported (no provenance)

#### `TO-GLYCOLIC-TONER-240` — READY

- Note: legacy rating 4.6/3200 reviews not imported (no provenance)

#### `TO-AZELAIC-30` — READY

- Note: legacy rating 4.5/1100 reviews not imported (no provenance)

#### `TO-NMF-HA-30` — READY

- Note: size label "30ml / 100ml" covers several sizes but legacy holds one price, one SKU and one stock figure — kept as a single variant, as the legacy site sold it
- Note: legacy rating 4.7/2400 reviews not imported (no provenance)

#### `TO-NMF-PHYTOCERAMIDES-100` — READY

- Note: legacy rating 4.6/980 reviews not imported (no provenance)

#### `TO-NMF-BETAGLUCAN-100` — READY

- Note: legacy rating 4.6/760 reviews not imported (no provenance)

#### `TO-SQUALANE-CLEANSER-50` — READY

- Note: size label "50ml / 150ml" covers several sizes but legacy holds one price, one SKU and one stock figure — kept as a single variant, as the legacy site sold it
- Note: legacy rating 4.7/2100 reviews not imported (no provenance)

#### `TO-SQUALANE-LIP-BALM-15` — READY

- Note: legacy rating 4.5/540 reviews not imported (no provenance)

#### `TO-AHA-BHA-PEEL-30` — READY

- Note: legacy rating 4.6/4200 reviews not imported (no provenance)

#### `TO-RETINOL-05-30` — READY

- Note: legacy rating 4.5/1530 reviews not imported (no provenance)

#### `TO-MULTI-PEPTIDE-EYE-15` — READY

- Note: legacy rating 4.6/890 reviews not imported (no provenance)

#### `TO-MULTI-PEPTIDE-HAIR-60` — READY

- Note: legacy rating 4.4/1200 reviews not imported (no provenance)

#### `TO-UV-SPF45-30` — READY

- Note: legacy rating 4.5/1450 reviews not imported (no provenance)

#### `TO-SOOTHING-BARRIER-30` — READY

- Note: legacy rating 4.6/780 reviews not imported (no provenance)

#### `TO-ACNE-SET` — READY

- Note: legacy rating 4.7/640 reviews not imported (no provenance)
- Note: no ingredient data in legacy record

#### `CV-MOISTURIZING-CREAM-454` — READY

- Note: legacy rating 4.8/5600 reviews not imported (no provenance)

#### `CV-MOISTURIZING-LOTION-236` — READY

- Note: size label "236ml / 473ml" covers several sizes but legacy holds one price, one SKU and one stock figure — kept as a single variant, as the legacy site sold it
- Note: legacy rating 4.7/4200 reviews not imported (no provenance)

#### `CV-FACIAL-LOTION-PM-52` — READY

- Note: legacy rating 4.7/3100 reviews not imported (no provenance)

#### `CV-FACIAL-LOTION-AM-SPF50-52` — READY

- Note: legacy rating 4.7/2800 reviews not imported (no provenance)

#### `CV-EYE-REPAIR-CREAM-14` — READY

- Note: legacy rating 4.6/1800 reviews not imported (no provenance)

#### `CV-ADVANCED-REPAIR-OINTMENT-85` — READY

- Note: size label "85g / 144g" covers several sizes but legacy holds one price, one SKU and one stock figure — kept as a single variant, as the legacy site sold it
- Note: legacy rating 4.7/1400 reviews not imported (no provenance)

#### `CV-CREAM-TO-FOAM-CLEANSER-236` — READY

- Note: legacy rating 4.7/2200 reviews not imported (no provenance)

#### `CV-FOAMING-CLEANSER-236` — READY

- Note: size label "236ml / 473ml" covers several sizes but legacy holds one price, one SKU and one stock figure — kept as a single variant, as the legacy site sold it
- Note: legacy rating 4.7/4800 reviews not imported (no provenance)

#### `CV-HYDRATING-CLEANSER-236` — READY

- Note: size label "236ml / 473ml" covers several sizes but legacy holds one price, one SKU and one stock figure — kept as a single variant, as the legacy site sold it
- Note: legacy rating 4.7/3900 reviews not imported (no provenance)

#### `CV-FOAMING-OIL-CLEANSER-236` — READY

- Note: size label "236ml / 355ml / 473ml" covers several sizes but legacy holds one price, one SKU and one stock figure — kept as a single variant, as the legacy site sold it
- Note: legacy rating 4.7/2600 reviews not imported (no provenance)

#### `CV-BLEMISH-CONTROL-CLEANSER-236` — READY

- Note: legacy rating 4.6/1700 reviews not imported (no provenance)

#### `CV-SA-SMOOTHING-CLEANSER-236` — READY

- Note: size label "236ml / 473ml" covers several sizes but legacy holds one price, one SKU and one stock figure — kept as a single variant, as the legacy site sold it
- Note: legacy rating 4.6/1900 reviews not imported (no provenance)

#### `CV-SA-SMOOTHING-CREAM-177` — READY

- Note: legacy rating 4.6/1500 reviews not imported (no provenance)

## Unmapped legacy tags

These legacy filter tags have no honest equivalent in the current taxonomy.
They are preserved in `archive/legacy-products.json` and are **not** forced
into the nearest concern. Creating taxonomy for them is a client content
decision, not a migration one.

| Metric | Count |
| --- | ---: |
| Exfoliating | 6 |
| Gentle Cleansing | 5 |
| All Ages | 4 |
| Dark Circles | 3 |
| Eye Care | 3 |
| Keratosis Pilaris | 3 |
| Puffiness | 2 |
| Body Care | 2 |
| Sun Protection | 2 |
| Fragrance-Free | 2 |
| Pore Minimizing | 1 |
| Oil Control | 1 |
| Customizable | 1 |
| Plumping | 1 |
| Makeup Removal | 1 |
| Lip Care | 1 |
| All Hair Types | 1 |
| Hair Density | 1 |
| Scalp Health | 1 |
| Hair Growth | 1 |
| SPF 45 | 1 |
| Starter Kit | 1 |
| Night Cream | 1 |
| SPF 50 | 1 |
| Healing | 1 |
| Rough Skin | 1 |
