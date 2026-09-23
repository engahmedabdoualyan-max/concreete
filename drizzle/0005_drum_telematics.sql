-- ============================================================
--  FIMTO SOFT — CONCRETE PLANT ERP
--  Migration 0005: Drum telematics IoT (Epic 5)
-- ============================================================
--  • telematics_devices — sensor registry per vehicle
--  • telematics_readings — drum/fleet time series
--
--  Apply with:  npx drizzle-kit migrate
-- ============================================================

CREATE TABLE "telematics_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"device_type" varchar(30) NOT NULL,
	"serial_number" varchar(80),
	"is_active" boolean DEFAULT true NOT NULL,
	"mounted_at" timestamp,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "telematics_devices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "telematics_devices_vehicle_id_fleet_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."fleet_vehicles"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE TABLE "telematics_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"trip_id" uuid,
	"drum_rpm" numeric(5, 2),
	"concrete_temp_c" numeric(4, 1),
	"water_added_l" numeric(8, 2),
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"speed_kmh" numeric(6, 2),
	"source" varchar(20) DEFAULT 'DEVICE' NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "telematics_readings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "telematics_readings_vehicle_id_fleet_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."fleet_vehicles"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "telematics_readings_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX "idx_tm_dev_vehicle" ON "telematics_devices" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "idx_tm_dev_tenant" ON "telematics_devices" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_tm_trip" ON "telematics_readings" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "idx_tm_vehicle_time" ON "telematics_readings" USING btree ("vehicle_id","captured_at");--> statement-breakpoint
CREATE INDEX "idx_tm_tenant" ON "telematics_readings" USING btree ("tenant_id");
