-- ============================================================
--  FIMTO SOFT — CONCRETE PLANT ERP
--  Migration 0010: Batch-plant controllers (Epic 10)
-- ============================================================
--  • batch_controllers — PLC/gateway/simulator registry per plant
--
--  Apply with:  npx drizzle-kit migrate
-- ============================================================

CREATE TABLE "batch_controllers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"batch_plant_id" uuid,
	"name" varchar(120) NOT NULL,
	"provider" varchar(20) NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_status" jsonb,
	"last_seen_at" timestamp,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "batch_controllers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "batch_controllers_batch_plant_id_batch_plants_id_fk" FOREIGN KEY ("batch_plant_id") REFERENCES "public"."batch_plants"("id") ON DELETE set null ON UPDATE no action,
	CONSTRAINT "batch_controllers_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX "idx_batch_ctrl_tenant" ON "batch_controllers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_batch_ctrl_plant" ON "batch_controllers" USING btree ("batch_plant_id");
