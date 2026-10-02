#!/usr/bin/env node
/**
 * Fimto Concrete ERP — end-to-end test for vehicle device coding
 * =============================================================
 * "ربط وتكويد المركبات" is the operation that decides whether a truck's
 * readings belong to it. This test drives the live HTTP API exactly like the
 * app and the workshop screens do, and asserts the rules that make coding
 * trustworthy:
 *
 *   • a serial identifies ONE physical device, globally
 *   • a device code is unique inside the tenant
 *   • only one primary device per type per vehicle
 *   • another tenant's vehicle can never be coded onto
 *   • uncoding frees the serial for a real re-code, and keeps the history
 *   • reading is not enough to code: FLEET_UPDATE is
 *
 * It creates its own throwaway tenant and removes it, so your data is never
 * touched.
 *
 * Usage:
 *   node scripts/e2e-device-coding.mjs                        # deployed API
 *   node scripts/e2e-device-coding.mjs --base http://127.0.0.1:3112
 *   node scripts/e2e-device-coding.mjs --keep                 # leave fixtures
 *
 * Needs DATABASE_URL (or ~/.config/fimto/backup_dburl) for the fixtures.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

// ── arguments ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = arg("--base", "https://fimto-api-web.onrender.com").replace(/\/$/, "");
const KEEP = args.includes("--keep");

// ── database (the connection string is never printed) ───────────────────────
const secretFile = join(homedir(), ".config", "fimto", "backup_dburl");
const DATABASE_URL =
  process.env.DATABASE_URL ||
  (existsSync(secretFile) ? readFileSync(secretFile, "utf8").trim() : null);
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required (this test seeds its own fixtures)");
  process.exit(2);
}

// ── assertions ───────────────────────────────────────────────────────────────
const lines = [];
let passed = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    lines.push(`  \x1b[32m✓\x1b[0m ${name}${detail ? `  \x1b[2m${detail}\x1b[0m` : ""}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    lines.push(`  \x1b[31m✗\x1b[0m ${name}${detail ? `  ${detail}` : ""} `);
  }
}

function section(title) {
  lines.push(`\n\x1b[1;36m▸ ${title}\x1b[0m`);
}

async function api(pathname, { method = "GET", token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, body: json };
}

// ── fixtures ─────────────────────────────────────────────────────────────────
const stamp = Date.now().toString().slice(-8);
const TENANT_CODE = `COD${stamp}`;
const PASSWORD = `Cod!${stamp}x`;
const ADMIN_EMAIL = `cod-admin-${stamp}@fimto.test`;
const DRIVER_EMAIL = `cod-driver-${stamp}@fimto.test`;
const TRACKER_IMEI = "867994045123456";
const PROBE_IMEI = "867994045654321";

const state = {};

async function seed(pool) {
  section("fixtures: throwaway tenant, an admin (can code) and a driver (cannot)");
  const hash = await bcrypt.hash(PASSWORD, 10);

  const tenant = await pool.query(
    `insert into tenants (tenant_code, company_name, primary_plant_name, country_code, timezone)
     values ($1, $2, $3, 'EG', 'Africa/Cairo') returning id`,
    [TENANT_CODE, `Coding Test ${stamp}`, "Coding Plant"],
  );
  state.tenantId = tenant.rows[0].id;

  const mkUser = async (email, role, code) => {
    const r = await pool.query(
      `insert into users (tenant_id, employee_code, full_name, email, password_hash, role, zone)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [state.tenantId, code, `Coding ${role}`, email, hash, role, "Coding Zone"],
    );
    return r.rows[0].id;
  };
  state.adminId = await mkUser(ADMIN_EMAIL, "SUPER_ADMIN", `CODADM${stamp}`);
  state.driverId = await mkUser(DRIVER_EMAIL, "DRIVER", `CODDRV${stamp}`);

  // A second tenant, used to prove one company cannot code onto another's fleet.
  const other = await pool.query(
    `insert into tenants (tenant_code, company_name, primary_plant_name, country_code, timezone)
     values ($1, $2, $3, 'EG', 'Africa/Cairo') returning id`,
    [`CODX${stamp}`, `Other Company ${stamp}`, "Other Plant"],
  );
  state.otherTenantId = other.rows[0].id;
  state.otherVehicleId = (
    await pool.query(
      `insert into fleet_vehicles (tenant_id, vehicle_code, plate_number, vehicle_type, tare_weight_tonnes)
       values ($1, $2, $3, 'MIXER_TRUCK', 15) returning id`,
      [state.otherTenantId, `OTHER${stamp}`, `OTH ${stamp}`],
    )
  ).rows[0].id;

  check("tenant, second tenant, admin and driver created",
    Boolean(state.tenantId && state.otherTenantId && state.adminId && state.driverId));
}

async function deleteTenantRows(pool, tenantId) {
  const tables = await pool.query(
    `select table_name from information_schema.columns
      where column_name = 'tenant_id' and table_schema = 'public'
      order by table_name`,
  );
  let failed = [];
  for (let pass = 0; pass < 6; pass++) {
    failed = [];
    let deleted = 0;
    for (const { table_name } of tables.rows) {
      try {
        const r = await pool.query(`delete from ${table_name} where tenant_id = $1`, [tenantId]);
        deleted += r.rowCount || 0;
      } catch (err) {
        failed.push(`${table_name}: ${err.message}`);
      }
    }
    if (deleted === 0) break;
  }
  try {
    await pool.query(`delete from tenants where id = $1`, [tenantId]);
  } catch (err) {
    failed.push(`tenants: ${err.message}`);
  }
  return { tables: tables.rows.length, failed };
}

// ── the test ─────────────────────────────────────────────────────────────────
async function run(pool) {
  // 1. sign in ---------------------------------------------------------------
  section("sign in");
  const adminLogin = await api("/api/auth/login", {
    method: "POST",
    body: { email: ADMIN_EMAIL, password: PASSWORD },
  });
  const adminToken = adminLogin.body?.data?.accessToken ?? adminLogin.body?.accessToken;
  check("admin signs in", Boolean(adminToken), `status ${adminLogin.status}`);
  if (!adminToken) return;

  const driverLogin = await api("/api/auth/login", {
    method: "POST",
    body: { email: DRIVER_EMAIL, password: PASSWORD },
  });
  const driverToken = driverLogin.body?.data?.accessToken ?? driverLogin.body?.accessToken;
  check("driver signs in", Boolean(driverToken), `status ${driverLogin.status}`);

  // 2. two vehicles to code onto --------------------------------------------
  section("vehicles");
  const makeVehicle = async (code) => {
    const r = await api("/api/fleet", {
      method: "POST",
      token: adminToken,
      body: {
        vehicleCode: code,
        plateNumber: `${code} PLATE`,
        vehicleType: "MIXER_TRUCK",
        tareWeightTonnes: 15,
      },
    });
    return r;
  };
  const vA = await makeVehicle(`MIXA${stamp}`);
  const vB = await makeVehicle(`MIXB${stamp}`);
  state.vehicleA = vA.body?.data?.id;
  state.vehicleB = vB.body?.data?.id;
  check("two mixers registered", Boolean(state.vehicleA && state.vehicleB),
    `status ${vA.status}/${vB.status}`);

  // 3. code a tracker and a drum probe onto mixer A --------------------------
  section("coding a device onto a vehicle");
  const tracker = await api("/api/fleet/devices", {
    method: "POST",
    token: adminToken,
    body: {
      vehicleId: state.vehicleA,
      deviceType: "GPS_TRACKER",
      serialNumber: TRACKER_IMEI,
      deviceCode: `GPS-${stamp}`,
      isPrimary: true,
    },
  });
  state.trackerId = tracker.body?.data?.id;
  check("GPS tracker coded onto mixer A", tracker.status === 201, `status ${tracker.status}`);
  check("  … and the response echoes the serial back",
    tracker.body?.data?.serialNumber === TRACKER_IMEI);

  const probe = await api("/api/fleet/devices", {
    method: "POST",
    token: adminToken,
    body: {
      vehicleId: state.vehicleA,
      deviceType: "DRUM_RPM",
      serialNumber: PROBE_IMEI,
      deviceCode: `DRUM-${stamp}`,
      isPrimary: true,
    },
  });
  state.probeId = probe.body?.data?.id;
  check("drum-RPM probe coded onto mixer A", probe.status === 201, `status ${probe.status}`);

  // 4. read them back --------------------------------------------------------
  section("reading the registry");
  const list = await api("/api/fleet/devices", { token: adminToken });
  const devices = list.body?.data ?? [];
  check("list returns both devices of the tenant", devices.length === 2,
    `${devices.length} returned`);
  check("  … each one carries the vehicle it is coded onto",
    devices.every((d) => d.vehicleCode && d.plateNumber));
  check("  … serial is reported as coded (not lost)",
    devices.some((d) => d.serialNumber === TRACKER_IMEI));

  const bySerial = await api(`/api/fleet/devices?serial=${TRACKER_IMEI}`, { token: adminToken });
  check("lookup by serial finds the right vehicle",
    bySerial.status === 200 && bySerial.body?.data?.vehicleCode === `MIXA${stamp}`,
    bySerial.body?.data?.vehicleCode ?? `status ${bySerial.status}`);

  const unknown = await api("/api/fleet/devices?serial=000000000000000", { token: adminToken });
  check("lookup of an uncoded serial is 404 DEVICE_NOT_CODED",
    unknown.status === 404 && unknown.body?.errorCode === "DEVICE_NOT_CODED",
    `status ${unknown.status}`);

  // 5. the core rule: one serial, one physical device -----------------------
  section("a serial can only ever be coded once");
  const dupeSerial = await api("/api/fleet/devices", {
    method: "POST",
    token: adminToken,
    body: {
      vehicleId: state.vehicleB,
      deviceType: "GPS_TRACKER",
      serialNumber: TRACKER_IMEI,
    },
  });
  check("re-coding a serial that is in SERVICE on mixer A is refused (409)",
    dupeSerial.status === 409, `status ${dupeSerial.status}`);
  check("  … the error names the vehicle that already holds it",
    dupeSerial.body?.errorCode === "SERIAL_ALREADY_CODED" &&
      dupeSerial.body?.details?.existingVehicleCode === `MIXA${stamp}`,
    dupeSerial.body?.details?.existingVehicleCode ?? dupeSerial.body?.errorCode);
  check("  … and it says which device id is in the way",
    Boolean(dupeSerial.body?.details?.existingDeviceId));

  const dupeCode = await api("/api/fleet/devices", {
    method: "POST",
    token: adminToken,
    body: {
      vehicleId: state.vehicleB,
      deviceType: "GPS_TRACKER",
      serialNumber: "867994045999999",
      deviceCode: `GPS-${stamp}`,
    },
  });
  check("re-using a device code inside the tenant is refused (409)",
    dupeCode.status === 409 && dupeCode.body?.errorCode === "DEVICE_CODE_TAKEN",
    `${dupeCode.status} ${dupeCode.body?.errorCode}`);

  // 6. tenant isolation ------------------------------------------------------
  section("tenant isolation");
  const foreign = await api("/api/fleet/devices", {
    method: "POST",
    token: adminToken,
    body: {
      vehicleId: state.otherVehicleId,
      deviceType: "GPS_TRACKER",
      serialNumber: "867994045777777",
    },
  });
  check("coding onto another company's vehicle is 404, not a leak",
    foreign.status === 404 && foreign.body?.errorCode === "VEHICLE_NOT_FOUND",
    `${foreign.status} ${foreign.body?.errorCode}`);

  const foreignRelink = await api(`/api/fleet/devices/${state.trackerId}`, {
    method: "PATCH",
    token: adminToken,
    body: { vehicleId: state.otherVehicleId },
  });
  check("relinking a device onto another company's vehicle is 404",
    foreignRelink.status === 404, `status ${foreignRelink.status}`);

  const foreignList = await api("/api/fleet/devices", { token: adminToken });
  check("the registry never shows another tenant's vehicles",
    (foreignList.body?.data ?? []).every((d) => d.vehicleCode?.startsWith("MIX")));

  // 7. one primary per type --------------------------------------------------
  section("primary device per type");
  const secondProbe = await api("/api/fleet/devices", {
    method: "POST",
    token: adminToken,
    body: {
      vehicleId: state.vehicleA,
      deviceType: "DRUM_RPM",
      serialNumber: "867994045222222",
      deviceCode: `DRUM2-${stamp}`,
      isPrimary: true,
    },
  });
  check("a replacement primary probe is accepted (201)", secondProbe.status === 201,
    `status ${secondProbe.status}`);

  const afterPromote = await api(
    `/api/fleet/devices?vehicleId=${state.vehicleA}`,
    { token: adminToken }
  );
  const drumPrimaries = (afterPromote.body?.data ?? []).filter(
    (d) => d.deviceType === "DRUM_RPM" && d.isPrimary,
  );
  check("only one DRUM_RPM device is primary after the swap", drumPrimaries.length === 1,
    `${drumPrimaries.length} primary`);
  check("  … and it is the new one",
    drumPrimaries[0]?.serialNumber === "867994045222222");

  // 8. move a device between vehicles ---------------------------------------
  section("moving a device between vehicles");
  const relink = await api(`/api/fleet/devices/${state.trackerId}`, {
    method: "PATCH",
    token: adminToken,
    body: { vehicleId: state.vehicleB },
  });
  check("tracker moved from mixer A to mixer B", relink.status === 200,
    `status ${relink.status}`);
  check("  … the response reports the new vehicle code",
    relink.body?.data?.vehicleCode === `MIXB${stamp}`,
    relink.body?.data?.vehicleCode);

  // 9. uncode frees the serial again, and keeps the history -----------------
  section("uncoding a device");
  const readingsBefore = await pool.query(
    `select count(*)::int as n from telematics_readings where vehicle_id in ($1, $2)`,
    [state.vehicleA, state.vehicleB],
  );
  const uncode = await api(`/api/fleet/devices/${state.probeId}`, {
    method: "DELETE",
    token: adminToken,
  });
  check("probe uncoded (200)", uncode.status === 200, `status ${uncode.status}`);
  check("  … the message states the history is kept",
    typeof uncode.body?.message === "string" && /history|kept/i.test(uncode.body.message),
    uncode.body?.message);

  // Checked before the re-code below, while the serial is genuinely free.
  // After re-coding it must resolve to the new truck — which is the last
  // assertion in this section.
  section("an uncoded device stops claiming a vehicle");
  const probeSerialAfterUncode = await api(
    `/api/fleet/devices?serial=${PROBE_IMEI}`,
    { token: adminToken },
  );
  const freed = probeSerialAfterUncode.body?.data;
  check("an uncoded serial no longer claims to be on the old truck",
    probeSerialAfterUncode.status === 200 && freed?.isActive === false,
    `status ${probeSerialAfterUncode.status} isActive=${freed?.isActive}`);
  check("  … but it still reports where it came from (history, not fiction)",
    freed?.vehicleCode === `MIXA${stamp}`, freed?.vehicleCode);
  check("  … and the wording says it is free to re-code, not that it is there",
    /uncoded|available/i.test(probeSerialAfterUncode.body?.message ?? ""),
    probeSerialAfterUncode.body?.message);

  section("re-using the freed identity");
  const recode = await api("/api/fleet/devices", {
    method: "POST",
    token: adminToken,
    body: {
      vehicleId: state.vehicleB,
      deviceType: "DRUM_RPM",
      serialNumber: PROBE_IMEI,
      deviceCode: `DRUM3-${stamp}`,
      isPrimary: true,
    },
  });
  check("the freed serial can now be coded onto another vehicle (201)",
    recode.status === 201, `status ${recode.status}`);

  const uncodedRow = await pool.query(
    `select is_active from telematics_devices where id = $1`,
    [state.probeId],
  );
  check("the uncoded row is deactivated, not deleted",
    uncodedRow.rows[0]?.is_active === false);
  const readingsAfter = await pool.query(
    `select count(*)::int as n from telematics_readings where vehicle_id in ($1, $2)`,
    [state.vehicleA, state.vehicleB],
  );
  check("no reading was destroyed by uncoding",
    readingsAfter.rows[0].n === readingsBefore.rows[0].n,
    `${readingsBefore.rows[0].n} → ${readingsAfter.rows[0].n}`);

  const hiddenFromList = await api("/api/fleet/devices", { token: adminToken });
  check("the uncoded device no longer appears in the registry",
    !(hiddenFromList.body?.data ?? []).some((d) => d.id === state.probeId));
  const withInactive = await api("/api/fleet/devices?includeInactive=true", {
    token: adminToken,
  });
  check("  … but it is still visible when history is needed",
    (withInactive.body?.data ?? []).some((d) => d.id === state.probeId));

  // The lookup must now follow the hardware to the truck it is really on.
  const freedLookup = await api(`/api/fleet/devices?serial=${PROBE_IMEI}`, {
    token: adminToken,
  });
  check("after re-coding, the same IMEI resolves to its new vehicle",
    freedLookup.body?.data?.isActive === true &&
      freedLookup.body?.data?.vehicleCode === `MIXB${stamp}`,
    freedLookup.body?.data?.vehicleCode);
  check("  … and the old inactive row survives as history, not as a second claim",
    (withInactive.body?.data ?? []).filter((d) => d.serialNumber === PROBE_IMEI).length === 2,
    `${(withInactive.body?.data ?? []).filter((d) => d.serialNumber === PROBE_IMEI).length} rows`);

  // 10. archived vehicle ----------------------------------------------------
  section("archived vehicles");
  const archived = await pool.query(
    `update fleet_vehicles set is_active = false where id = $1 returning id`,
    [state.vehicleB],
  );
  const ontoArchived = await api("/api/fleet/devices", {
    method: "POST",
    token: adminToken,
    body: {
      vehicleId: state.vehicleB,
      deviceType: "CONCRETE_TEMP",
      serialNumber: "867994045333333",
    },
  });
  check("coding onto an archived vehicle is refused (409)",
    ontoArchived.status === 409 && ontoArchived.body?.errorCode === "VEHICLE_INACTIVE",
    `${ontoArchived.status} ${ontoArchived.body?.errorCode}`);
  await pool.query(`update fleet_vehicles set is_active = true where id = $1`,
    [archived.rows[0]?.id]);

  // 10b. a coded device actually routes readings to its vehicle ----------
  // This is the whole point of coding: the probe only knows its own IMEI, so
  // the serial → vehicle link is what makes its drum data attributable.
  section("a coded probe's readings land on the right vehicle");
  const ingestKey =
    process.env.TELEMATICS_INGEST_KEY || "fimto-telematics-dev-key-change-me";

  const ingest = (truckId) =>
    fetch(`${BASE}/api/v1/telematics/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Integration-Key": ingestKey,
      },
      body: JSON.stringify({ truck_id: truckId, drum_rpm: 12, source: "DEVICE" }),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

  const imeiIngest = await ingest(TRACKER_IMEI);
  check("a reading under the device IMEI is accepted, not 'unknown truck'",
    imeiIngest.status === 200 && imeiIngest.body?.data?.unknownTrucks === 0,
    `status ${imeiIngest.status} unknown=${imeiIngest.body?.data?.unknownTrucks}`);
  check("  … and it is actually stored",
    imeiIngest.body?.data?.accepted === 1, `accepted=${imeiIngest.body?.data?.accepted}`);

  const landed = await pool.query(
    `select vehicle_id from telematics_readings
      where tenant_id = $1 order by captured_at desc limit 1`,
    [state.tenantId],
  );
  check("  … against the vehicle the device is coded onto, not a guess",
    landed.rows[0]?.vehicle_id === state.vehicleB,
    landed.rows[0]?.vehicle_id === state.vehicleB ? "" : `got ${landed.rows[0]?.vehicle_id}`);

  const deviceSeen = await pool.query(
    `select last_seen_at from telematics_devices where id = $1`,
    [state.trackerId],
  );
  check("the device's lastSeenAt is stamped by its own reporting",
    deviceSeen.rows[0]?.last_seen_at !== null);

  const codeIngest = await ingest(`MIXA${stamp}`);
  check("reporting by vehicle code still works (unchanged behaviour)",
    codeIngest.status === 200 && codeIngest.body?.data?.accepted === 1,
    `status ${codeIngest.status}`);

  const uncodedImei = await ingest("867994045000000");
  check("an IMEI nobody coded is rejected as an unknown truck",
    uncodedImei.status === 200 && uncodedImei.body?.data?.accepted === 0 &&
      uncodedImei.body?.data?.unknownTrucks === 1,
    `accepted=${uncodedImei.body?.data?.accepted}`);

  // 11. permissions ---------------------------------------------------------
  section("permissions");
  const driverRead = await api("/api/fleet/devices", { token: driverToken });
  check("a driver may read the registry (200)", driverRead.status === 200,
    `status ${driverRead.status}`);
  const driverCode = await api("/api/fleet/devices", {
    method: "POST",
    token: driverToken,
    body: {
      vehicleId: state.vehicleA,
      deviceType: "GPS_TRACKER",
      serialNumber: "867994045444444",
    },
  });
  check("a driver may NOT code a device (403)",
    driverCode.status === 403, `status ${driverCode.status}`);

  const anon = await api("/api/fleet/devices");
  check("an anonymous call is refused (401)", anon.status === 401,
    `status ${anon.status}`);

  // 12. validation ----------------------------------------------------------
  section("validation");
  const noIdentity = await api("/api/fleet/devices", {
    method: "POST",
    token: adminToken,
    body: { vehicleId: state.vehicleA, deviceType: "GPS_TRACKER" },
  });
  check("a device with no serial and no code is refused (400)",
    noIdentity.status === 400, `status ${noIdentity.status}`);

  const badType = await api("/api/fleet/devices", {
    method: "POST",
    token: adminToken,
    body: { vehicleId: state.vehicleA, deviceType: "TELEPORTER", serialNumber: "12345678" },
  });
  check("an unknown deviceType is refused (400)", badType.status === 400,
    `status ${badType.status}`);

  const badVehicle = await api("/api/fleet/devices", {
    method: "POST",
    token: adminToken,
    body: { vehicleId: "not-a-uuid", deviceType: "GPS_TRACKER", serialNumber: "12345678" },
  });
  check("a malformed vehicleId is refused (400)", badVehicle.status === 400,
    `status ${badVehicle.status}`);

  const badSerial = await api("/api/fleet/devices", {
    method: "POST",
    token: adminToken,
    body: { vehicleId: state.vehicleA, deviceType: "GPS_TRACKER", serialNumber: "ab" },
  });
  check("an impossibly short serial is refused (400)", badSerial.status === 400,
    `status ${badSerial.status}`);

  const badDeviceId = await api("/api/fleet/devices/not-a-uuid", {
    method: "DELETE",
    token: adminToken,
  });
  check("a malformed device id is refused (400)", badDeviceId.status === 400,
    `status ${badDeviceId.status}`);

  // 13. audit trail ---------------------------------------------------------
  section("audit trail");
  const audit = await pool.query(
    `select action from audit_logs where tenant_id = $1 and entity_type = 'telematics_devices'`,
    [state.tenantId],
  );
  const actions = audit.rows.map((r) => r.action);
  for (const action of ["DEVICE_CODED", "DEVICE_RELINKED", "DEVICE_UNCODED"]) {
    check(`${action} is written to the audit log`, actions.includes(action));
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
const pool = new Pool({ connectionString: DATABASE_URL, max: 4 });
let exitCode = 0;

console.log(`\x1b[1;36m▸ device coding end-to-end against ${BASE}\x1b[0m`);

try {
  await seed(pool);
  await run(pool);
} catch (err) {
  failures.push(`threw: ${err.message}`);
  lines.push(`  \x1b[31m✗\x1b[0m threw: ${err.message}`);
  if (process.env.DEBUG) console.error(err);
} finally {
  if (!KEEP && state.tenantId) {
    lines.push(`\n\x1b[1;36m▸ cleaning up the throwaway tenant\x1b[0m`);
    const cleanup = await deleteTenantRows(pool, state.tenantId);
    await deleteTenantRows(pool, state.otherTenantId);
    const leftovers = cleanup.failed.filter((f) => !/null value|violates not-null/i.test(f));
    check(
      "every fixture row was removed",
      leftovers.length === 0,
      leftovers.length ? leftovers.slice(0, 3).join("; ") : "",
    );
  }
  await pool.end();
}

console.log(lines.join("\n"));
const total = passed + failures.length;
console.log(
  `\n\x1b[1m${passed}/${total} passed\x1b[0m` +
    (failures.length ? `  \x1b[31m${failures.length} failed\x1b[0m` : ""),
);
if (failures.length) {
  console.log("\n\x1b[31mfailures:\x1b[0m");
  for (const f of failures) console.log(`  · ${f}`);
  exitCode = 1;
}
process.exit(exitCode);