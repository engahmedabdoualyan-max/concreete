-- ============================================================
--  FIMTO SOFT — CONCRETE PLANT ERP
--  Migration 0011: Multi-material + carbon (Epic 11)
-- ============================================================
--  • product_type enum + columns on orders / mix_designs
--  • carbon_factors table + orders carbon snapshot columns
--
--  Apply with:  npx drizzle-kit migrate
-- ============================================================

CREATE TYPE "public"."product_type" AS ENUM('READY_MIX', 'AGGREGATE', 'ASPHALT', 'BLOCKS', 'CEMENT');--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "product_type" "product_type" DEFAULT 'READY_MIX' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "carbon_kgco2e" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "carbon_computed_at" timestamp;--> statement-breakpoint
ALTER TABLE "mix_designs" ADD COLUMN "product_type" "product_type" DEFAULT 'READY_MIX' NOT NULL;--> statement-breakpoint
CREATE TABLE "carbon_factors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"factor_key" varchar(40) NOT NULL,
	"unit" varchar(20) NOT NULL,
	"kgco2e_per_unit" numeric(12, 6) NOT NULL,
	"source" varchar(200),
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "carbon_factors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX "idx_carbon_tenant" ON "carbon_factors" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_carbon_key" ON "carbon_factors" USING btree ("tenant_id","factor_key");
