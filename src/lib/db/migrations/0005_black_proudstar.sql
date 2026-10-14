SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_price_positive" CHECK ("product_variants"."price" > 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_sale_price_lt_price" CHECK ("product_variants"."sale_price" IS NULL OR "product_variants"."sale_price" < "product_variants"."price") NOT VALID;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount" > 0) NOT VALID;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_refunded_amount_valid" CHECK ("payments"."refunded_amount" >= 0 AND "payments"."refunded_amount" <= "payments"."amount") NOT VALID;