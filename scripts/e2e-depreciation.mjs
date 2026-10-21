#!/usr/bin/env node
/**
 * Fimto ERP — end-to-end test for «اهلاك معدات» + صندوق تجديد الأصول
 * ==================================================================
 * Creates its own throwaway tenant, drives the public HTTP API exactly like
 * the web app does, asserts every step, then deletes everything it made.
 *
 * Usage:
 *   node scripts/e2e-depreciation.mjs                       # deployed API
 *   node scripts/e2e-depreciation.mjs --base http://127.0.0.1:3111
 *   node scripts/e2e-depreciation.mjs --keep
 */

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = arg("--base", "https://fimto-api-web.onrender.com").replace(/\/$/, "");
const KEEP = args.includes("--keep");

const secretFile = join(homedir(), ".config", "fimto", "backup_dburl");
const DATABASE_URL =
  process.env.DATABASE_URL || (existsSync(secretFile) ? readFileSync(secretFile, "utf8").trim() : null);
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(2);
}

let passed = 0;
const failures = [];
const lines = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    lines.push(`  \x1b[32m✓\x1b[0m ${name}${detail ? `  \x1b[2m${detail}\x1b[0m` : ""}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    lines.push(`  \x1b[31m✗\x1b[0m ${name}${detail ? `  ${detail}` : ""}`);
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
    /* empty */
  }
  return { status: res.status, body: json };
}
const sar = (cents) => (Number(cents || 0) / 100).toFixed(2);

const stamp = Date.now().toString().slice(-8);
const TENANT_CODE = `E2ED${stamp}`;
const PASSWORD = `E2e!${stamp}x`;
const ADMIN_EMAIL = `e2e-dep-${stamp}@fimto.test`;
const state = {};

async function seed(pool) {
  section("fixtures: throwaway tenant, admin, vehicle and equipment");
  const hash = await bcrypt.hash(PASSWORD, 10);
  const tenant = await pool.query(
    `insert into tenants (tenant_code, company_name, primary_plant_name, country_code, timezone)
     values ($1, $2, $3, 'EG', 'Africa/Cairo') returning id`,
    [TENANT_CODE, `E2E Dep ${stamp}`, "E2E Plant"],
  );
  state.tenantId = tenant.rows[0].id;

  const user = await pool.query(
    `insert into users (tenant_id, employee_code, full_name, email, password_hash, role, zone)
     values ($1, $2, $3, $4, $5, 'SUPER_ADMIN', 'E2E Zone') returning id`,
    [state.tenantId, `E2EDADM${stamp}`, "E2E Admin", ADMIN_EMAIL, hash],
  );
  state.adminId = user.rows[0].id;

  const veh = await pool.query(
    `insert into fleet_vehicles (tenant_id, vehicle_code, plate_number, vehicle_type, vehicle_class,
                                 make, model, year, tare_weight_tonnes, current_status, fuel_type, is_active)
     values ($1, $2, $3, 'TIPPER_TRUCK', 'TIPPER', 'Volvo', 'FH', 2022, 12, 'AVAILABLE', 'DIESEL', true)
     returning id`,
    [state.tenantId, `E2ET${stamp}`, `E2E-${stamp}`],
  );
  state.vehicleId = veh.rows[0].id;

  const mix = await pool.query(
    `insert into fleet_vehicles (tenant_id, vehicle_code, plate_number, vehicle_type, vehicle_class,
                                 make, model, year, tare_weight_tonnes, current_status, fuel_type, is_active)
     values ($1, $2, $3, 'MIXER_TRUCK', 'MIXER', 'Scania', 'P', 2023, 16, 'AVAILABLE', 'DIESEL', true)
     returning id`,
    [state.tenantId, `E2EM${stamp}`, `E2EM-${stamp}`],
  );
  state.mixerId = mix.rows[0].id;

  const eq = await pool.query(
    `insert into equipment (tenant_id, equipment_code, name, name_ar, category, make, model,
                            commissioned_at, cost_sar, is_active)
     values ($1, $2, $3, $4, 'PUMP', 'Putzmeister', 'P', '2021-06-01', 180000, true)
     returning id`,
    [state.tenantId, `E2EE${stamp}`, "Concrete Pump", "مضخة خرسانة"],
  );
  state.equipmentId = eq.rows[0].id;

  check("tenant + admin + vehicle + mixer + equipment created", Boolean(state.tenantId && state.adminId && state.vehicleId && state.equipmentId));
}

async function deleteTenantRows(pool, tenantId) {
  const tables = await pool.query(
    `select table_name from information_schema.columns
      where column_name = 'tenant_id' and table_schema = 'public' order by table_name`,
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
  return failed;
}

async function cleanup(pool) {
  section("cleanup: removing everything the test created");
  if (KEEP) {
    lines.push("  \x1b[2m--keep was passed, test data left in place\x1b[0m");
    return;
  }
  const failed = await deleteTenantRows(pool, state.tenantId);
  if (failed.length) for (const f of failed.slice(0, 3)) lines.push(`  \x1b[2m${f}\x1b[0m`);
  const left = await pool.query(`select count(*)::int as n from tenants where id = $1`, [state.tenantId]);
  check("test tenant removed", left.rows[0].n === 0);
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 2, ssl: { rejectUnauthorized: false } });
  try {
    lines.push(`\x1b[1mFimto ERP — اهلاك معدات E2E\x1b[0m`);
    lines.push(`target: ${BASE}`);
    await seed(pool);

    // 1 — login
    section("1. sign in");
    const login = await api("/api/auth/login", {
      method: "POST",
      body: { email: ADMIN_EMAIL, password: PASSWORD },
    });
    check("admin sign-in answers 200", login.status === 200, `got ${login.status}`);
    const token = login.body?.data?.accessToken || login.body?.accessToken;
    check("access token issued", Boolean(token));
    if (!token) {
      lines.push(`  \x1b[2m${JSON.stringify(login.body).slice(0, 300)}\x1b[0m`);
      throw new Error("no token");
    }

    // 2 — options + presets
    section("2. the list offers vehicles, equipment and life presets");
    const list0 = await api("/api/finance/depreciation?period=2026-10-01", { token });
    check("GET depreciation answers 200", list0.status === 200, `got ${list0.status}`);
    const d0 = list0.body?.data;
    check("vehicle options include our tipper", (d0?.vehicleOptions ?? []).some((v) => v.id === state.vehicleId));
    check("equipment options include our pump", (d0?.equipmentOptions ?? []).some((v) => v.id === state.equipmentId));
    const tipperOpt = (d0?.vehicleOptions ?? []).find((v) => v.id === state.vehicleId);
    check("tipper suggests 13 years of life", tipperOpt?.suggestedLifeYears === 13, String(tipperOpt?.suggestedLifeYears));
    check("tipper suggests ≈7.69% straight-line rate", Math.abs((tipperOpt?.suggestedRatePct ?? 0) - 7.69) < 0.02, String(tipperOpt?.suggestedRatePct));
    const pumpOpt = (d0?.equipmentOptions ?? []).find((v) => v.id === state.equipmentId);
    check("pump suggests 15 years of life", pumpOpt?.suggestedLifeYears === 15, String(pumpOpt?.suggestedLifeYears));
    check("pump replacement suggestion = its register cost (180k)", pumpOpt?.suggestedReplacementSar === 18000000, sar(pumpOpt?.suggestedReplacementSar));
    check("presets are published", (d0?.presets ?? []).length >= 10, String((d0?.presets ?? []).length));

    // 3 — settings
    section("3. tenant depreciation settings");
    const setGet = await api("/api/finance/depreciation/settings", { token });
    check("GET settings answers 200", setGet.status === 200, `got ${setGet.status}`);
    const setPut = await api("/api/finance/depreciation/settings", {
      method: "PUT",
      token,
      body: { defaultInflationRatePct: 4.5, defaultLifeYears: 12 },
    });
    check("PUT settings answers 200", setPut.status === 200, `got ${setPut.status}`);
    check("inflation saved", Number(setPut.body?.data?.defaultInflationRatePct) === 4.5, String(setPut.body?.data?.defaultInflationRatePct));

    // 4 — create an asset with a replacement target
    section("4. add a tipper: bought used for 50k, a new one costs 150k");
    const create = await api("/api/finance/depreciation", {
      method: "POST",
      token,
      body: {
        source: "vehicle",
        vehicleId: state.vehicleId,
        purchaseCostSar: 5000000,        // 50,000 SAR
        purchaseDate: "2024-01-15",
        annualRatePct: 7.69,
        usefulLifeYears: 13,
        lifeSource: "manual",
        replacementCostEstSar: 15000000, // 150,000 SAR for a new one
        inflationRatePct: 4.5,
        assessmentValueSar: 5000000,    // worth 50k in its current state
        notes: "E2E tipper",
      },
    });
    check("POST depreciation answers 200", create.status === 200, `got ${create.status} ${JSON.stringify(create.body).slice(0, 200)}`);
    const assetId = create.body?.data?.id;
    check("asset id returned", Boolean(assetId));

    // duplicate guard
    const dup = await api("/api/finance/depreciation", {
      method: "POST",
      token,
      body: { source: "vehicle", vehicleId: state.vehicleId, purchaseCostSar: 5000000, annualRatePct: 7.69 },
    });
    check("duplicate asset is refused with 409", dup.status === 409, `got ${dup.status}`);
    check("duplicate returns ASSET_EXISTS", dup.body?.errorCode === "ASSET_EXISTS" || dup.body?.error?.code === "ASSET_EXISTS", JSON.stringify(dup.body).slice(0, 160));

    // 5 — the computed plan
    section("5. the monthly plan: book depreciation + replacement fund");
    const list1 = await api("/api/finance/depreciation?period=2026-10-01", { token });
    const asset = (list1.body?.data?.assets ?? []).find((a) => a.id === assetId);
    check("asset appears in the list", Boolean(asset));
    check("book part is 0 (book value already at its current worth)", asset?.monthlyBookSar === 0, sar(asset?.monthlyBookSar));
    check("fund part carries the whole charge", asset?.monthlyFundSar > 0 && asset?.monthlyFundSar === asset?.monthlyDepSar, sar(asset?.monthlyFundSar));
    check("replacement target = 150k inflated to end-of-life", asset?.replacementTargetSar > 15000000, sar(asset?.replacementTargetSar));
    {
      // the target is FROZEN at save time: today's price grown by inflation
      // until the end of life (2037-01 for a 13y life from 2024-01)
      const nowMonth = new Date().getFullYear() * 12 + new Date().getMonth();
      const endMonth = 2037 * 12 + 0; // 2037-01
      const yearsToEnd = Math.max(0, endMonth - nowMonth) / 12;
      const expected = Math.round(15000000 * Math.pow(1.045, yearsToEnd));
      check(
        "target = 150k × 1.045^(years left) and is frozen",
        Math.abs(asset?.replacementTargetSar - expected) < 20000,
        `${sar(asset?.replacementTargetSar)} vs ${sar(expected)} (${yearsToEnd.toFixed(2)}y)`
      );
    }
    check("months left ≈ 123 (13y from 2024-01 → 2037-01)", Math.abs((asset?.monthsRemaining ?? 0) - 123) <= 1, String(asset?.monthsRemaining));

    // 6 — run the month
    section("6. «تشغيل إهلاك شهر»");
    const run1 = await api("/api/finance/depreciation/run", { method: "POST", token, body: { period: "2026-10-01" } });
    check("run answers 200", run1.status === 200, `got ${run1.status} ${JSON.stringify(run1.body).slice(0, 200)}`);
    const r1 = run1.body?.data;
    check("run created entries", (r1?.created ?? 0) > 0, String(r1?.created));
    check("run caught up the missed months since 2024-01", (r1?.catchUpMonths ?? 0) >= 33, String(r1?.catchUpMonths));
    check("book part of the run is 0", r1?.totalBookSar === 0, sar(r1?.totalBookSar));
    check("fund part of the run carries the total", r1?.totalFundSar === r1?.totalPostedSar, `${sar(r1?.totalFundSar)} vs ${sar(r1?.totalPostedSar)}`);

    // idempotency
    const run2 = await api("/api/finance/depreciation/run", { method: "POST", token, body: { period: "2026-10-01" } });
    check("re-running the same month creates nothing", (run2.body?.data?.created ?? 0) === 0, String(run2.body?.data?.created));

    // 7 — ledger linkage
    section("7. the entries reach the ledger");
    const ledger = await pool.query(
      `select count(*)::int as n, coalesce(sum(amount_sar),0)::bigint as total
         from ledger_entries where tenant_id = $1 and counterparty_id = $2`,
      [state.tenantId, assetId],
    );
    check("one ledger row per depreciation month", ledger.rows[0].n >= 33, String(ledger.rows[0].n));
    check("ledger total equals the posted depreciation", Number(ledger.rows[0].total) === Number(r1?.totalPostedSar), `${ledger.rows[0].total} vs ${r1?.totalPostedSar}`);

    // 8 — accumulated reaches the target
    section("8. the accumulated fund lands on the replacement target");
    const list2 = await api("/api/finance/depreciation?period=2026-10-01", { token });
    const a2 = (list2.body?.data?.assets ?? []).find((a) => a.id === assetId);
    check("accumulated grew", a2?.accumulatedSar > 0, sar(a2?.accumulatedSar));
    check("gap = target − accumulated", a2?.fundGapSar === Math.max(0, a2?.replacementTargetSar - a2?.accumulatedSar), `${sar(a2?.fundGapSar)}`);
    check("summary carries the fund totals", (list2.body?.data?.summary?.totalReplacementTargetSar ?? 0) > 0, sar(list2.body?.data?.summary?.totalReplacementTargetSar));

    // 9 — edit
    section("9. edit the asset");
    const put = await api(`/api/finance/depreciation/${assetId}`, {
      method: "PUT",
      token,
      body: { assessmentValueSar: 3000000, notes: "E2E updated" },
    });
    check("PUT answers 200", put.status === 200, `got ${put.status}`);
    const list3 = await api("/api/finance/depreciation?period=2026-10-01", { token });
    const a3 = (list3.body?.data?.assets ?? []).find((a) => a.id === assetId);
    check("assessment value updated", a3?.assessmentValueSar === 3000000, sar(a3?.assessmentValueSar));
    check("notes updated", a3?.notes === "E2E updated", a3?.notes);

    // 10 — delete guard
    section("10. an asset with entries cannot be deleted");
    const del = await api(`/api/finance/depreciation/${assetId}`, { method: "DELETE", token });
    check("delete refused with 409", del.status === 409, `got ${del.status}`);
    check("delete returns ASSET_HAS_ENTRIES", del.body?.errorCode === "ASSET_HAS_ENTRIES" || del.body?.error?.code === "ASSET_HAS_ENTRIES", JSON.stringify(del.body).slice(0, 160));

    // deactivate instead
    const off = await api(`/api/finance/depreciation/${assetId}`, { method: "PUT", token, body: { isActive: false } });
    check("deactivate answers 200", off.status === 200, `got ${off.status}`);
    const run3 = await api("/api/finance/depreciation/run", { method: "POST", token, body: { period: "2026-11-01" } });
    check("a deactivated asset posts nothing", (run3.body?.data?.created ?? 0) === 0, String(run3.body?.data?.created));

    // 11 — a classic asset (no replacement estimate) stays straight-line
    section("11. an asset without a replacement estimate is plain straight line");
    const create2 = await api("/api/finance/depreciation", {
      method: "POST",
      token,
      body: {
        source: "equipment",
        equipmentId: state.equipmentId,
        purchaseCostSar: 18000000, // 180,000 SAR
        purchaseDate: "2026-01-01",
        annualRatePct: 6.67,
        usefulLifeYears: 15,
        lifeSource: "manual",
        notes: "E2E pump",
      },
    });
    check("second asset created", create2.status === 200, `got ${create2.status}`);
    const pumpId = create2.body?.data?.id;
    const list4 = await api("/api/finance/depreciation?period=2026-10-01", { token });
    const p = (list4.body?.data?.assets ?? []).find((a) => a.id === pumpId);
    check("pump book part = (180000−0) × 6.67% ÷ 12", Math.abs(p?.monthlyBookSar - 100050) < 2000, sar(p?.monthlyBookSar));
    check("pump has no fund without a replacement estimate", p?.monthlyFundSar === 0, sar(p?.monthlyFundSar));
    check("pump has no replacement target", p?.replacementTargetSar === 0, sar(p?.replacementTargetSar));

    // 12 — validation
    section("12. bad input is refused");
    const bad = await api("/api/finance/depreciation", {
      method: "POST",
      token,
      body: { source: "vehicle", vehicleId: state.vehicleId, purchaseCostSar: -5, annualRatePct: 7 },
    });
    check("negative cost refused with 400", bad.status === 400, `got ${bad.status}`);
    const bad2 = await api("/api/finance/depreciation", {
      method: "POST",
      token,
      body: { source: "vehicle", vehicleId: state.mixerId, purchaseCostSar: 100, annualRatePct: 150 },
    });
    check("rate above 100% refused with 400", bad2.status === 400, `got ${bad2.status}`);
    const noVeh = await api("/api/finance/depreciation", {
      method: "POST",
      token,
      body: { source: "vehicle", purchaseCostSar: 100, annualRatePct: 7 },
    });
    check("missing vehicle refused with 400", noVeh.status === 400, `got ${noVeh.status}`);

    await cleanup(pool);
  } catch (err) {
    failures.push(`fatal: ${err.message}`);
    lines.push(`  \x1b[31m✗ fatal: ${err.message}\x1b[0m`);
    try {
      await cleanup(pool);
    } catch {
      /* ignore */
    }
  } finally {
    console.log(lines.join("\n"));
    console.log(`\n\x1b[1m${passed} passed, ${failures.length} failed\x1b[0m`);
    if (failures.length) {
      for (const f of failures) console.log(`  \x1b[31m✗\x1b[0m ${f}`);
      process.exitCode = 1;
    }
    await pool.end();
  }
}

main();
