/**
 * Seeds SYNTHETIC GPS telemetry so the fleet map has something to draw.
 *
 * ── Why this exists, stated plainly ───────────────────────────────────────────
 * The 28 trackers are registered and enabled, but none of them has ever
 * transmitted, because they are not installed in the trucks yet and the vendor's
 * platform has no endpoint to send to. So `/api/fleet/positions` correctly returns
 * zero rows and the map is genuinely empty. This script fabricates plausible
 * positions so the map, the geofence badges, the distance maths and the staleness
 * greying can all be seen working before the hardware arrives.
 *
 * ── This is FAKE DATA and is labelled as such ─────────────────────────────────
 * Every row is written with `source = 'DEMO_SEED'`, which is deliberately NOT one
 * of the three values the ingest API accepts (`DEVICE`, `DRIVER_APP`,
 * `GPS_VENDOR`). That means:
 *   • nothing here can be confused with a real tracker fix, by us or later;
 *   • the instant the real devices start reporting, you can prove which rows are
 *     the fakes with one query;
 *   • it is removed in one command (see below), and running this again replaces it
 *     rather than accumulating.
 *
 * The geo maths is real, not mocked: rows go in as raw coordinates and every
 * distance, bearing, geofence and staleness figure on screen is computed by the
 * production code from them.
 *
 * Run:   DATABASE_URL=... npx tsx scripts/.seed-demo-fleet-positions.ts
 * Undo: psql "$DATABASE_URL" -c "DELETE FROM telematics_readings WHERE source='DEMO_SEED'"
 */
import { sql } from "drizzle-orm";
import { db } from "../src/db";

const TENANT_CODE = "ALMOTWER";
const SOURCE = "DEMO_SEED";

/**
 * Where the trucks plausibly are. Coordinates are real places so the map lands on
 * recognisable ground rather than in the Gulf.
 */
const HQ = { lat: 24.7136, lng: 46.6753 }; // the plant

type Placement = {
  /** index into the tenant's vehicle list */
  pick: number;
  lat: number;
  lng: number;
  speedKmh: number;
  /** minutes before now; large values render as stale (greyed) markers */
  ageMinutes: number;
  note: string;
};

const PLACEMENTS: Placement[] = [
  // ── At the plant: some inside the 300 m geofence, some just outside ──
  { pick: 0,  lat: HQ.lat,               lng: HQ.lng,              speedKmh: 0,  ageMinutes: 1,    note: "at the batching gate" },
  { pick: 1,  lat: HQ.lat + 0.0009,      lng: HQ.lng - 0.0012,     speedKmh: 0,  ageMinutes: 2,    note: "inside geofence, waiting to load" },
  { pick: 2,  lat: HQ.lat - 0.0016,      lng: HQ.lng + 0.0011,     speedKmh: 0,  ageMinutes: 3,    note: "inside geofence, at the weighbridge" },
  { pick: 3,  lat: HQ.lat + 0.0021,      lng: HQ.lng + 0.0019,     speedKmh: 0,  ageMinutes: 4,    note: "just outside the fence (~260 m)" },
  { pick: 4,  lat: HQ.lat - 0.0044,      lng: HQ.lng + 0.0031,     speedKmh: 18, ageMinutes: 2,    note: "leaving the yard" },
  { pick: 5,  lat: HQ.lat + 0.0068,      lng: HQ.lng - 0.0052,     speedKmh: 41, ageMinutes: 1,    note: "on the plant access road" },

  // ── Around Riyadh, out at customers ──
  { pick: 6,  lat: 24.8069, lng: 46.8553, speedKmh: 52, ageMinutes: 6,  note: "Exit 18 industrial area" },
  { pick: 7,  lat: 24.8233, lng: 46.6100, speedKmh: 0,  ageMinutes: 12, note: "Al Malqa site, discharging" },
  { pick: 8,  lat: 24.6944, lng: 46.6853, speedKmh: 0,  ageMinutes: 22, note: "Al Olaya tower pour, parked" },
  { pick: 9,  lat: 24.7401, lng: 46.8219, speedKmh: 63, ageMinutes: 3,  note: "running north-east" },
  { pick: 10, lat: 24.6521, lng: 46.7420, speedKmh: 47, ageMinutes: 5,  note: "south-east approach" },
  { pick: 11, lat: 24.7803, lng: 46.6012, speedKmh: 0,  ageMinutes: 35, note: "Al Aqiq, on site 35 min" },
  { pick: 12, lat: 24.8612, lng: 46.7194, speedKmh: 38, ageMinutes: 8,  note: "north towards Khurais" },
  { pick: 13, lat: 24.6189, lng: 46.8203, speedKmh: 55, ageMinutes: 4,  note: "eastbound" },
  { pick: 14, lat: 24.7555, lng: 46.6098, speedKmh: 0,  ageMinutes: 48, note: "yard, drum washed" },
  { pick: 15, lat: 24.6998, lng: 46.9247, speedKmh: 71, ageMinutes: 2,  note: "fast on the ring road" },
  { pick: 16, lat: 24.8856, lng: 46.5501, speedKmh: 44, ageMinutes: 11, note: "north-west" },
  { pick: 17, lat: 24.5702, lng: 46.7015, speedKmh: 0,  ageMinutes: 65, note: "south of the plant, waiting on return" },

  // ── Stale: these are the ones that must render GREY ──
  { pick: 18, lat: 24.7102, lng: 46.6631, speedKmh: 0,  ageMinutes: 145, note: "STALE 2h25m — tracker silent" },
  { pick: 19, lat: 24.8899, lng: 46.9302, speedKmh: 33, ageMinutes: 96,  note: "STALE 1h36m — last seen heading east" },

  // ── The other branch ──
  { pick: 20, lat: 21.4858, lng: 39.1925, speedKmh: 0,  ageMinutes: 3,  note: "Jeddah branch" },
  { pick: 21, lat: 21.5234, lng: 39.1452, speedKmh: 58, ageMinutes: 5,  note: "Jeddah → customer" },
  { pick: 22, lat: 21.4489, lng: 39.2418, speedKmh: 44, ageMinutes: 14, note: "south of Jeddah" },

  { pick: 23, lat: 26.4207, lng: 50.0888, speedKmh: 0,  ageMinutes: 7,  note: "Dammam branch" },
  { pick: 24, lat: 26.3721, lng: 50.1402, speedKmh: 61, ageMinutes: 4,  note: "Dammam → site" },
  { pick: 25, lat: 26.5103, lng: 50.0211, speedKmh: 49, ageMinutes: 9,  note: "north of Dammam" },

  // ── A few left at the plant, unassigned ──
  { pick: 26, lat: HQ.lat + 0.0012, lng: HQ.lng + 0.0014, speedKmh: 0, ageMinutes: 6,  note: "parked at the plant" },
  { pick: 27, lat: HQ.lat - 0.0007, lng: HQ.lng - 0.0009, speedKmh: 0, ageMinutes: 10, note: "parked at the plant" },
];

