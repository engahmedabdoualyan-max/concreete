-- ============================================================
--  FIMTO SOFT — CONCRETE PLANT ERP
--  Migration 0013: Geofence attendance (Epic 12b)
-- ============================================================
--  • hr_zones — work geofences (factory + sites)
--  • hr_attendance — one row per user per day (in/out)
--
--  Apply with:  npx drizzle-kit migrate
-- ============================================================

CREATE TABLE "hr_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"latitude" numeric(10, 7) NOT NULL,
	"longitude" numeric(10, 7) NOT NULL,
	"radius_m" integer DEFAULT 200 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hr_zones_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "hr_zones_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
CREATE TABLE "hr_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"work_date" varchar(10) NOT NULL,
	"check_in_at" timestamp,
	"check_in_lat" numeric(10, 7),
	"check_in_lng" numeric(10, 7),
	"check_in_zone_id" uuid,
	"check_out_at" timestamp,
	"check_out_lat" numeric(10, 7),
	"check_out_lng" numeric(10, 7),
	"last_inside_at" timestamp,
	"last_inside_lat" numeric(10, 7),
	"last_inside_lng" numeric(10, 7),
	"source" varchar(10) DEFAULT 'AUTO' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hr_attendance_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "hr_attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "hr_attendance_check_in_zone_id_hr_zones_id_fk" FOREIGN KEY ("check_in_zone_id") REFERENCES "public"."hr_zones"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX "idx_hr_zone_tenant" ON "hr_zones" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_hr_att_tenant" ON "hr_attendance" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_hr_att_user_day" ON "hr_attendance" USING btree ("user_id","work_date");
