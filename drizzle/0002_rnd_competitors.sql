-- ============================================================
--  FIMTO SOFT — CONCRETE PLANT ERP
--  Migration 0002: Competitor Intelligence (المصانع المنافسة)
-- ============================================================
--  • rnd_competitors — rival plant directory
--  • rnd_competitor_products — their mixes & prices vs ours
--
--  Apply with:  npx drizzle-kit migrate
-- ============================================================

CREATE TABLE "rnd_competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"city" varchar(100),
	"phone" varchar(20),
	"email" varchar(200),
	"website" varchar(300),
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rnd_competitors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "rnd_competitors_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
CREATE TABLE "rnd_competitor_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"competitor_id" uuid NOT NULL,
	"grade" varchar(60) NOT NULL,
	"product_name" varchar(200),
	"their_price_sar" integer DEFAULT 0 NOT NULL,
	"our_mix_design_id" uuid,
	"our_price_sar" integer DEFAULT 0 NOT NULL,
	"extras_note" varchar(300),
	"observed_at" timestamp,
	"source" varchar(30) DEFAULT 'MARKET',
	"notes" text,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rnd_competitor_products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "rnd_competitor_products_competitor_id_rnd_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."rnd_competitors"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "rnd_competitor_products_our_mix_design_id_mix_designs_id_fk" FOREIGN KEY ("our_mix_design_id") REFERENCES "public"."mix_designs"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "rnd_competitor_products_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX "idx_rnd_comp_tenant" ON "rnd_competitors" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_comp_name" ON "rnd_competitors" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_rnd_cp_comp" ON "rnd_competitor_products" USING btree ("competitor_id");--> statement-breakpoint
CREATE INDEX "idx_rnd_cp_grade" ON "rnd_competitor_products" USING btree ("grade");--> statement-breakpoint
CREATE INDEX "idx_rnd_cp_tenant" ON "rnd_competitor_products" USING btree ("tenant_id");