async function main() {
  const t = await db.execute(
    sql`SELECT id FROM tenants WHERE tenant_code = ${TENANT_CODE} LIMIT 1`
  );
  const tenantId = (t.rows as { id: string }[])[0]?.id;
  if (!tenantId) throw new Error(`tenant ${TENANT_CODE} not found`);

  const v = await db.execute(
    sql`SELECT id, vehicle_code FROM fleet_vehicles
        WHERE tenant_id = ${tenantId} AND is_active = true
        ORDER BY vehicle_code`
  );
  const vehicles = v.rows as { id: string; vehicle_code: string }[];
  if (vehicles.length === 0) throw new Error("no active vehicles in tenant");

  // Idempotent: replace any previous demo data rather than piling up.
  const wiped = await db.execute(
    sql`DELETE FROM telematics_readings
        WHERE tenant_id = ${tenantId} AND source = ${SOURCE}`
  );
  console.log(`removed ${wiped.rowCount ?? 0} previous ${SOURCE} row(s)`);

  console.log(`\nseeding ${PLACEMENTS.length} synthetic fix(es) across ${vehicles.length} vehicle(s)\n`);

  let n = 0;
  for (const p of PLACEMENTS) {
    const vehicle = vehicles[p.pick % vehicles.length];
    await db.execute(sql`
      INSERT INTO telematics_readings
        (tenant_id, vehicle_id, latitude, longitude, speed_kmh, source, captured_at)
      VALUES (
        ${tenantId}::uuid,
        ${vehicle.id}::uuid,
        ${p.lat},
        ${p.lng},
        ${p.speedKmh},
        ${SOURCE},
        now() - (${p.ageMinutes} * interval '1 minute')
      )
    `);
    n++;
    const age = p.ageMinutes >= 60 ? `${Math.floor(p.ageMinutes / 60)}h${p.ageMinutes % 60}m` : `${p.ageMinutes}m`;
    const flag = p.ageMinutes > 90 ? "  <-- will render STALE" : "";
    console.log(`  ${vehicle.vehicle_code.padEnd(8)} ${age.padStart(6)} old  ${p.note}${flag}`);
  }

  console.log(`\n${n} row(s) written with source='${SOURCE}'.`);
  console.log(`\nThe map:  /#/sites  →  تبويب "الأسطول"  →  زر "تحديث"`);
  console.log(`\nRe-run this script to refresh them — the fixes are timestamped, so they`);
  console.log(`keep ageing and everything greys out as stale after ${15} minutes.`);
  console.log(`Undo with:  DELETE FROM telematics_readings WHERE source='${SOURCE}'`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });