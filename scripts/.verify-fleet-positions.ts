/**
 * Verifies getFleetPositions: distances, nearest site, geofence, staleness,
 * subset filtering, and tenant isolation.
 *
 * ── Why this runs against its own throwaway tenant ───────────────────────────
 * An earlier version ran against ALMOTWER and asserted "exactly 1 vehicle
 * positioned", "25 left without a fix", "0 positions when nothing has reported".
 * Every one of those numbers is only true when the tenant happens to hold zero
 * readings — so the moment the tenant got real data (or the DEMO_SEED rows that
 * make the map demonstrable) this script failed, and a verification that breaks
 * when the thing it verifies is in use is a verification nobody runs.
 *
 * So the suite owns its fixture: a scratch tenant with its own three sites and
 * its own vehicles, created at the start and dropped in a `finally`. It cannot be
 * perturbed by real traffic and it cannot perturb real traffic.
 *
 * Run: DATABASE_URL=... npx tsx scripts/.verify-fleet-positions.ts
 */
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import {
  getFleetPositions,
  STALE_AFTER_MINUTES,
} from "../src/lib/services/fleet-position.service";

/** A tenant id that must match no real row. */
const OTHER = "00000000-0000-0000-0000-000000000000";

/** The real plant, used only to assert that live data is internally consistent. */
const ALMOTWER = "32f99b3d-eb5b-4673-9382-78d1f0e1ffbe";

const HQ = { lat: 24.7136, lng: 46.6753, r: 300 };
const JED = { lat: 21.4858, lng: 39.1925, r: 250 };
const DMM = { lat: 26.4207, lng: 50.0888, r: 200 };

/**
 * Probe rows are tagged with this `source` so cleanup finds them by marker rather
 * than by id. An earlier version tracked ids and leaked a row whenever a step
 * threw between the INSERT and the push — which is exactly when cleanup matters.
 * `VERIFY_PROBE` is not a value the ingest API accepts, so probe data can never
 * be mistaken for a device fix.
 */
const PROBE = "VERIFY_PROBE";

