-- ═══════════════════════════════════════════════════════════════════════════
--  FIMTO SOFT — CONCRETE ERP · SUPABASE FULL SETUP
--  Paste the WHOLE file into the Supabase SQL Editor and press Run.
--  Contents: 1) all 31 tables + enums + indexes  2) default tenant
--            3) default SUPER_ADMIN user (login: admin@fimtosoft.com / Admin@2026)
--  Idempotent: enum types are created inside DO blocks (Postgres has no
--  CREATE TYPE IF NOT EXISTS), tables and indexes use IF NOT EXISTS, and
--  foreign keys are added only if the constraint does not already exist.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  CREATE TYPE "public"."calibration_result" AS ENUM('PASS', 'WARNING', 'FAIL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."credit_hold_status" AS ENUM('ON_HOLD', 'RELEASED_BY_ACCOUNTANT', 'RELEASED_BY_ADMIN', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."finance_action" AS ENUM('CREDIT_CHECK', 'MANUAL_OVERRIDE', 'CASH_APPROVAL', 'APPROVE', 'REJECT', 'HOLD', 'CREDIT_HOLD', 'OVERRIDE_APPROVE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."fuel_log_type" AS ENUM('REFUEL', 'CONSUMPTION_LOG', 'DISCREPANCY_REPORT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."lab_test_result" AS ENUM('PASS', 'FAIL', 'MARGINAL', 'PENDING');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."lab_test_type" AS ENUM('SLUMP_TEST', 'COMPRESSIVE_7DAY', 'COMPRESSIVE_28DAY', 'TEMPERATURE_FRESH', 'AIR_CONTENT', 'UNIT_WEIGHT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."maintenance_severity" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."maintenance_status" AS ENUM('OPEN', 'IN_PROGRESS', 'AWAITING_PARTS', 'COMPLETED', 'ESCALATED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."maintenance_type" AS ENUM('PREVENTIVE', 'CORRECTIVE', 'INSPECTION', 'MAJOR_OVERHAUL', 'TIRE_SERVICE', 'HYDRAULIC_SERVICE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."material_category" AS ENUM('CEMENT', 'SAND', 'GRAVEL_10MM', 'GRAVEL_20MM', 'GRAVEL_40MM', 'WATER', 'ADMIXTURE_PLASTICIZER', 'ADMIXTURE_RETARDER', 'ADMIXTURE_ACCELERATOR', 'FLY_ASH', 'SILICA_FUME', 'STEEL_FIBER', 'POLYPROPYLENE_FIBER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."order_status" AS ENUM('DRAFT', 'PENDING_FINANCE', 'CREDIT_HOLD', 'FINANCE_REJECTED', 'APPROVED', 'APPROVED_SCHEDULED', 'SCHEDULED', 'IN_PRODUCTION', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'ON_HOLD');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."plant_status" AS ENUM('OPERATIONAL', 'DEGRADED', 'OUT_OF_SERVICE', 'MAINTENANCE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."pump_session_status" AS ENUM('MOBILISING', 'SETUP', 'PUMPING', 'STANDBY', 'TEARDOWN', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."purchase_priority" AS ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."purchase_request_status" AS ENUM('AUTO_GENERATED', 'ACKNOWLEDGED', 'QUOTED', 'APPROVED', 'ORDERED', 'RECEIVED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."return_disposition" AS ENUM('RECYCLED_BATCHING', 'CAST_BLOCKS', 'DISCARDED', 'WASHOUT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."tipper_intake_status" AS ENUM('WEIGHED_IN', 'DISCHARGED', 'REJECTED', 'PARTIAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."trip_checkpoint" AS ENUM('ARR_PLANT', 'ARR_BSTC', 'DEP_PLANT', 'ARR_SITE', 'POUR_START', 'DEP_SITE', 'RETURN_PLANT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."user_role" AS ENUM('SUPER_ADMIN', 'PLANT_MGR', 'ACCOUNTANT', 'LAB_TECH', 'BATCH_OPERATOR', 'SALES_REP', 'DRIVER', 'FINANCE', 'DISPATCHER', 'WORKSHOP_MGR', 'LAB_TECHNICIAN', 'WORKSHOP_MECHANIC');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."vehicle_class" AS ENUM('MIXER', 'PUMP', 'TIPPER', 'SERVICE', 'REGULAR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."vehicle_status" AS ENUM('AVAILABLE', 'LOADING', 'IN_TRANSIT', 'POURING', 'RETURNING', 'IN_WORKSHOP', 'MAJOR_BREAKDOWN', 'OUT_OF_SERVICE', 'FUELING', 'STANDBY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."vehicle_type" AS ENUM('MIXER_TRUCK', 'CONCRETE_PUMP', 'TRANSIT_MIXER', 'WATER_TANKER', 'SERVICE_TRUCK', 'TIPPER_TRUCK');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "aggregate_recycling_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"return_id" uuid NOT NULL,
	"aggregate_recovered_kg" numeric(10, 3) NOT NULL,
	"recovered_grade" varchar(30),
	"destination_silo_id" uuid,
	"processing_state" varchar(30) DEFAULT 'RAW',
	"logged_by_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(60) NOT NULL,
	"entity_id" uuid,
	"previous_state" jsonb,
	"new_state" jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"socket_event" varchar(80),
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "batch_plants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plant_code" varchar(20) NOT NULL,
	"plant_name" varchar(120) NOT NULL,
	"rated_capacity_m3_per_hour" numeric(6, 2),
	"status" "plant_status" DEFAULT 'OPERATIONAL' NOT NULL,
	"out_of_service_reason" text,
	"out_of_service_at" timestamp,
	"last_calibration_at" timestamp,
	"calibration_interval_hours" integer DEFAULT 24 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "batch_plants_plant_code_unique" UNIQUE("plant_code")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "block_manufacturing_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"return_id" uuid NOT NULL,
	"blocks_count" integer NOT NULL,
	"block_size_cm" varchar(30),
	"volume_per_block_m3" numeric(6, 4),
	"total_volume_cast_m3" numeric(6, 2) NOT NULL,
	"cured_status" varchar(30) DEFAULT 'CURING',
	"storage_location" varchar(100),
	"logged_by_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calibration_control" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"batch_plant_id" uuid NOT NULL,
	"scale_identifier" varchar(40) NOT NULL,
	"certified_test_weight_kg" numeric(10, 3) NOT NULL,
	"observed_reading_kg" numeric(10, 3) NOT NULL,
	"deviation_pct" numeric(6, 3) NOT NULL,
	"tolerance_pct" numeric(5, 3) DEFAULT '1.000' NOT NULL,
	"result" "calibration_result" NOT NULL,
	"verified_by_id" uuid NOT NULL,
	"triggered_out_of_service" boolean DEFAULT false NOT NULL,
	"notes" text,
	"verified_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_code" varchar(20) NOT NULL,
	"company_name" varchar(200) NOT NULL,
	"contact_person" varchar(120),
	"phone" varchar(20),
	"email" varchar(200),
	"vat_number" varchar(50),
	"credit_limit_sar" integer DEFAULT 0 NOT NULL,
	"outstanding_balance_sar" integer DEFAULT 0 NOT NULL,
	"is_blacklisted" boolean DEFAULT false NOT NULL,
	"paper_clearance_granted" boolean DEFAULT false NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clients_client_code_unique" UNIQUE("client_code")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "concrete_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"returned_volume_m3" numeric(6, 2) NOT NULL,
	"returned_weight_kg" numeric(10, 3),
	"disposition" "return_disposition" NOT NULL,
	"return_reason" text NOT NULL,
	"authorised_by_id" uuid NOT NULL,
	"returned_slump_cm" numeric(4, 1),
	"financial_deduction_raised" boolean DEFAULT false NOT NULL,
	"deduction_amount_sar" integer DEFAULT 0,
	"blocks_cast_count" integer DEFAULT 0,
	"aggregate_recovered_kg" numeric(10, 3) DEFAULT '0',
	"water_recovered_litres" numeric(8, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "curfew_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"zone_name" varchar(100) NOT NULL,
	"active_days" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"start_time" varchar(5) NOT NULL,
	"end_time" varchar(5) NOT NULL,
	"is_blocking" boolean DEFAULT true NOT NULL,
	"reason" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"site_name" varchar(200) NOT NULL,
	"site_code" varchar(30) NOT NULL,
	"address_line" text,
	"city" varchar(100),
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"geofence_radius_metres" integer DEFAULT 150 NOT NULL,
	"distance_from_plant_km" numeric(8, 2),
	"traffic_curfew_windows" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_sites_site_code_unique" UNIQUE("site_code")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "driver_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"latitude" numeric(10, 7) NOT NULL,
	"longitude" numeric(10, 7) NOT NULL,
	"accuracy_metres" real,
	"device_speed_kmh" numeric(5, 2),
	"moving_average_speed_kmh" numeric(5, 2),
	"heading_degrees" numeric(5, 2),
	"is_moving" boolean DEFAULT true NOT NULL,
	"battery_pct" integer,
	"captured_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evaluation_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"overall_score" numeric(5, 2) NOT NULL,
	"workshop_score" numeric(5, 2) NOT NULL,
	"batch_plant_score" numeric(5, 2) NOT NULL,
	"mixer_pump_score" numeric(5, 2) NOT NULL,
	"sales_order_score" numeric(5, 2) NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recommendations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"window_hours" integer DEFAULT 24 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"performed_by_id" uuid NOT NULL,
	"action" "finance_action" NOT NULL,
	"credit_limit_snapshot" integer,
	"outstanding_balance_snapshot" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fleet_vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vehicle_code" varchar(20) NOT NULL,
	"plate_number" varchar(30) NOT NULL,
	"vehicle_type" "vehicle_type" NOT NULL,
	"vehicle_class" "vehicle_class" DEFAULT 'REGULAR' NOT NULL,
	"make" varchar(80),
	"model" varchar(80),
	"year" integer,
	"drum_capacity_m3" numeric(5, 2),
	"tare_weight_tonnes" numeric(8, 3) NOT NULL,
	"current_status" "vehicle_status" DEFAULT 'AVAILABLE' NOT NULL,
	"fuel_type" varchar(20) DEFAULT 'DIESEL',
	"target_fuel_l_per_100km" numeric(5, 2),
	"odometre_km" numeric(10, 1) DEFAULT '0',
	"assigned_driver_id" uuid,
	"is_external" boolean DEFAULT false NOT NULL,
	"external_vendor_name" varchar(120),
	"monthly_rental_rate_sar" integer DEFAULT 0,
	"hourly_rate_sar" integer DEFAULT 0,
	"payload_capacity_tonnes" numeric(8, 3),
	"boom_reach_metres" numeric(5, 2),
	"pump_rate_m3_per_hour" numeric(6, 2),
	"insurance_expires_at" timestamp,
	"inspection_due_at" timestamp,
	"last_gps_lat" numeric(10, 7),
	"last_gps_lng" numeric(10, 7),
	"last_gps_speed_kmh" numeric(6, 2),
	"last_gps_heading" numeric(5, 2),
	"last_gps_source" varchar(20),
	"last_gps_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fleet_vehicles_vehicle_code_unique" UNIQUE("vehicle_code"),
	CONSTRAINT "fleet_vehicles_plate_number_unique" UNIQUE("plate_number")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fuel_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"log_type" "fuel_log_type" NOT NULL,
	"logged_at" timestamp DEFAULT now() NOT NULL,
	"litres_added" numeric(8, 2),
	"odometre_km" numeric(10, 1) NOT NULL,
	"previous_odometre_km" numeric(10, 1),
	"distance_travelled_km" numeric(8, 1),
	"actual_l_per_100km" numeric(5, 2),
	"target_l_per_100km" numeric(5, 2),
	"efficiency_variance" numeric(5, 2),
	"cost_per_litre_sar_cents" integer,
	"total_fuel_cost_sar" integer,
	"fuel_station_name" varchar(100),
	"receipt_number" varchar(50),
	"logged_by_id" uuid NOT NULL,
	"is_anomaly" boolean DEFAULT false NOT NULL,
	"anomaly_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_silos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"silo_code" varchar(20) NOT NULL,
	"silo_name" varchar(100) NOT NULL,
	"material_category" "material_category" NOT NULL,
	"current_stock_kg" numeric(12, 3) DEFAULT '0' NOT NULL,
	"capacity_kg" numeric(12, 3) NOT NULL,
	"reorder_level_kg" numeric(12, 3) NOT NULL,
	"cost_sar_per_tonne" numeric(10, 2) DEFAULT '0',
	"qr_code_token" varchar(512),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_silos_silo_code_unique" UNIQUE("silo_code"),
	CONSTRAINT "inventory_silos_qr_code_token_unique" UNIQUE("qr_code_token")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"silo_id" uuid NOT NULL,
	"trip_id" uuid,
	"transaction_type" varchar(30) NOT NULL,
	"quantity_kg" numeric(12, 3) NOT NULL,
	"balance_after_kg" numeric(12, 3) NOT NULL,
	"reference_doc" varchar(80),
	"performed_by_id" uuid,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lab_test_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sample_id" uuid NOT NULL,
	"test_type" "lab_test_type" NOT NULL,
	"test_due" timestamp NOT NULL,
	"tested_at" timestamp,
	"tested_by_id" uuid,
	"measured_value" numeric(8, 3),
	"required_minimum_value" numeric(8, 3),
	"result" "lab_test_result" DEFAULT 'PENDING' NOT NULL,
	"specimen_code" varchar(30),
	"certificate_url" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lab_test_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sample_number" varchar(40) NOT NULL,
	"trip_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"mix_design_id" uuid NOT NULL,
	"sampled_by_id" uuid NOT NULL,
	"sample_temp_c" numeric(4, 1),
	"sample_humidity_pct" numeric(5, 2),
	"fresh_slump_cm" numeric(4, 1),
	"fresh_slump_result" "lab_test_result" DEFAULT 'PENDING',
	"cubes_count" integer DEFAULT 3 NOT NULL,
	"sampled_at" timestamp DEFAULT now() NOT NULL,
	"lab_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lab_test_samples_sample_number_unique" UNIQUE("sample_number")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "maintenance_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"work_order_number" varchar(30) NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"maintenance_type" "maintenance_type" NOT NULL,
	"status" "maintenance_status" DEFAULT 'OPEN' NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"severity" "maintenance_severity" DEFAULT 'MEDIUM' NOT NULL,
	"reported_by_id" uuid NOT NULL,
	"assigned_mechanic_id" uuid,
	"fault_description" text NOT NULL,
	"action_taken" text,
	"parts_used" jsonb DEFAULT '[]'::jsonb,
	"odometre_at_maintenance_km" numeric(10, 1),
	"next_service_due_km" numeric(10, 1),
	"estimated_completion_at" timestamp,
	"completed_at" timestamp,
	"labour_hours" numeric(5, 2),
	"total_cost_sar" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_orders_work_order_number_unique" UNIQUE("work_order_number")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mix_designs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"design_code" varchar(30) NOT NULL,
	"grade_description" varchar(100) NOT NULL,
	"target_strength_mpa" numeric(6, 2) NOT NULL,
	"target_slump_cm" numeric(4, 1) NOT NULL,
	"cement_kg_per_m3" numeric(8, 3) NOT NULL,
	"sand_kg_per_m3" numeric(8, 3) NOT NULL,
	"gravel_10mm_kg_per_m3" numeric(8, 3) DEFAULT '0',
	"gravel_20mm_kg_per_m3" numeric(8, 3) DEFAULT '0',
	"gravel_40mm_kg_per_m3" numeric(8, 3) DEFAULT '0',
	"water_litres_per_m3" numeric(8, 3) NOT NULL,
	"admixture_plasticizer_l_per_m3" numeric(8, 3) DEFAULT '0',
	"admixture_retarder_l_per_m3" numeric(8, 3) DEFAULT '0',
	"fly_ash_kg_per_m3" numeric(8, 3) DEFAULT '0',
	"silica_fume_kg_per_m3" numeric(8, 3) DEFAULT '0',
	"base_design_temp_c" numeric(4, 1) DEFAULT '25',
	"water_adj_litres_per_deg_c" numeric(5, 3) DEFAULT '0.5',
	"retarder_adj_l_per_deg_c" numeric(5, 3) DEFAULT '0.02',
	"water_adj_litres_per_percent_humidity" numeric(5, 3) DEFAULT '0.05',
	"max_wc_ratio" numeric(4, 3) DEFAULT '0.5',
	"is_active" boolean DEFAULT true NOT NULL,
	"approved_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mix_designs_design_code_unique" UNIQUE("design_code")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_number" varchar(30) NOT NULL,
	"client_id" uuid NOT NULL,
	"delivery_site_id" uuid NOT NULL,
	"mix_design_id" uuid NOT NULL,
	"total_volume_m3" numeric(8, 2) NOT NULL,
	"remaining_volume_m3" numeric(8, 2) NOT NULL,
	"price_per_m3_sar" integer NOT NULL,
	"scheduled_date" timestamp NOT NULL,
	"requested_pour_rate_m3_per_hour" numeric(5, 2),
	"status" "order_status" DEFAULT 'DRAFT' NOT NULL,
	"created_by_rep_id" uuid NOT NULL,
	"finance_officer_id" uuid,
	"finance_approved_at" timestamp,
	"finance_rejection_reason" text,
	"paper_clearance_granted" boolean DEFAULT false NOT NULL,
	"assigned_pump_code" varchar(10),
	"special_instructions" text,
	"ambient_temp_c" numeric(4, 1),
	"ambient_humidity_pct" numeric(5, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plant_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"config_key" varchar(40) DEFAULT 'GLOBAL' NOT NULL,
	"pod_eff_target_km_per_litre" numeric(6, 3) DEFAULT '2.600' NOT NULL,
	"fuel_tolerance_pct" numeric(5, 2) DEFAULT '15.00' NOT NULL,
	"light_fuel_budget_sar" integer DEFAULT 0 NOT NULL,
	"heavy_fuel_budget_sar" integer DEFAULT 0 NOT NULL,
	"tyre_budget_sar" integer DEFAULT 0 NOT NULL,
	"maintenance_budget_sar" integer DEFAULT 0 NOT NULL,
	"target_loading_time_minutes" integer DEFAULT 15 NOT NULL,
	"on_time_tolerance_pct" numeric(5, 2) DEFAULT '20.00' NOT NULL,
	"baseline_temp_c" numeric(4, 1) DEFAULT '35.0' NOT NULL,
	"baseline_humidity_pct" numeric(5, 2) DEFAULT '40.00' NOT NULL,
	"water_per_deg_c_litres" numeric(5, 3) DEFAULT '1.500' NOT NULL,
	"calibration_tolerance_pct" numeric(5, 3) DEFAULT '1.000' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plant_config_config_key_unique" UNIQUE("config_key")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pump_operation_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"session_number" varchar(40) NOT NULL,
	"pump_vehicle_id" uuid NOT NULL,
	"order_id" uuid,
	"delivery_site_id" uuid NOT NULL,
	"operator_id" uuid NOT NULL,
	"status" "pump_session_status" DEFAULT 'MOBILISING' NOT NULL,
	"mobilised_at" timestamp,
	"arrived_on_site_at" timestamp,
	"setup_completed_at" timestamp,
	"pumping_started_at" timestamp,
	"pumping_ended_at" timestamp,
	"departed_site_at" timestamp,
	"on_site_minutes" integer,
	"pumping_minutes" integer,
	"standby_minutes" integer,
	"volume_pumped_m3" numeric(8, 2) DEFAULT '0',
	"actual_m3_per_hour" numeric(6, 2),
	"mixer_loads_served" integer DEFAULT 0 NOT NULL,
	"was_external" boolean DEFAULT false NOT NULL,
	"hourly_rate_sar" integer DEFAULT 0,
	"total_charge_sar" integer DEFAULT 0,
	"vendor_invoice_ref" varchar(60),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pump_operation_logs_session_number_unique" UNIQUE("session_number")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"pr_number" varchar(30) NOT NULL,
	"silo_id" uuid NOT NULL,
	"material_category" "material_category" NOT NULL,
	"requested_quantity_kg" numeric(12, 3) NOT NULL,
	"triggering_trip_id" uuid,
	"stock_at_generation_kg" numeric(12, 3) NOT NULL,
	"reorder_level_kg" numeric(12, 3) NOT NULL,
	"status" "purchase_request_status" DEFAULT 'AUTO_GENERATED' NOT NULL,
	"priority" "purchase_priority" DEFAULT 'NORMAL' NOT NULL,
	"generated_by_id" uuid,
	"assigned_to_user_id" uuid,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_requests_pr_number_unique" UNIQUE("pr_number")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_code" varchar(40) NOT NULL,
	"company_name" varchar(200) NOT NULL,
	"primary_plant_name" varchar(160),
	"country_code" varchar(2) DEFAULT 'SA' NOT NULL,
	"timezone" varchar(80) DEFAULT 'Asia/Riyadh' NOT NULL,
	"default_locale" varchar(10) DEFAULT 'en' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"subscription_plan" varchar(40) DEFAULT 'STANDARD' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_tenant_code_unique" UNIQUE("tenant_code")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tipper_intake_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"intake_number" varchar(40) NOT NULL,
	"tipper_vehicle_id" uuid NOT NULL,
	"silo_id" uuid NOT NULL,
	"material_category" "material_category" NOT NULL,
	"weighbridge_transaction_id" uuid,
	"purchase_request_id" uuid,
	"status" "tipper_intake_status" DEFAULT 'WEIGHED_IN' NOT NULL,
	"gross_weight_kg" numeric(10, 3) NOT NULL,
	"tare_weight_kg" numeric(10, 3) NOT NULL,
	"net_weight_kg" numeric(10, 3) NOT NULL,
	"discharged_weight_kg" numeric(10, 3) DEFAULT '0',
	"silo_balance_after_kg" numeric(12, 3),
	"supplier_name" varchar(140),
	"supplier_delivery_note" varchar(80),
	"moisture_content_pct" numeric(5, 2),
	"qc_passed" boolean DEFAULT true NOT NULL,
	"rejection_reason" text,
	"cost_sar_per_tonne" integer DEFAULT 0,
	"total_cost_sar" integer DEFAULT 0,
	"received_by_id" uuid NOT NULL,
	"weighed_in_at" timestamp DEFAULT now() NOT NULL,
	"discharged_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tipper_intake_logs_intake_number_unique" UNIQUE("intake_number")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trip_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"checkpoint" "trip_checkpoint" NOT NULL,
	"logged_at" timestamp DEFAULT now() NOT NULL,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"gps_accuracy_metres" real,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"logged_by_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_trip_checkpoint" UNIQUE("trip_id","checkpoint")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"trip_number" varchar(40) NOT NULL,
	"order_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"pump_vehicle_id" uuid,
	"mix_design_id" uuid NOT NULL,
	"loaded_volume_m3" numeric(6, 2) NOT NULL,
	"confirmed_volume_m3" numeric(6, 2),
	"current_checkpoint" "trip_checkpoint" DEFAULT 'ARR_PLANT' NOT NULL,
	"actual_water_litres_per_m3" numeric(8, 3),
	"actual_retarder_l_per_m3" numeric(8, 3),
	"batch_temp_c" numeric(4, 1),
	"batch_humidity_pct" numeric(5, 2),
	"delivery_ticket_number" varchar(50),
	"delivery_ticket_issued_at" timestamp,
	"qr_code_token" varchar(512),
	"qr_code_issued_at" timestamp,
	"qr_verified_at" timestamp,
	"qr_verified_by_id" uuid,
	"qr_failed_scan_count" integer DEFAULT 0 NOT NULL,
	"dispatched_by_id" uuid,
	"transit_time_minutes" integer,
	"on_site_duration_minutes" integer,
	"return_time_minutes" integer,
	"total_cycle_time_minutes" integer,
	"is_completed" boolean DEFAULT false NOT NULL,
	"is_cancelled" boolean DEFAULT false NOT NULL,
	"cancellation_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trips_trip_number_unique" UNIQUE("trip_number"),
	CONSTRAINT "trips_delivery_ticket_number_unique" UNIQUE("delivery_ticket_number"),
	CONSTRAINT "trips_qr_code_token_unique" UNIQUE("qr_code_token")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"jti" varchar(64) NOT NULL,
	"device_info" jsonb,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_sessions_jti_unique" UNIQUE("jti")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_code" varchar(20) NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"email" varchar(200) NOT NULL,
	"phone_number" varchar(20),
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb,
	"push_token" text,
	"zone" varchar(100),
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp,
	"refresh_token_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_employee_code_unique" UNIQUE("employee_code"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "weighbridge_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"sequence_number" integer NOT NULL,
	"transaction_type" varchar(20) NOT NULL,
	"gross_weight_kg" numeric(10, 3) NOT NULL,
	"tare_weight_kg" numeric(10, 3) NOT NULL,
	"net_weight_kg" numeric(10, 3) NOT NULL,
	"operator_id" uuid NOT NULL,
	"scale_unit_id" varchar(30),
	"raw_sensor_data" jsonb,
	"previous_hash" varchar(64) NOT NULL,
	"record_hash" varchar(64) NOT NULL,
	"qr_code_token" varchar(512),
	"locked_at" timestamp DEFAULT now() NOT NULL,
	"notes" text,
	CONSTRAINT "weighbridge_transactions_record_hash_unique" UNIQUE("record_hash"),
	CONSTRAINT "weighbridge_transactions_qr_code_token_unique" UNIQUE("qr_code_token")
);--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aggregate_recycling_logs_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "aggregate_recycling_logs" ADD CONSTRAINT "aggregate_recycling_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aggregate_recycling_logs_return_id_concrete_returns_id_fk') THEN
    ALTER TABLE "aggregate_recycling_logs" ADD CONSTRAINT "aggregate_recycling_logs_return_id_concrete_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."concrete_returns"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aggregate_recycling_logs_destination_silo_id_inventory_silos_id_fk') THEN
    ALTER TABLE "aggregate_recycling_logs" ADD CONSTRAINT "aggregate_recycling_logs_destination_silo_id_inventory_silos_id_fk" FOREIGN KEY ("destination_silo_id") REFERENCES "public"."inventory_silos"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aggregate_recycling_logs_logged_by_id_users_id_fk') THEN
    ALTER TABLE "aggregate_recycling_logs" ADD CONSTRAINT "aggregate_recycling_logs_logged_by_id_users_id_fk" FOREIGN KEY ("logged_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_user_id_users_id_fk') THEN
    ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'batch_plants_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "batch_plants" ADD CONSTRAINT "batch_plants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'block_manufacturing_logs_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "block_manufacturing_logs" ADD CONSTRAINT "block_manufacturing_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'block_manufacturing_logs_return_id_concrete_returns_id_fk') THEN
    ALTER TABLE "block_manufacturing_logs" ADD CONSTRAINT "block_manufacturing_logs_return_id_concrete_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."concrete_returns"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'block_manufacturing_logs_logged_by_id_users_id_fk') THEN
    ALTER TABLE "block_manufacturing_logs" ADD CONSTRAINT "block_manufacturing_logs_logged_by_id_users_id_fk" FOREIGN KEY ("logged_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calibration_control_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "calibration_control" ADD CONSTRAINT "calibration_control_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calibration_control_batch_plant_id_batch_plants_id_fk') THEN
    ALTER TABLE "calibration_control" ADD CONSTRAINT "calibration_control_batch_plant_id_batch_plants_id_fk" FOREIGN KEY ("batch_plant_id") REFERENCES "public"."batch_plants"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calibration_control_verified_by_id_users_id_fk') THEN
    ALTER TABLE "calibration_control" ADD CONSTRAINT "calibration_control_verified_by_id_users_id_fk" FOREIGN KEY ("verified_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "clients" ADD CONSTRAINT "clients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'concrete_returns_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "concrete_returns" ADD CONSTRAINT "concrete_returns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'concrete_returns_trip_id_trips_id_fk') THEN
    ALTER TABLE "concrete_returns" ADD CONSTRAINT "concrete_returns_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'concrete_returns_authorised_by_id_users_id_fk') THEN
    ALTER TABLE "concrete_returns" ADD CONSTRAINT "concrete_returns_authorised_by_id_users_id_fk" FOREIGN KEY ("authorised_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'curfew_zones_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "curfew_zones" ADD CONSTRAINT "curfew_zones_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_sites_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "delivery_sites" ADD CONSTRAINT "delivery_sites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_sites_client_id_clients_id_fk') THEN
    ALTER TABLE "delivery_sites" ADD CONSTRAINT "delivery_sites_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_locations_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_locations_trip_id_trips_id_fk') THEN
    ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_locations_vehicle_id_fleet_vehicles_id_fk') THEN
    ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_vehicle_id_fleet_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."fleet_vehicles"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_locations_driver_id_users_id_fk') THEN
    ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evaluation_snapshots_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "evaluation_snapshots" ADD CONSTRAINT "evaluation_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'finance_actions_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "finance_actions" ADD CONSTRAINT "finance_actions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'finance_actions_order_id_orders_id_fk') THEN
    ALTER TABLE "finance_actions" ADD CONSTRAINT "finance_actions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'finance_actions_performed_by_id_users_id_fk') THEN
    ALTER TABLE "finance_actions" ADD CONSTRAINT "finance_actions_performed_by_id_users_id_fk" FOREIGN KEY ("performed_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_vehicles_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "fleet_vehicles" ADD CONSTRAINT "fleet_vehicles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_vehicles_assigned_driver_id_users_id_fk') THEN
    ALTER TABLE "fleet_vehicles" ADD CONSTRAINT "fleet_vehicles_assigned_driver_id_users_id_fk" FOREIGN KEY ("assigned_driver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fuel_logs_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "fuel_logs" ADD CONSTRAINT "fuel_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fuel_logs_vehicle_id_fleet_vehicles_id_fk') THEN
    ALTER TABLE "fuel_logs" ADD CONSTRAINT "fuel_logs_vehicle_id_fleet_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."fleet_vehicles"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fuel_logs_logged_by_id_users_id_fk') THEN
    ALTER TABLE "fuel_logs" ADD CONSTRAINT "fuel_logs_logged_by_id_users_id_fk" FOREIGN KEY ("logged_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_silos_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "inventory_silos" ADD CONSTRAINT "inventory_silos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_transactions_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_transactions_silo_id_inventory_silos_id_fk') THEN
    ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_silo_id_inventory_silos_id_fk" FOREIGN KEY ("silo_id") REFERENCES "public"."inventory_silos"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_transactions_trip_id_trips_id_fk') THEN
    ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_transactions_performed_by_id_users_id_fk') THEN
    ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_performed_by_id_users_id_fk" FOREIGN KEY ("performed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_test_results_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "lab_test_results" ADD CONSTRAINT "lab_test_results_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_test_results_sample_id_lab_test_samples_id_fk') THEN
    ALTER TABLE "lab_test_results" ADD CONSTRAINT "lab_test_results_sample_id_lab_test_samples_id_fk" FOREIGN KEY ("sample_id") REFERENCES "public"."lab_test_samples"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_test_results_tested_by_id_users_id_fk') THEN
    ALTER TABLE "lab_test_results" ADD CONSTRAINT "lab_test_results_tested_by_id_users_id_fk" FOREIGN KEY ("tested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_test_samples_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "lab_test_samples" ADD CONSTRAINT "lab_test_samples_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_test_samples_trip_id_trips_id_fk') THEN
    ALTER TABLE "lab_test_samples" ADD CONSTRAINT "lab_test_samples_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_test_samples_order_id_orders_id_fk') THEN
    ALTER TABLE "lab_test_samples" ADD CONSTRAINT "lab_test_samples_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_test_samples_mix_design_id_mix_designs_id_fk') THEN
    ALTER TABLE "lab_test_samples" ADD CONSTRAINT "lab_test_samples_mix_design_id_mix_designs_id_fk" FOREIGN KEY ("mix_design_id") REFERENCES "public"."mix_designs"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lab_test_samples_sampled_by_id_users_id_fk') THEN
    ALTER TABLE "lab_test_samples" ADD CONSTRAINT "lab_test_samples_sampled_by_id_users_id_fk" FOREIGN KEY ("sampled_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_orders_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_orders_vehicle_id_fleet_vehicles_id_fk') THEN
    ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_vehicle_id_fleet_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."fleet_vehicles"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_orders_reported_by_id_users_id_fk') THEN
    ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_reported_by_id_users_id_fk" FOREIGN KEY ("reported_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_orders_assigned_mechanic_id_users_id_fk') THEN
    ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_assigned_mechanic_id_users_id_fk" FOREIGN KEY ("assigned_mechanic_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mix_designs_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "mix_designs" ADD CONSTRAINT "mix_designs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mix_designs_approved_by_id_users_id_fk') THEN
    ALTER TABLE "mix_designs" ADD CONSTRAINT "mix_designs_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_client_id_clients_id_fk') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_delivery_site_id_delivery_sites_id_fk') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_site_id_delivery_sites_id_fk" FOREIGN KEY ("delivery_site_id") REFERENCES "public"."delivery_sites"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_mix_design_id_mix_designs_id_fk') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_mix_design_id_mix_designs_id_fk" FOREIGN KEY ("mix_design_id") REFERENCES "public"."mix_designs"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_created_by_rep_id_users_id_fk') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_rep_id_users_id_fk" FOREIGN KEY ("created_by_rep_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_finance_officer_id_users_id_fk') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_finance_officer_id_users_id_fk" FOREIGN KEY ("finance_officer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plant_config_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "plant_config" ADD CONSTRAINT "plant_config_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plant_config_updated_by_id_users_id_fk') THEN
    ALTER TABLE "plant_config" ADD CONSTRAINT "plant_config_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pump_operation_logs_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "pump_operation_logs" ADD CONSTRAINT "pump_operation_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pump_operation_logs_pump_vehicle_id_fleet_vehicles_id_fk') THEN
    ALTER TABLE "pump_operation_logs" ADD CONSTRAINT "pump_operation_logs_pump_vehicle_id_fleet_vehicles_id_fk" FOREIGN KEY ("pump_vehicle_id") REFERENCES "public"."fleet_vehicles"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pump_operation_logs_order_id_orders_id_fk') THEN
    ALTER TABLE "pump_operation_logs" ADD CONSTRAINT "pump_operation_logs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pump_operation_logs_delivery_site_id_delivery_sites_id_fk') THEN
    ALTER TABLE "pump_operation_logs" ADD CONSTRAINT "pump_operation_logs_delivery_site_id_delivery_sites_id_fk" FOREIGN KEY ("delivery_site_id") REFERENCES "public"."delivery_sites"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pump_operation_logs_operator_id_users_id_fk') THEN
    ALTER TABLE "pump_operation_logs" ADD CONSTRAINT "pump_operation_logs_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_requests_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_requests_silo_id_inventory_silos_id_fk') THEN
    ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_silo_id_inventory_silos_id_fk" FOREIGN KEY ("silo_id") REFERENCES "public"."inventory_silos"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_requests_triggering_trip_id_trips_id_fk') THEN
    ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_triggering_trip_id_trips_id_fk" FOREIGN KEY ("triggering_trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_requests_generated_by_id_users_id_fk') THEN
    ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_generated_by_id_users_id_fk" FOREIGN KEY ("generated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_requests_assigned_to_user_id_users_id_fk') THEN
    ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tipper_intake_logs_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "tipper_intake_logs" ADD CONSTRAINT "tipper_intake_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tipper_intake_logs_tipper_vehicle_id_fleet_vehicles_id_fk') THEN
    ALTER TABLE "tipper_intake_logs" ADD CONSTRAINT "tipper_intake_logs_tipper_vehicle_id_fleet_vehicles_id_fk" FOREIGN KEY ("tipper_vehicle_id") REFERENCES "public"."fleet_vehicles"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tipper_intake_logs_silo_id_inventory_silos_id_fk') THEN
    ALTER TABLE "tipper_intake_logs" ADD CONSTRAINT "tipper_intake_logs_silo_id_inventory_silos_id_fk" FOREIGN KEY ("silo_id") REFERENCES "public"."inventory_silos"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tipper_intake_logs_weighbridge_transaction_id_weighbridge_transactions_id_fk') THEN
    ALTER TABLE "tipper_intake_logs" ADD CONSTRAINT "tipper_intake_logs_weighbridge_transaction_id_weighbridge_transactions_id_fk" FOREIGN KEY ("weighbridge_transaction_id") REFERENCES "public"."weighbridge_transactions"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tipper_intake_logs_purchase_request_id_purchase_requests_id_fk') THEN
    ALTER TABLE "tipper_intake_logs" ADD CONSTRAINT "tipper_intake_logs_purchase_request_id_purchase_requests_id_fk" FOREIGN KEY ("purchase_request_id") REFERENCES "public"."purchase_requests"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tipper_intake_logs_received_by_id_users_id_fk') THEN
    ALTER TABLE "tipper_intake_logs" ADD CONSTRAINT "tipper_intake_logs_received_by_id_users_id_fk" FOREIGN KEY ("received_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trip_checkpoints_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "trip_checkpoints" ADD CONSTRAINT "trip_checkpoints_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trip_checkpoints_trip_id_trips_id_fk') THEN
    ALTER TABLE "trip_checkpoints" ADD CONSTRAINT "trip_checkpoints_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trip_checkpoints_logged_by_id_users_id_fk') THEN
    ALTER TABLE "trip_checkpoints" ADD CONSTRAINT "trip_checkpoints_logged_by_id_users_id_fk" FOREIGN KEY ("logged_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trips_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "trips" ADD CONSTRAINT "trips_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trips_order_id_orders_id_fk') THEN
    ALTER TABLE "trips" ADD CONSTRAINT "trips_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trips_vehicle_id_fleet_vehicles_id_fk') THEN
    ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_id_fleet_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."fleet_vehicles"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trips_driver_id_users_id_fk') THEN
    ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trips_pump_vehicle_id_fleet_vehicles_id_fk') THEN
    ALTER TABLE "trips" ADD CONSTRAINT "trips_pump_vehicle_id_fleet_vehicles_id_fk" FOREIGN KEY ("pump_vehicle_id") REFERENCES "public"."fleet_vehicles"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trips_mix_design_id_mix_designs_id_fk') THEN
    ALTER TABLE "trips" ADD CONSTRAINT "trips_mix_design_id_mix_designs_id_fk" FOREIGN KEY ("mix_design_id") REFERENCES "public"."mix_designs"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trips_qr_verified_by_id_users_id_fk') THEN
    ALTER TABLE "trips" ADD CONSTRAINT "trips_qr_verified_by_id_users_id_fk" FOREIGN KEY ("qr_verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trips_dispatched_by_id_users_id_fk') THEN
    ALTER TABLE "trips" ADD CONSTRAINT "trips_dispatched_by_id_users_id_fk" FOREIGN KEY ("dispatched_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_sessions_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_sessions_user_id_users_id_fk') THEN
    ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weighbridge_transactions_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "weighbridge_transactions" ADD CONSTRAINT "weighbridge_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weighbridge_transactions_trip_id_trips_id_fk') THEN
    ALTER TABLE "weighbridge_transactions" ADD CONSTRAINT "weighbridge_transactions_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weighbridge_transactions_operator_id_users_id_fk') THEN
    ALTER TABLE "weighbridge_transactions" ADD CONSTRAINT "weighbridge_transactions_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_recycling_return" ON "aggregate_recycling_logs" USING btree ("return_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_recycling_silo" ON "aggregate_recycling_logs" USING btree ("destination_silo_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_recycling_tenant" ON "aggregate_recycling_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_user" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_action" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_entity" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_created" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_tenant" ON "audit_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bplant_code" ON "batch_plants" USING btree ("plant_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bplant_status" ON "batch_plants" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bplant_tenant" ON "batch_plants" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_blocks_return" ON "block_manufacturing_logs" USING btree ("return_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_blocks_cured" ON "block_manufacturing_logs" USING btree ("cured_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_blocks_tenant" ON "block_manufacturing_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_calib_plant" ON "calibration_control" USING btree ("batch_plant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_calib_result" ON "calibration_control" USING btree ("result");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_calib_verified" ON "calibration_control" USING btree ("verified_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_calib_scale" ON "calibration_control" USING btree ("scale_identifier");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_calib_tenant" ON "calibration_control" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_clients_code" ON "clients" USING btree ("client_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_clients_company" ON "clients" USING btree ("company_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_clients_tenant" ON "clients" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_returns_trip" ON "concrete_returns" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_returns_disposition" ON "concrete_returns" USING btree ("disposition");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_returns_tenant" ON "concrete_returns" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_curfew_tenant" ON "curfew_zones" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sites_client" ON "delivery_sites" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sites_code" ON "delivery_sites" USING btree ("site_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sites_tenant" ON "delivery_sites" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_dloc_trip" ON "driver_locations" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_dloc_vehicle" ON "driver_locations" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_dloc_captured" ON "driver_locations" USING btree ("captured_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_dloc_driver" ON "driver_locations" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_dloc_tenant" ON "driver_locations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_eval_created" ON "evaluation_snapshots" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_eval_tenant" ON "evaluation_snapshots" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_finance_actions_order" ON "finance_actions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_finance_actions_by" ON "finance_actions" USING btree ("performed_by_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_finance_actions_tenant" ON "finance_actions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vehicles_status" ON "fleet_vehicles" USING btree ("current_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vehicles_type" ON "fleet_vehicles" USING btree ("vehicle_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vehicles_code" ON "fleet_vehicles" USING btree ("vehicle_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vehicles_driver" ON "fleet_vehicles" USING btree ("assigned_driver_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vehicles_last_gps" ON "fleet_vehicles" USING btree ("last_gps_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vehicles_tenant" ON "fleet_vehicles" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fuel_vehicle" ON "fuel_logs" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fuel_type" ON "fuel_logs" USING btree ("log_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fuel_logged" ON "fuel_logs" USING btree ("logged_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fuel_anomaly" ON "fuel_logs" USING btree ("is_anomaly");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fuel_tenant" ON "fuel_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_silos_category" ON "inventory_silos" USING btree ("material_category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_silos_code" ON "inventory_silos" USING btree ("silo_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_silos_tenant" ON "inventory_silos" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inv_tx_silo" ON "inventory_transactions" USING btree ("silo_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inv_tx_trip" ON "inventory_transactions" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inv_tx_type" ON "inventory_transactions" USING btree ("transaction_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inv_tx_created" ON "inventory_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inv_tx_tenant" ON "inventory_transactions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lab_results_sample" ON "lab_test_results" USING btree ("sample_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lab_results_type" ON "lab_test_results" USING btree ("test_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lab_results_due" ON "lab_test_results" USING btree ("test_due");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lab_results_result" ON "lab_test_results" USING btree ("result");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lab_results_tenant" ON "lab_test_results" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lab_samples_trip" ON "lab_test_samples" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lab_samples_order" ON "lab_test_samples" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lab_samples_number" ON "lab_test_samples" USING btree ("sample_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lab_samples_tenant" ON "lab_test_samples" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_maint_vehicle" ON "maintenance_orders" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_maint_status" ON "maintenance_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_maint_type" ON "maintenance_orders" USING btree ("maintenance_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_maint_mechanic" ON "maintenance_orders" USING btree ("assigned_mechanic_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_maint_priority" ON "maintenance_orders" USING btree ("priority");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_maint_tenant" ON "maintenance_orders" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_mix_designs_code" ON "mix_designs" USING btree ("design_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_mix_designs_active" ON "mix_designs" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_mix_designs_tenant" ON "mix_designs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_client" ON "orders" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_status" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_scheduled" ON "orders" USING btree ("scheduled_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_rep" ON "orders" USING btree ("created_by_rep_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_finance" ON "orders" USING btree ("finance_officer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_number" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_tenant" ON "orders" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pconfig_key" ON "plant_config" USING btree ("config_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pconfig_tenant" ON "plant_config" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pump_vehicle" ON "pump_operation_logs" USING btree ("pump_vehicle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pump_order" ON "pump_operation_logs" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pump_status" ON "pump_operation_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pump_site" ON "pump_operation_logs" USING btree ("delivery_site_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pump_external" ON "pump_operation_logs" USING btree ("was_external");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pump_session_no" ON "pump_operation_logs" USING btree ("session_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pump_tenant" ON "pump_operation_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pr_silo" ON "purchase_requests" USING btree ("silo_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pr_status" ON "purchase_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pr_number" ON "purchase_requests" USING btree ("pr_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pr_material" ON "purchase_requests" USING btree ("material_category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pr_tenant" ON "purchase_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenants_code" ON "tenants" USING btree ("tenant_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenants_active" ON "tenants" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tipper_vehicle" ON "tipper_intake_logs" USING btree ("tipper_vehicle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tipper_silo" ON "tipper_intake_logs" USING btree ("silo_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tipper_status" ON "tipper_intake_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tipper_material" ON "tipper_intake_logs" USING btree ("material_category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tipper_intake_no" ON "tipper_intake_logs" USING btree ("intake_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tipper_weighed" ON "tipper_intake_logs" USING btree ("weighed_in_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tipper_tenant" ON "tipper_intake_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tc_trip" ON "trip_checkpoints" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tc_checkpoint" ON "trip_checkpoints" USING btree ("checkpoint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tc_tenant" ON "trip_checkpoints" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trips_order" ON "trips" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trips_vehicle" ON "trips" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trips_driver" ON "trips" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trips_checkpoint" ON "trips" USING btree ("current_checkpoint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trips_completed" ON "trips" USING btree ("is_completed");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trips_number" ON "trips" USING btree ("trip_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trips_ticket" ON "trips" USING btree ("delivery_ticket_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trips_tenant" ON "trips" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sessions_user" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sessions_jti" ON "user_sessions" USING btree ("jti");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sessions_tenant" ON "user_sessions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_employee_code" ON "users" USING btree ("employee_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_tenant" ON "users" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wb_trip" ON "weighbridge_transactions" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wb_seq" ON "weighbridge_transactions" USING btree ("sequence_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wb_hash" ON "weighbridge_transactions" USING btree ("record_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wb_locked" ON "weighbridge_transactions" USING btree ("locked_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_wb_tenant" ON "weighbridge_transactions" USING btree ("tenant_id");
--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════════════════
--  SEED — default tenant + SUPER_ADMIN bootstrap user
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO "tenants"
  ("tenant_code", "company_name", "primary_plant_name", "country_code", "timezone", "default_locale", "is_active", "subscription_plan", "settings", "created_at", "updated_at")
VALUES
  ('FIMTO01', 'Fimto Soft Concrete Co.', 'Fimto Dammam Plant', 'SA', 'Asia/Riyadh', 'ar', true, 'STANDARD', '{}', now(), now())
ON CONFLICT ("tenant_code") DO NOTHING;

INSERT INTO "users"
  ("tenant_id", "employee_code", "full_name", "email", "phone_number", "password_hash", "role", "permissions", "is_active", "created_at", "updated_at")
SELECT
  t.id, 'ADM-001', 'System Administrator', 'admin@fimtosoft.com', '+966500000000',
  '$2b$10$e13w9vGCZ4/1WfGsn.BZ7.M.9VRkWe7F3rWoZ5EQc7gGn61HspBc2', -- password: Admin@2026
  'SUPER_ADMIN', '[]', true, now(), now()
FROM "tenants" t
WHERE t."tenant_code" = 'FIMTO01'
ON CONFLICT ("email") DO NOTHING;

-- Sample client, delivery site & mix design so the Sales Rep app has data
INSERT INTO "clients"
  ("tenant_id", "client_code", "company_name", "contact_person", "phone", "email", "credit_limit_sar", "outstanding_balance_sar", "is_blacklisted", "paper_clearance_granted", "is_active", "created_at", "updated_at")
SELECT t.id, 'CL-0001', 'Al Sharqia Contracting Co.', 'Eng. Saleh Al-Qahtani', '+966530000001', 'sales@sharqia.sa',
  5000000, 0, false, false, true, now(), now()
FROM "tenants" t WHERE t."tenant_code" = 'FIMTO01'
ON CONFLICT ("client_code") DO NOTHING;

INSERT INTO "delivery_sites"
  ("tenant_id", "client_id", "site_name", "site_code", "address_line", "city", "latitude", "longitude", "geofence_radius_metres", "is_active", "created_at", "updated_at")
SELECT t.id, c.id, 'Riyadh Tower Project', 'SITE-0001', 'King Fahd Road', 'Riyadh', 24.7136, 46.6753, 150, true, now(), now()
FROM "tenants" t, "clients" c
WHERE t."tenant_code" = 'FIMTO01' AND c."client_code" = 'CL-0001'
ON CONFLICT ("site_code") DO NOTHING;

INSERT INTO "mix_designs"
  ("tenant_id", "design_code", "grade_description", "target_strength_mpa", "target_slump_cm",
   "cement_kg_per_m3", "sand_kg_per_m3", "gravel_10mm_kg_per_m3", "gravel_20mm_kg_per_m3", "water_litres_per_m3",
   "base_design_temp_c", "water_adj_litres_per_deg_c", "retarder_adj_l_per_deg_c", "water_adj_litres_per_percent_humidity", "max_wc_ratio",
   "is_active", "created_at", "updated_at")
SELECT t.id, 'C30-S4', 'C30/37 – Slump 4 (foundations/slabs)', '30.00', '4.0',
  380, 700, 320, 640, 175,
  25.0, 0.500, 0.020, 0.050, 0.500,
  true, now(), now()
FROM "tenants" t WHERE t."tenant_code" = 'FIMTO01'
ON CONFLICT ("design_code") DO NOTHING;

-- Sample mixer truck so dispatch has a vehicle to assign
INSERT INTO "fleet_vehicles"
  ("tenant_id", "vehicle_code", "plate_number", "vehicle_type", "vehicle_class", "make", "model", "year",
   "drum_capacity_m3", "tare_weight_tonnes", "current_status", "fuel_type", "odometre_km", "created_at", "updated_at")
SELECT t.id, 'T01', 'AB C 1234', 'MIXER_TRUCK', 'MIXER', 'Mercedes-Benz', 'Actros 3341', 2022,
  '8.00', '12.500', 'AVAILABLE', 'DIESEL', '45000', now(), now()
FROM "tenants" t WHERE t."tenant_code" = 'FIMTO01'
ON CONFLICT ("vehicle_code") DO NOTHING;
