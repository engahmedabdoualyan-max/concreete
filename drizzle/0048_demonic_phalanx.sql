CREATE TABLE "broadcast_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"snap_date" varchar(10) NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "broadcast_snapshots" ADD CONSTRAINT "broadcast_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_snapshots_tenant_day_unique" ON "broadcast_snapshots" USING btree ("tenant_id","snap_date");--> statement-breakpoint
CREATE INDEX "broadcast_snapshots_tenant_idx" ON "broadcast_snapshots" USING btree ("tenant_id");