-- Let an uncoded device's identity be reused.
--
-- Migration 0020 made `telematics_devices_serial_number_unique` partial only on
-- `serial_number IS NOT NULL`. That reserved an IMEI forever: once a probe was
-- coded and then uncoded, its row stayed behind as `is_active = false` and still
-- held the serial, so re-coding that probe onto another truck — the single most
-- common workshop operation there is — was refused with 409 forever.
--
-- The invariant that actually protects the fleet is narrower than "no two rows
-- ever share a serial". It is:
--
--   at most ONE ACTIVE device carries a given serial, anywhere
--
-- That is exactly what stops one probe's readings being split across two trucks,
-- because ingest (`resolveVehicle`) resolves the serial through active devices
-- only. Inactive rows are historical records of hardware that was once mounted;
-- they must not shadow a device that is in service now, and they are exactly the
-- rows a tenant needs for a concrete dispute ("which probe produced this drum
-- series last quarter?").
--
-- So the uniqueness indexes are made partial on `is_active` as well. Historical
-- duplicates among uncoded rows are possible by design and harmless: ingest never
-- resolves them, and the registry still shows them under includeInactive=true.

DO $$
BEGIN
  -- Only active devices may clash. If this ever fires, two trucks are reporting
  -- under one IMEI right now and readings are being mis-attributed — that must be
  -- resolved by hand, not by relaxing the rule.
  IF EXISTS (
    SELECT 1 FROM "telematics_devices"
    WHERE "serial_number" IS NOT NULL AND "is_active"
    GROUP BY "serial_number" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'telematics_devices: two ACTIVE devices share a serial_number; reconcile before applying 0021';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "telematics_devices"
    WHERE "device_code" IS NOT NULL AND "is_active"
    GROUP BY "tenant_id", "device_code" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'telematics_devices: two ACTIVE devices share a tenant/device_code; reconcile before applying 0021';
  END IF;
END
$$;
--> statement-breakpoint
DROP INDEX IF EXISTS "telematics_devices_serial_number_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "telematics_devices_serial_number_unique"
  ON "telematics_devices" USING btree ("serial_number")
  WHERE "serial_number" IS NOT NULL AND "is_active";
--> statement-breakpoint
DROP INDEX IF EXISTS "telematics_devices_tenant_device_code_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "telematics_devices_tenant_device_code_unique"
  ON "telematics_devices" USING btree ("tenant_id", "device_code")
  WHERE "device_code" IS NOT NULL AND "is_active";
--> statement-breakpoint
COMMENT ON INDEX "telematics_devices_serial_number_unique"
  IS 'An IMEI identifies one physical device, so only one ACTIVE row may claim it — globally, not per tenant. Inactive rows keep their serial as history and do not reserve it.';
--> statement-breakpoint
COMMENT ON INDEX "telematics_devices_tenant_device_code_unique"
  IS 'A device code is a workshop label, so it is unique per tenant among ACTIVE devices. Uncoding frees the label for re-use.';
