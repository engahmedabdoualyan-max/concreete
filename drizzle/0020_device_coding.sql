-- Vehicle device coding: make a device identity unambiguous.
--
-- Why this migration exists: `telematics_devices.serial_number` carried no
-- unique index, so the same probe or tracker IMEI could be "coded" onto any
-- number of vehicles in any tenant. Every reading then looked legitimate
-- because ingest resolves the device by serial, and the fleet silently showed
-- the tracker on the wrong truck. Coding a device is exactly the operation
-- that must never be ambiguous, so the identity gets database-level guarantees
-- instead of relying on the API to behave.
--
-- Everything here is additive and idempotent: existing rows (including the
-- NULL serials that are still awaiting their vendor IMEI) keep working.

-- 1. The vendor serial / IMEI is globally unique. A physical probe has one
--    identity, so the same string cannot be issued twice, not even across two
--    tenants. NULLs are excluded because the value is optional until the
--    hardware is actually mounted.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "telematics_devices"
    WHERE "serial_number" IS NOT NULL
    GROUP BY "serial_number" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'telematics_devices: duplicate serial_number found, reconcile before applying 0020';
  END IF;
END
$$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "telematics_devices_serial_number_unique"
  ON "telematics_devices" USING btree ("serial_number")
  WHERE "serial_number" IS NOT NULL;
--> statement-breakpoint
COMMENT ON COLUMN "telematics_devices"."serial_number"
  IS 'Vendor serial / IMEI printed on the probe or tracker. Globally unique when set: it is the device identity used by ingest to resolve readings.';
--> statement-breakpoint
-- 2. A short human code for the workshop ("DRUM-01", "GPS-04"). Distinct from
--    the serial: this is what staff read off the dashboard and type on the
--    form, while the serial is what the vendor prints on the hardware.
ALTER TABLE "telematics_devices"
  ADD COLUMN IF NOT EXISTS "device_code" varchar(40);
--> statement-breakpoint
ALTER TABLE "telematics_devices"
  ADD COLUMN IF NOT EXISTS "is_primary" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "telematics_devices"
  ADD COLUMN IF NOT EXISTS "linked_at" timestamp;
--> statement-breakpoint
ALTER TABLE "telematics_devices"
  ADD COLUMN IF NOT EXISTS "linked_by_id" uuid;
--> statement-breakpoint
COMMENT ON COLUMN "telematics_devices"."device_code"
  IS 'Short human-facing device code shown in the UI (e.g. DRUM-01, GPS-04). Optional; the serial/IMEI stays the identity.';
--> statement-breakpoint
COMMENT ON COLUMN "telematics_devices"."is_primary"
  IS 'Primary device of its type for the vehicle. Only one per (vehicle_id, device_type).';
--> statement-breakpoint
COMMENT ON COLUMN "telematics_devices"."linked_at"
  IS 'When the device was last mounted on / linked to the vehicle.';
--> statement-breakpoint
ALTER TABLE "telematics_devices"
  ADD CONSTRAINT "telematics_devices_linked_by_id_users_id_fk"
  FOREIGN KEY ("linked_by_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- 3. The device code is what people read out, so it cannot collide inside a
--    tenant either. NULL codes stay allowed until the hardware is labelled.
CREATE UNIQUE INDEX IF NOT EXISTS "telematics_devices_tenant_device_code_unique"
  ON "telematics_devices" USING btree ("tenant_id", "device_code")
  WHERE "device_code" IS NOT NULL;
--> statement-breakpoint
-- 4. One primary device per type per vehicle: a mixer has one drum-RPM probe
--    and one GPS tracker, not two of either.
CREATE UNIQUE INDEX IF NOT EXISTS "telematics_devices_primary_per_vehicle_type_unique"
  ON "telematics_devices" USING btree ("vehicle_id", "device_type")
  WHERE "is_primary";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tm_dev_serial" ON "telematics_devices" USING btree ("serial_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tm_dev_active_vehicle" ON "telematics_devices" USING btree ("vehicle_id", "is_active");