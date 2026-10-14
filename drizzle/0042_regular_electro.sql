CREATE TYPE "public"."gate_category" AS ENUM('RAW_CEMENT', 'RAW_SAND', 'RAW_GRAVEL_10', 'RAW_GRAVEL_20', 'RAW_GRAVEL_40', 'RAW_WATER', 'RAW_ADMIXTURE', 'SPARE_PART', 'SUPPLY_OTHER', 'CONCRETE', 'BLOCK');--> statement-breakpoint
CREATE TYPE "public"."gate_direction" AS ENUM('IN', 'OUT');--> statement-breakpoint
CREATE TYPE "public"."gate_status" AS ENUM('OPEN', 'CLOSED', 'VOID');--> statement-breakpoint
CREATE TABLE "gate_passes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ticket_no" varchar(20) NOT NULL,
	"direction" "gate_direction" NOT NULL,
	"category" "gate_category" NOT NULL,
	"vehicle_id" uuid,
	"external_plate" varchar(30),
	"party_name" varchar(160),
	"driver_name" varchar(120),
	"entry_weight_kg" numeric(10, 3),
	"exit_weight_kg" numeric(10, 3),
	"net_weight_kg" numeric(10, 3),
	"quantity" numeric(12, 3),
	"quantity_unit" varchar(10),
	"mix_design_id" uuid,
	"order_ref" varchar(60),
	"notes" varchar(500),
	"status" "gate_status" DEFAULT 'OPEN' NOT NULL,
	"operator_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_vehicle_id_fleet_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."fleet_vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_mix_design_id_mix_designs_id_fk" FOREIGN KEY ("mix_design_id") REFERENCES "public"."mix_designs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gate_passes_tenant_ticket_unique" ON "gate_passes" USING btree ("tenant_id","ticket_no");--> statement-breakpoint
CREATE INDEX "gate_passes_tenant_idx" ON "gate_passes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "gate_passes_tenant_day_idx" ON "gate_passes" USING btree ("tenant_id","created_at");