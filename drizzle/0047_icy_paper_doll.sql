CREATE TYPE "public"."fleet_readiness_status" AS ENUM('WORKING', 'IDLE', 'IN_WORKSHOP');--> statement-breakpoint
CREATE TABLE "fleet_readiness" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"work_date" varchar(10) NOT NULL,
	"status" "fleet_readiness_status" NOT NULL,
	"note" varchar(200),
	"reported_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fleet_readiness" ADD CONSTRAINT "fleet_readiness_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_readiness" ADD CONSTRAINT "fleet_readiness_vehicle_id_fleet_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."fleet_vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_readiness" ADD CONSTRAINT "fleet_readiness_reported_by_id_users_id_fk" FOREIGN KEY ("reported_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fleet_readiness_vehicle_day_unique" ON "fleet_readiness" USING btree ("vehicle_id","work_date");--> statement-breakpoint
CREATE INDEX "fleet_readiness_tenant_day_idx" ON "fleet_readiness" USING btree ("tenant_id","work_date");