-- Cost of a single delivery, so the cost-per-m³ report can include transport.
-- SAR halalas (cents), same unit as price_per_m3_sar and total_fuel_cost_sar.
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "transport_cost_sar" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
COMMENT ON COLUMN "trips"."transport_cost_sar" IS 'Delivered cost of this trip in SAR cents (driver overtime, pump rental, tolls, loading crew). 0 = not costed yet.';
