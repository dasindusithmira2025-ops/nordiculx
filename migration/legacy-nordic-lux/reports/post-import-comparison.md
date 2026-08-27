# Post-import comparison — legacy source vs PostgreSQL

Generated 2026-08-18T19:17:16.632Z from `https://github.com/thenordiclux-a11y/thnordiclux@cc86865c90fe7dd2e78d677720395a7347cfb665`.

Every importable legacy record is compared field by field against the database.
Counts are produced by the query, not asserted.

| Metric | Count |
| --- | ---: |
| Legacy products discovered | 33 |
| Expected in database | 33 |
| Found in database | 33 |
| Missing from database | 0 |
| Duplicate SKUs in database | 0 |
| Field mismatches | 0 |
| Price mismatches | 0 |
| Stock mismatches | 0 |
| Media mismatches | 0 |

## Fields compared

Product name, brand, category, variant label, effective price (`salePrice ?? price`),
legacy list price, original/struck-through price, stock on hand, media row count,
publish status.

## Mismatches

None.

## Not imported by design

| Legacy field | Reason |
| --- | --- |
| `rating`, `reviews` | No review rows and no provenance in the legacy repository; importing them would present marketing placeholders as customer feedback. |
| `createdAt`, `updatedAt` | `new Date()` at module load — no historical value. |
| `badge: 'Bundle'` | No badge field in the target schema; the `Sets & Kits` category carries the same meaning. |
| 21 orphaned `.png`/`.webp` files | Superseded by the `.jpg` photography referenced by the catalogue; 8 of them are byte-identical placeholders. |
