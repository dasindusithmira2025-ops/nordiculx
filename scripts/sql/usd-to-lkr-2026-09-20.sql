-- One-off catalogue conversion. NOT a drizzle migration: run it once per
-- database, by hand, or prices are multiplied twice.
--   docker exec -i nordiclux-postgres psql -U nordiclux -d nordiclux -v ON_ERROR_STOP=1 < scripts/sql/usd-to-lkr-2026-09-20.sql
-- Orders, order items and payments keep their historical USD amounts.
-- USD -> LKR at 331.272976 (open.er-api.com mid-rate, 2026-09-20).
-- Amounts are integer minor units; result rounded to the whole rupee.
BEGIN;

UPDATE product_variants SET
  price            = ROUND(price            * 331.272976 / 100.0) * 100,
  sale_price       = ROUND(sale_price       * 331.272976 / 100.0) * 100,
  compare_at_price = ROUND(compare_at_price * 331.272976 / 100.0) * 100,
  updated_at       = now();

-- Percentage promotions hold a percent in `value`, not money: leave it.
UPDATE promotions SET
  value            = CASE WHEN type = 'fixed_amount'
                          THEN ROUND(value * 331.272976 / 100.0) * 100
                          ELSE value END,
  minimum_subtotal = ROUND(minimum_subtotal * 331.272976 / 100.0) * 100,
  maximum_discount = ROUND(maximum_discount * 331.272976 / 100.0) * 100,
  updated_at       = now();

COMMIT;
