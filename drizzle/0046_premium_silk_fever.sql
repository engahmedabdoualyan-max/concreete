CREATE TABLE "production_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"mix_design_id" uuid,
	"volume_m3" numeric(8, 2) DEFAULT '0' NOT NULL,
	"block_units" integer DEFAULT 0 NOT NULL,
	"produced_at" timestamp DEFAULT now() NOT NULL,
	"notes" varchar(500),
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "procure_requests" ADD COLUMN "received_qty" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_mix_design_id_mix_designs_id_fk" FOREIGN KEY ("mix_design_id") REFERENCES "public"."mix_designs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "production_runs_tenant_idx" ON "production_runs" USING btree ("tenant_id");