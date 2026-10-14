/**
 * One-off seed: the 14 GPS-coded vehicles from the vendor PDFs
 * (~/Downloads/gps almtor) that are not yet in the live fleet.
 *
 * Idempotent: skips any plate, code or IMEI that already exists.
 * Device serials are the vendor IMEIs; devices are GPS_TRACKER + primary.
 *
 * Run: DATABASE_URL=... npx tsx scripts/.seed-gps-fleet-almtor.ts
 */
import { db } from "../src/db";
import { fleetVehicles, telematicsDevices } from "../src/db/schema";
import { eq } from "drizzle-orm";

const ALMOTWER = "32f99b3d-eb5b-4673-9382-78d1f0e1ffbe";

type VType =
  | "MIXER_TRUCK"
  | "CONCRETE_PUMP"
  | "TRANSIT_MIXER"
  | "WATER_TANKER"
  | "SERVICE_TRUCK"
  | "TIPPER_TRUCK";

const MISSING: { plate: string; imei: string; type: VType; label: string }[] = [
  { plate: "5318", imei: "352592572869733", type: "MIXER_TRUCK", label: "غلام" },
  { plate: "3288", imei: "357544372158531", type: "CONCRETE_PUMP", label: "بمب وثيق" },
  { plate: "8143", imei: "357544372160198", type: "MIXER_TRUCK", label: "خلاطة بابندر" },
  { plate: "8137", imei: "357544372160107", type: "MIXER_TRUCK", label: "خلاطة" },
  { plate: "8135", imei: "357544372160131", type: "MIXER_TRUCK", label: "خلاطه بشير" },
  { plate: "8130", imei: "357544372160024", type: "TIPPER_TRUCK", label: "قلاب" },
  { plate: "8136", imei: "357544372158606", type: "TIPPER_TRUCK", label: "قلاب الطاف" },
  { plate: "8131", imei: "357544372186532", type: "MIXER_TRUCK", label: "خلاطه شكيل" },
  { plate: "6533", imei: "354017114553932", type: "CONCRETE_PUMP", label: "بمب" },
  { plate: "6890", imei: "352625697205332", type: "MIXER_TRUCK", label: "خلاطة اوزيل" },
  { plate: "4672", imei: "357073292999600", type: "MIXER_TRUCK", label: "خلاطة" },
  { plate: "8441", imei: "357073293000390", type: "TIPPER_TRUCK", label: "قلاب عادل" },
  { plate: "6206", imei: "352625697205357", type: "MIXER_TRUCK", label: "خلاطة روب شان" },
  { plate: "6215", imei: "357073292994718", type: "TIPPER_TRUCK", label: "قلاب" },
];

async function main() {
  let created = 0;
  let skipped = 0;
  for (const v of MISSING) {
    const dupPlate = await db
      .select({ id: fleetVehicles.id })
      .from(fleetVehicles)
      .where(eq(fleetVehicles.plateNumber, v.plate))
      .limit(1);
    if (dupPlate[0]) {
      console.log(`SKIP plate ${v.plate}: already exists`);
      skipped++;
      continue;
    }
    const dupSerial = await db
      .select({ id: telematicsDevices.id })
      .from(telematicsDevices)
      .where(eq(telematicsDevices.serialNumber, v.imei))
      .limit(1);
    if (dupSerial[0]) {
      console.log(`SKIP imei ${v.imei}: already coded`);
      skipped++;
      continue;
    }
    const [veh] = await db
      .insert(fleetVehicles)
      .values({
        tenantId: ALMOTWER,
        vehicleCode: v.plate,
        plateNumber: v.plate,
        vehicleType: v.type,
        tareWeightTonnes: "0",
        notes: `GPS: ${v.label}`,
      })
      .returning({ id: fleetVehicles.id });
    await db.insert(telematicsDevices).values({
      tenantId: ALMOTWER,
      vehicleId: veh.id,
      deviceType: "GPS_TRACKER",
      serialNumber: v.imei,
      isPrimary: true,
    });
    console.log(`OK ${v.plate} (${v.label}) <- ${v.imei}`);
    created++;
  }
  console.log(`\ndone: ${created} created, ${skipped} skipped`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