let TENANT = "";
let tenantRowId: string | null = null;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  PASS  ${msg}`);
}

// ─── fixture ──────────────────────────────────────────────────────────────────

async function createTenant(): Promise<void> {
  const t = await db.execute(sql`
    INSERT INTO tenants (tenant_code, company_name)
    VALUES (${`VERIFY_FLEET_${Date.now()}`}, 'fleet-position verification')
    RETURNING id
  `);
  tenantRowId = (t.rows as { id: string }[])[0].id;
  TENANT = tenantRowId;

  for (const s of [
    { code: "HQ", name: "verify plant", type: "PLANT", lat: HQ.lat, lng: HQ.lng, r: HQ.r, primary: true },
    { code: "BR-JED", name: "verify jeddah", type: "BRANCH", lat: JED.lat, lng: JED.lng, r: JED.r, primary: false },
    { code: "BR-DMM", name: "verify dammam", type: "BRANCH", lat: DMM.lat, lng: DMM.lng, r: DMM.r, primary: false },
  ]) {
    await db.execute(sql`
      INSERT INTO sites
        (tenant_id, site_code, site_name, site_type, latitude, longitude,
         geofence_radius_metres, is_primary)
      VALUES (${TENANT}::uuid, ${s.code}, ${s.name}, ${s.type}, ${s.lat}, ${s.lng}, ${s.r}, ${s.primary})
    `);
  }

  // `vehicle_code` and `plate_number` carry GLOBAL unique indexes, not per-tenant
  // ones, so fixed codes collide with the debris of any previous run that failed to
  // tear down. Suffixing with the run id keeps the fixture collision-proof.
  const run = Date.now().toString().slice(-7);
  for (const n of ["1", "2", "3"]) {
    const code = `VFY${run}-${n}`;
    await db.execute(sql`
      INSERT INTO fleet_vehicles
        (tenant_id, vehicle_code, plate_number, vehicle_type, tare_weight_tonnes)
      VALUES (${TENANT}::uuid, ${code}, ${code}, 'MIXER_TRUCK', 12.5)
    `);
  }
}

async function dropTenant(): Promise<void> {
  if (!tenantRowId) return;
  // 72 tables reference tenants with ON DELETE NO ACTION or RESTRICT — almost
  // nothing cascades, so a bare DELETE FROM tenants fails the moment anything
  // references it. Children first.
  await db.execute(sql`DELETE FROM telematics_readings WHERE tenant_id = ${tenantRowId}::uuid`);
  // `sites_guard_primary()` refuses to let the last primary site be removed,
  // which is correct for a real company but blocks teardown. Demoting it first
  // is permitted: the trigger short-circuits on an UPDATE that leaves the site
  // active, so this is the sanctioned way to hand the flag over.
  await db.execute(
    sql`UPDATE sites SET is_primary = false WHERE tenant_id = ${tenantRowId}::uuid AND is_primary`
  );
  await db.execute(sql`DELETE FROM sites WHERE tenant_id = ${tenantRowId}::uuid`);
  await db.execute(sql`DELETE FROM fleet_vehicles WHERE tenant_id = ${tenantRowId}::uuid`);
  await db.execute(sql`DELETE FROM tenants WHERE id = ${tenantRowId}::uuid`);
}

async function vehicleIds(n: number): Promise<string[]> {
  const rows = await db.execute(sql`
    SELECT id FROM fleet_vehicles
    WHERE tenant_id = ${TENANT}::uuid AND is_active = true
    ORDER BY vehicle_code LIMIT ${n}
  `);
  return (rows.rows as { id: string }[]).map((r) => r.id);
}

async function insert(
  vehicleId: string,
  lat: number,
  lng: number,
  ageMinutes: number
): Promise<void> {
  await db.execute(sql`
    INSERT INTO telematics_readings
      (tenant_id, vehicle_id, latitude, longitude, source, captured_at, speed_kmh)
    VALUES (${TENANT}::uuid, ${vehicleId}::uuid, ${lat}, ${lng}, ${PROBE},
            now() - (${ageMinutes} * interval '1 minute'), 42.5)
  `);
}

/** Removes this run's probe readings only — never the tenant's real data. */
async function cleanup(): Promise<void> {
  const res = await db.execute(
    sql`DELETE FROM telematics_readings
        WHERE tenant_id = ${TENANT}::uuid AND source = ${PROBE} RETURNING id`
  );
  const n = (res.rows as { id: string }[]).length;
  if (n > 0) console.log(`\ncleaned up ${n} synthetic reading(s)`);
}

// ─── assertions ───────────────────────────────────────────────────────────────

async function main() {
  await createTenant();
  console.log(`scratch tenant ${TENANT} with 3 sites and 3 vehicles\n`);
  const [v0, v1, v2] = await vehicleIds(3);

  try {
    // ── 1. Empty fleet: nothing has reported ─────────────────────────────────
    let res = await getFleetPositions(TENANT);
    console.log(`[1] nothing has reported yet`);
    assert(res.positions.length === 0, "no positions returned");
    assert(res.vehiclesWithoutFix === 3, `all 3 vehicles counted as having no fix (got ${res.vehiclesWithoutFix})`);
    assert(res.hasPrimarySite === true, "primary site detected");
    assert(res.siteCount === 3, `3 active sites (got ${res.siteCount})`);

    // ── 2. A truck sitting exactly on the plant gate ──────────────────────────
    await insert(v0, HQ.lat, HQ.lng, 0);
    res = await getFleetPositions(TENANT);
    console.log(`\n[2] one truck exactly on the plant gate`);
    assert(res.positions.length === 1, "1 vehicle positioned");
    let p = res.positions[0];
    assert(p.distanceToPrimaryMetres === 0, `distance to plant = 0 (got ${p.distanceToPrimaryMetres})`);
    assert(p.isInsidePrimaryGeofence === true, "inside the plant geofence");
    assert(p.isStale === false, "not stale");
    assert(p.nearestSite?.siteCode === "HQ", `nearest site = HQ (got ${p.nearestSite?.siteCode})`);
    assert(p.ageMinutes === 0, "age 0 min");

    // ── 3. Same fix, but the tracker stopped reporting ───────────────────────
    await cleanup();
    await insert(v0, HQ.lat, HQ.lng, 95);
    res = await getFleetPositions(TENANT);
    console.log(`\n[3] same fix, but 95 minutes old`);
    p = res.positions[0];
    assert(p.isStale === true, `isStale true (age ${p.ageMinutes} > ${STALE_AFTER_MINUTES})`);
    assert(p.ageMinutes >= 94, `ageMinutes reported (${p.ageMinutes})`);
    assert(p.distanceToPrimaryMetres === 0, "distance still computed despite staleness");

    // ── 4. Nearest site is the BRANCH, not the plant, when closer ────────────
    await cleanup();
    // 0.5 degrees north of Jeddah ≈ 55 km — nearer Jeddah than Riyadh by far.
    await insert(v0, JED.lat + 0.5, JED.lng, 1);
    await insert(v1, DMM.lat, DMM.lng, 1);
    await insert(v2, HQ.lat, HQ.lng, 1);
    res = await getFleetPositions(TENANT);
    console.log(`\n[4] three trucks, one at each site`);
    assert(res.positions.length === 3, "3 vehicles positioned");
    assert(res.vehiclesWithoutFix === 0, `none left without a fix (got ${res.vehiclesWithoutFix})`);
    const byNear = Object.fromEntries(
      res.positions.map((x) => [x.nearestSite!.siteCode, x])
    );
    assert(!!byNear["BR-JED"], "a truck is nearest to BR-JED");
    assert(byNear["BR-JED"].isInsidePrimaryGeofence === false, "Jeddah truck is NOT inside the plant fence");
    assert(byNear["BR-JED"].distanceToPrimaryMetres! > 800_000, `Jeddah→plant is long (${byNear["BR-JED"].distanceToPrimaryMetres} m)`);
    assert(byNear["BR-DMM"].nearestSite!.siteCode === "BR-DMM", "Dammam truck's nearest site is BR-DMM");
    assert(byNear["HQ"].isInsidePrimaryGeofence === true, "plant truck IS inside the plant fence");
    assert(byNear["HQ"].nearestSite!.siteCode === "HQ", "plant truck's nearest site is HQ");

    // ── 5. Geofence boundary: inside at half radius, outside at 1.5x ─────────
    await cleanup();
    const halfDeg = (HQ.r / 111_320) * 0.5;
    await insert(v0, HQ.lat + halfDeg, HQ.lng, 0);
    res = await getFleetPositions(TENANT);
    console.log(`\n[5] geofence boundary around the plant (r=${HQ.r} m)`);
    assert(res.positions[0].isInsidePrimaryGeofence === true, `~${Math.round(HQ.r / 2)} m -> inside`);

    await cleanup();
    await insert(v0, HQ.lat + (HQ.r / 111_320) * 1.5, HQ.lng, 0);
    res = await getFleetPositions(TENANT);
    assert(res.positions[0].isInsidePrimaryGeofence === false, `~${Math.round(HQ.r * 1.5)} m -> outside`);

    // ── 6. Telemetry-only rows (NULL coords) must not blank out a position ───
    await cleanup();
    await insert(v0, HQ.lat, HQ.lng, 30); // the real fix, older
    await db.execute(sql`
      INSERT INTO telematics_readings (tenant_id, vehicle_id, drum_rpm, source, captured_at)
      VALUES (${TENANT}::uuid, ${v0}::uuid, 88, ${PROBE}, now())
    `);
    res = await getFleetPositions(TENANT);
    console.log(`\n[6] a newer row exists but has no coordinates`);
    assert(res.positions.length === 1, "still positioned");
    assert(res.positions[0].distanceToPrimaryMetres === 0, "used the row that actually HAD a fix");
    assert(res.positions[0].ageMinutes >= 29, "age came from the fix, not the telemetry row");

    // ── 7. Filtering to a subset ─────────────────────────────────────────────
    await cleanup();
    await insert(v0, HQ.lat, HQ.lng, 0);
    await insert(v1, DMM.lat, DMM.lng, 0);
    res = await getFleetPositions(TENANT, { vehicleIds: [v1] });
    console.log(`\n[7] filtered to one vehicle`);
    assert(res.positions.length === 1, "only the requested vehicle");
    assert(res.positions[0].vehicleId === v1, "and it is the right one");

    // ── 8. Tenant isolation ──────────────────────────────────────────────────
    res = await getFleetPositions(OTHER);
    console.log(`\n[8] unknown tenant`);
    assert(res.positions.length === 0, "no positions leak");
    assert(res.siteCount === 0, "no sites leak");
    assert(res.hasPrimarySite === false, "no primary site reported");

    // ── 9. The live tenant is internally consistent ──────────────────────────
    // The count is not fixed — the live fleet is real and may have any number of
    // fixes. What must always hold is that every active vehicle is accounted for
    // exactly once, so no vehicle can silently vanish from the map.
    const live = await getFleetPositions(ALMOTWER);
    const cnt = await db.execute(sql`
      SELECT count(*)::int AS n FROM fleet_vehicles
      WHERE tenant_id = ${ALMOTWER}::uuid AND is_active = true
    `);
    const active = (cnt.rows as { n: number }[])[0]?.n ?? 0;
    console.log(`\n[9] live tenant (${live.positions.length} positioned, ${active} active vehicles)`);
    assert(
      live.positions.length + live.vehiclesWithoutFix === active,
      `positions + withoutFix accounts for every active vehicle (${live.positions.length} + ${live.vehiclesWithoutFix} = ${active})`
    );
    assert(live.hasPrimarySite === true, "live tenant has a primary site");
    assert(
      new Set(live.positions.map((x) => x.vehicleId)).size === live.positions.length,
      "no duplicate vehicles in the response"
    );
    assert(
      live.positions.every((x) => x.isStale === (x.ageMinutes > STALE_AFTER_MINUTES)),
      `isStale agrees with STALE_AFTER_MINUTES (${STALE_AFTER_MINUTES}) for every row`
    );

    console.log("\nAll fleet-position checks passed.");
  } finally {
    await cleanup();
    await dropTenant();
    console.log("scratch tenant dropped.");
  }
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  process.exitCode = 1;
});