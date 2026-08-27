# Post-import comparison — full catalogue

Generated 2026-08-20T20:41:39.953Z

Every planned row was re-read from PostgreSQL and compared field by field:
name, slug, brand, category, variant, price, publish status, stock, media
count, media alt text and description.

```
rows expected:      87
rows found in DB:   87
missing:            0
field mismatches:   0
```

The imported catalogue matches the plan exactly.

## Provenance of what was imported

| | |
| --- | --- |
| Products | 87 |
| Published | 87 |
| Temporary operational prices | 61 |
| Stock units (from PDF export) | 124 |
| Media rows | 177 |
| Products with an official source | 61 |
| Products with legacy content | 26 |
| Description sources | official 2, nordic-lux-live 80, pdf 1, legacy 4 |
| Review rows created | 0 |
| Rating aggregates set | 0 |

