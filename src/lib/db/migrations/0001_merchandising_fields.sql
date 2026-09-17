ALTER TABLE "brands" ADD COLUMN "merchandising_rank" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "best_seller" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "products_best_seller_idx" ON "products" USING btree ("best_seller");