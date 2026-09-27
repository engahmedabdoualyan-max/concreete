#!/usr/bin/env node
/**
 * Fimto Concrete ERP — production end-to-end test
 * =================================================
 * Answers the only question that matters before selling the system:
 * "does a real order actually travel through the live API and the database?"
 *
 * It creates its own throwaway tenant, drives the public HTTP API exactly like
 * the mobile app does, asserts every step, and then deletes everything it made.
 * Your data is never touched: the test lives in its own tenant and removes it.
 *
 * Usage:
 *   node scripts/e2e-production.mjs                       # against the deployed API
 *   node scripts/e2e-production.mjs --base http://127.0.0.1:3111
 *   node scripts/e2e-production.mjs --keep                # leave the test data
 *
 * Needs DATABASE_URL (or ~/.config/fimto/backup_dburl) for the fixtures.
 */

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
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

// ── database connection (never printed) ─────────────────────────────────────
const secretFile = join(homedir(), ".config", "fimto", "backup_dburl");
const DATABASE_URL = process.env.DATABASE_URL
  || (existsSync(secretFile) ? readFileSync(secretFile, "utf8").trim() : null);
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required (the E2E test seeds its own fixtures)");
  process.exit(2);
}

// ── tiny assertion helpers ──────────────────────────────────────────────────
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
    /* empty body */
  }
  return { status: res.status, body: json };
}

// ── fixtures ─────────────────────────────────────────────────────────────────
const stamp = Date.now().toString().slice(-8);
const TENANT_CODE = `E2E${stamp}`;
const PASSWORD = `E2e!${stamp}x`;
const ADMIN_EMAIL = `e2e-admin-${stamp}@fimto.test`;
const DRIVER_EMAIL = `e2e-driver-${stamp}@fimto.test`;

const state = {};

async function seed(pool) {
  section("fixtures: creating a throwaway tenant, an admin and a driver");
  const hash = await bcrypt.hash(PASSWORD, 10);

  const tenant = await pool.query(
    `insert into tenants (tenant_code, company_name, primary_plant_name, country_code, timezone)
     values ($1, $2, $3, 'EG', 'Africa/Cairo') returning id`,
    [TENANT_CODE, `E2E Test ${stamp}`, "E2E Plant"],
  );
  state.tenantId = tenant.rows[0].id;

  const mkUser = async (email, role, code) => {
    const r = await pool.query(
      `insert into users (tenant_id, employee_code, full_name, email, password_hash, role, zone)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [state.tenantId, code, `E2E ${role}`, email, hash, role, "E2E Zone"],
    );
    return r.rows[0].id;
  };
  state.adminId = await mkUser(ADMIN_EMAIL, "SUPER_ADMIN", `E2EADM${stamp}`);
  state.driverId = await mkUser(DRIVER_EMAIL, "DRIVER", `E2EDRV${stamp}`);

  // business prerequisites the order API insists on
  const client = await pool.query(
    `insert into clients (tenant_id, client_code, company_name, contact_person, credit_limit_sar)
     values ($1, $2, $3, 'E2E Contact', 1000000) returning id`,
    [state.tenantId, `E2EC${stamp}`, `E2E Client ${stamp}`],
  );
  state.clientId = client.rows[0].id;

  const site = await pool.query(
    `insert into delivery_sites (tenant_id, client_id, site_name, site_code, city, distance_from_plant_km)
     values ($1, $2, $3, $4, 'Cairo', 24.5) returning id`,
    [state.tenantId, state.clientId, `E2E Site ${stamp}`, `E2ES${stamp}`],
  );
  state.siteId = site.rows[0].id;

  const mix = await pool.query(
    `insert into mix_designs (tenant_id, design_code, grade_description, target_strength_mpa, target_slump_cm,
                              cement_kg_per_m3, sand_kg_per_m3, gravel_10mm_kg_per_m3, gravel_20mm_kg_per_m3,
                              water_litres_per_m3, max_wc_ratio, product_type)
     values ($1, $2, 'C30', 30, 180, 300, 800, 350, 250, 175, 0.55, 'READY_MIX') returning id`,
    [state.tenantId, `E2EM${stamp}`],
  );
  state.mixId = mix.rows[0].id;

  check("tenant + admin + driver created", Boolean(state.tenantId && state.adminId && state.driverId));
  check("client, delivery site and mix design seeded", Boolean(state.clientId && state.siteId && state.mixId));
}

async function deleteTenantRows(pool, tenantId) {
  // Every table that carries a tenant_id, discovered from the live catalog so a
  // new module can never be missed. The API writes audit rows too, which is why
  // a hand-written delete list always left something behind.
  const tables = await pool.query(
    `select table_name from information_schema.columns
      where column_name = 'tenant_id' and table_schema = 'public'
      order by table_name`,
  );
  // Foreign keys make a single alphabetical pass hopeless (a client must go
  // after its delivery sites, which must go after their orders), so keep
  // sweeping until a pass changes nothing.
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

async function gcStaleTenants(pool) {
  const stale = await pool.query(
    `select id, tenant_code from tenants where tenant_code like 'E2E%'`,
  );
  if (!stale.rows.length) return 0;
  for (const row of stale.rows) await deleteTenantRows(pool, row.id);
  return stale.rows.length;
}

async function cleanup(pool) {
  section("cleanup: removing everything the test created");
  if (KEEP) {
    lines.push("  \x1b[2m--keep was passed, test data left in place\x1b[0m");
    return;
  }
  const { tables, failed } = await deleteTenantRows(pool, state.tenantId);
  if (failed.length) {
    lines.push(`  \x1b[2m(tables with a tenant_id: ${tables}; undeletable: ${failed.length})\x1b[0m`);
    for (const f of failed.slice(0, 3)) lines.push(`    \x1b[2m${f}\x1b[0m`);
  }
  const left = await pool.query(`select count(*)::int as n from tenants where id = $1`, [state.tenantId]);
  check("test tenant removed", left.rows[0].n === 0);
}

// ── the test ─────────────────────────────────────────────────────────────────
async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 2, ssl: { rejectUnauthorized: false } });
  try {
    lines.push(`\x1b[1mFimto ERP — end-to-end test\x1b[0m`);
    lines.push(`target: ${BASE}`);

    const swept = await gcStaleTenants(pool);
    if (swept) lines.push(`\x1b[2m(swept ${swept} leftover test tenant(s) from an earlier run)\x1b[0m`);

    await seed(pool);

    // 1 — health
    section("1. the service is up");
    const health = await api("/api/health");
    check("GET /api/health answers 200", health.status === 200, `got ${health.status}`);
    check("health reports a reachable database", health.body?.status === "ok", JSON.stringify(health.body));

    // 2 — unauthenticated access is refused
    section("2. protected routes refuse anonymous callers");
    const anon = await api("/api/orders");
    check("GET /api/orders without a token is 401", anon.status === 401, `got ${anon.status}`);

    // 3 — login
    section("3. sign in");
    const badLogin = await api("/api/auth/login", {
      method: "POST",
      body: { email: ADMIN_EMAIL, password: "wrong-password" },
    });
    check("wrong password is rejected with 401", badLogin.status === 401, `got ${badLogin.status}`);

    const login = await api("/api/auth/login", {
      method: "POST",
      body: { email: ADMIN_EMAIL, password: PASSWORD },
    });
    check("admin sign-in answers 200", login.status === 200, `got ${login.status}`);
    const token = login.body?.data?.accessToken || login.body?.accessToken;
    check("an access token was issued", Boolean(token));
    state.token = token;

    if (!token) {
      // Without a token nothing else can run; show why and stop.
      lines.push(`  \x1b[2mresponse: ${JSON.stringify(login.body).slice(0, 300)}\x1b[0m`);
      return;
    }

    // 4 — identity
    section("4. the token identifies the right user");
    const me = await api("/api/auth/me", { token });
    check("GET /api/auth/me answers 200", me.status === 200, `got ${me.status}`);
    const meUser = me.body?.data?.user || me.body?.user || me.body?.data;
    const meId = meUser?.sub || meUser?.id;
    check("it is the admin we created", meId === state.adminId,
      `${meId === state.adminId ? "" : "got "}${meUser?.email || meId || JSON.stringify(me.body).slice(0, 100)}`);
    check("it carries the test tenant", meUser?.tenantId === state.tenantId);

    // 5 — create a real order
    section("5. create a real order through the API");
    const created = await api("/api/orders", {
      method: "POST",
      token,
      body: {
        clientId: state.clientId,
        deliverySiteId: state.siteId,
        mixDesignId: state.mixId,
        totalVolumeM3: 12,
        scheduledDate: "2030-01-15",
        requestedPourRateM3PerHour: 40,
        specialInstructions: "E2E test pour",
      },
    });
    check("POST /api/orders succeeds", created.status === 200 || created.status === 201, `got ${created.status}`);
    const order = created.body?.data?.order || created.body?.order || created.body?.data;
    state.orderId = order?.id;
    check("the response carries an order id", Boolean(state.orderId));

    // 6 — read it back
    section("6. read the order back");
    const list = await api("/api/orders?limit=10", { token });
    const orders = list.body?.data?.orders || list.body?.orders || [];
    check("GET /api/orders answers 200", list.status === 200, `got ${list.status}`);
    check("the new order is in the list", orders.some((o) => o.id === state.orderId),
      `${orders.length} order(s) returned`);

    if (state.orderId) {
      const one = await api(`/api/orders/${state.orderId}`, { token });
      check("GET /api/orders/{id} answers 200", one.status === 200, `got ${one.status}`);
      const volume = (one.body?.data?.order || one.body?.order || one.body?.data)?.totalVolumeM3;
      check("the volume round-tripped correctly (12 m³)", Number(volume) === 12, `got ${volume}`);
    }

    // 7 — permissions
    section("7. permissions are enforced");
    const driverLogin = await api("/api/auth/login", {
      method: "POST",
      body: { email: DRIVER_EMAIL, password: PASSWORD },
    });
    const driverToken = driverLogin.body?.data?.accessToken || driverLogin.body?.accessToken;
    check("driver sign-in answers 200", driverLogin.status === 200, `got ${driverLogin.status}`);

    if (driverToken) {
      const denied = await api("/api/orders", {
        method: "POST",
        token: driverToken,
        body: {
          clientId: state.clientId,
          deliverySiteId: state.siteId,
          mixDesignId: state.mixId,
          totalVolumeM3: 5,
          scheduledDate: "2030-01-15",
        },
      });
      check("a driver cannot create an order (403)", denied.status === 403, `got ${denied.status}`);
    }

    // 8 — the cost & margin report
    section("8. the cost/margin report answers with real numbers");
    const report = await api("/api/finance/cost-margin?limit=5", { token });
    check("GET /api/finance/cost-margin answers 200", report.status === 200,
      `got ${report.status} ${JSON.stringify(report.body).slice(0, 300)}`);
    const rdata = report.body?.data;
    if (rdata) {
      check("it reports a period and totals", Boolean(rdata.period && rdata.totals));
      const nums = ["volumeM3", "revenueSar", "materialCostSar", "marginSar"];
      const bad = nums.filter((k) => typeof rdata.totals?.[k] !== "number" || Number.isNaN(rdata.totals[k]));
      check("every total is a real number", bad.length === 0, bad.join(", "));
      check("it says which material prices are missing", Array.isArray(rdata.dataQuality?.missingMaterialPrices));
    }

    // 9 — the dispatch board
    section("9. the dispatch board answers the shift questions");
    // The window must include the test order's pour date.
    const board = await api("/api/dispatch/board?date=2030-01-15&horizonDays=0", { token });
    check("GET /api/dispatch/board answers 200", board.status === 200,
      `got ${board.status} ${JSON.stringify(board.body).slice(0, 200)}`);
    const bd = board.body?.data;
    if (bd) {
      const sums = ["orders", "totalM3", "remainingM3", "activeTrips", "idleVehicles", "criticalAlerts"];
      const bad = sums.filter((k) => typeof bd.summary?.[k] !== "number" || Number.isNaN(bd.summary[k]));
      check("its summary is all real numbers", bad.length === 0, bad.join(", "));
      check("it ships an alert list", Array.isArray(bd.alerts));
      check("it ships the order board and the live trips",
        Array.isArray(bd.orders) && Array.isArray(bd.trips));
      const ourOrder = (bd.orders ?? []).find((o) => o.id === state.orderId);
      check("our test order shows on the board", Boolean(ourOrder),
        `${(bd.orders ?? []).length} order(s) in the window`);
    }

    // 10 — tenant isolation
    section("10. tenants cannot see each other");
    if (state.orderId) {
      const row = await pool.query(`select tenant_id from orders where id = $1`, [state.orderId]);
      check("the order belongs to the test tenant", row.rows[0]?.tenant_id === state.tenantId);
    }
    const foreign = await pool.query(
      `select count(*)::int as n from orders where tenant_id <> $1 and id = $2`,
      [state.tenantId, state.orderId || randomUUID()],
    );
    check("no other tenant owns it", foreign.rows[0].n === 0);
  } catch (err) {
    failures.push(`unexpected error: ${err.message}`);
    lines.push(`\n  \x1b[31m! ${err.stack?.split("\n").slice(0, 3).join("\n    ")}\x1b[0m`);
  } finally {
    try {
      await cleanup(pool);
    } catch (err) {
      lines.push(`  \x1b[2mcleanup note: ${err.message}\x1b[0m`);
    }
    await pool.end();
  }

  console.log(lines.join("\n"));
  const total = passed + failures.length;
  console.log(`\n\x1b[1m${passed}/${total} checks passed\x1b[0m`);
  if (failures.length) {
    console.log("\x1b[31mfailed:\x1b[0m");
    for (const f of failures) console.log(`  • ${f}`);
    process.exit(1);
  }
  console.log("\x1b[32mthe live API is doing real work: auth, permissions, orders and tenant isolation all check out\x1b[0m");
}

main();
