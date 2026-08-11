/**
 * ============================================================
 *  FIMTO SOFT — Firebase (website) → PostgreSQL (ERP) Migration
 *  scripts/migrate-firebase/migrate.ts
 * ============================================================
 *
 *  Imports every website user's data from Firestore (project
 *  `concrete-erb`) into the ERP PostgreSQL database, creating one
 *  tenant per website user and a SUPER_ADMIN account for each.
 *
 *  Read-only against Firestore (uses the public-read rules the
 *  website itself relies on). Writes into the ERP Postgres DB via
 *  DATABASE_URL.
 *
 *  USAGE:
 *    npx tsx scripts/migrate-firebase/migrate.ts [--dry-run]
 *
 *  `--dry-run` only inspects + plans, does not write anything.
 * ============================================================
 */

import { Pool } from "pg";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { createHash, randomUUID } from "crypto";

dotenv.config();

const API_KEY = "AIzaSyBbK2e2saN8Olu7O6vjHP23MkTsUgyN2iE";
const PROJECT = "concrete-erb";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const DRY_RUN = process.argv.includes("--dry-run");

const COLLECTIONS = [
  "trips",
  "orders",
  "payments",
  "customers",
  "inventory",
  "deliveries",
  "productionRuns",
  "qcRecords",
  "assets",
  "workshopConfig",
  "plantProfile",
  "gpsHistory",
  "oeeLogs",
  "recipes",
  "calibrationLogs",
];

// ─── Firebase REST helpers ────────────────────────────────────────────────────

async function getJson(url: string) {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) return null;
  return res.json();
}

function decode(v: any): any {
  if (v === null || v === undefined) return null;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.integerValue !== undefined) return parseInt(v.integerValue, 10);
  if (v.doubleValue !== undefined) return parseFloat(v.doubleValue);
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.referenceValue !== undefined) return v.referenceValue;
  if (v.bytesValue !== undefined) return v.bytesValue;
  if (v.nullValue !== undefined) return null;
  if (v.arrayValue) return (v.arrayValue.values ?? []).map(decode);
  if (v.mapValue) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v.mapValue.fields ?? {})) out[k] = decode(val);
    return out;
  }
  return null;
}

function decodeFields(fields: any): any {
  return decode({ mapValue: { fields: fields ?? {} } });
}

async function readUserDoc(userId: string, collection: string): Promise<any> {
  const json = await getJson(`${BASE}/userData/${userId}/${collection}/data?key=${API_KEY}`);
  if (!json) return null;
  const decoded = decodeFields(json.fields);
  return decoded?.data ?? null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizePhone(input: string): string {
  let digits = (input ?? "").replace(/[\s\-()]/g, "");
  if (!digits) return "";
  if (!digits.startsWith("+")) {
    if (digits.startsWith("966") && digits.length === 12) digits = `+${digits}`;
    else if (digits.startsWith("05") && digits.length === 10) digits = `+966${digits.slice(1)}`;
    else if (digits.startsWith("0")) digits = `+${digits.slice(1)}`;
  }
  return digits;
}

function deterministicPhone(seed: string): string {
  const h = createHash("md5").update(seed).digest("hex");
  const digits = parseInt(h.slice(0, 8), 16) % 100000000;
  return `+1999${String(digits).padStart(8, "0")}`;
}

function sanitizeCode(s: string): string {
  return (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) || "MIG";
}

/** Truncated username token used inside DB codes (fits varchar(20)) */
function codeToken(username: string): string {
  return sanitizeCode(username).slice(0, 10);
}

function toIso(v: any): string | null {
  if (!v) return null;
  if (typeof v === "number") return new Date(v).toISOString();
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

// ─── Report ───────────────────────────────────────────────────────────────────

const report: Record<string, any> = {};

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    console.log(`Mode: ${DRY_RUN ? "DRY-RUN (no writes)" : "LIVE MIGRATION"}\n`);

    const usersJson = await getJson(`${BASE}/users?pageSize=100&key=${API_KEY}`);
    const userDocs = usersJson?.documents ?? [];
    console.log(`Firestore users found: ${userDocs.length}\n`);

    if (DRY_RUN) {
      // Report what exists without touching the DB.
      for (const doc of userDocs) {
        const username = doc.name.split("/").pop();
        const fields = decodeFields(doc.fields);
        const counts: Record<string, number> = {};
        for (const col of COLLECTIONS) {
          const data = await readUserDoc(username, col);
          counts[col] = Array.isArray(data) ? data.length : data ? 1 : 0;
        }
        report[username] = { fields, counts };
        console.log(`• ${username}: ${JSON.stringify(counts)}`);
      }
      fs.writeFileSync(
        path.join(__dirname, "migration-report-dry.json"),
        JSON.stringify(report, null, 2)
      );
      console.log("\nDry-run report written to scripts/migrate-firebase/migration-report-dry.json");
      return;
    }

    // ─── LIVE MIGRATION ────────────────────────────────────────────────────────
    // Pre-create the payments migration table (simple, self-contained).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrated_payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
        client_name varchar(200),
        amount numeric(12,2),
        method varchar(40),
        status varchar(40),
        reference varchar(80),
        order_no varchar(80),
        date date,
        note text,
        link text,
        qr text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    for (const doc of userDocs) {
      const username = doc.name.split("/").pop()!;
      const fields = decodeFields(doc.fields) ?? {};
      const userReport: Record<string, any> = { username };

      console.log(`\n════════ Migrating user: ${username} ════════`);

      // Read all collections once
      const data: Record<string, any> = {};
      for (const col of COLLECTIONS) {
        data[col] = await readUserDoc(username, col);
      }

      // 1) Tenant
      const tenantCode = sanitizeCode(username);
      const plantProfile = data.plantProfile ?? {};
      const companyName =
        plantProfile?.name || fields.plantName || `Migrated: ${username}`;

      const existingTenant = await pool.query(
        `SELECT id FROM tenants WHERE tenant_code = $1`, [tenantCode]
      );
      let tenantId: string;
      let tenantCreated = false;
      if (existingTenant.rows.length) {
        // Resume: tenant already exists (e.g. after an interrupted run) —
        // re-use it as long as no data was imported yet, but still create
        // the missing admin account below.
        tenantId = existingTenant.rows[0].id;
        const admins = await pool.query(
          `SELECT id FROM users WHERE tenant_id=$1 AND employee_code=$2`,
          [tenantId, `MIG-${codeToken(username)}-ADM`]
        );
        if (admins.rows.length) {
          userReport.skipped = "already fully migrated";
          console.log(`  ↦ tenant ${tenantCode} fully migrated — skipping user.`);
          report[username] = userReport;
          continue;
        }
        console.log(`  ↦ tenant ${tenantCode} exists (resuming missing admin).`);
      } else {
        const r = await pool.query(
          `INSERT INTO tenants (tenant_code, company_name, primary_plant_name, is_active, settings)
           VALUES ($1,$2,$3,true,$4) RETURNING id`,
          [tenantCode, companyName, plantProfile?.name ?? null,
           JSON.stringify({ migratedFromFirebase: true, sourceUser: username, firebaseHistory: {} })]
        );
        tenantId = r.rows[0].id;
        tenantCreated = true;
      }
      userReport.tenant = { code: tenantCode, id: tenantId };
      console.log(`  tenant: ${tenantCode} (${companyName})`);

      // 2) Tenant admin user
      const phoneRaw = fields.phone || "";
      const phone = normalizePhone(phoneRaw) || deterministicPhone(username + ":admin");
      const email = (fields.email || `${username}@migrated.fimtosoft.com`).toLowerCase();
      const plainPassword = fields.password || `Migrated@${Math.random().toString(36).slice(2, 8)}1`;
      const role = "SUPER_ADMIN";
      const adminCode = `MIG-${codeToken(username)}-ADM`;

      const adminId = randomUUID();
      {
        const r = await pool.query(
          `INSERT INTO users
             (id, tenant_id, employee_code, full_name, email, phone_number, password_hash, role, zone, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
           ON CONFLICT DO NOTHING RETURNING id`,
          [adminId, tenantId, adminCode, username, email, phone,
           await import("bcryptjs").then((b) => b.hashSync(plainPassword, 10)),
           role, fields.city || null]
        );
        if (!r.rows.length) {
          console.error(`  ⚠ admin user conflict for ${username} — aborting user.`);
          report[username] = { ...userReport, error: "admin user conflict" };
          continue;
        }
      }
      userReport.admin = { employeeCode: adminCode, phone, email, password: plainPassword };
      console.log(`  admin: ${adminCode} (${phone})`);

      // 3) plantProfile name + workshopConfig budgets → tenant settings
      const settingsPatch: Record<string, unknown> = {};
      if (data.workshopConfig && typeof data.workshopConfig === "object") {
        settingsPatch.workshopConfig = data.workshopConfig;
      }
      if (plantProfile?.name) settingsPatch.plantName = plantProfile.name;
      if (data.deliveries?.length) settingsPatch.historicalDeliveries = data.deliveries;
      if (data.productionRuns?.length) settingsPatch.historicalProductionRuns = data.productionRuns;
      if (data.qcRecords?.length) settingsPatch.historicalQcRecords = data.qcRecords;
      if (data.gpsHistory?.length) settingsPatch.historicalGps = data.gpsHistory;
      if (data.oeeLogs?.length) settingsPatch.historicalOeeLogs = data.oeeLogs;
      if (data.calibrationLogs?.length) settingsPatch.historicalCalibrationLogs = data.calibrationLogs;
      if (Object.keys(settingsPatch).length) {
        await pool.query(
          `UPDATE tenants SET settings = settings || $2::jsonb, updated_at = now() WHERE id = $1`,
          [tenantId, JSON.stringify(settingsPatch)]
        );
        userReport.historyStored = Object.keys(settingsPatch);
      }
      console.log(`  history stored in tenant settings: ${Object.keys(settingsPatch).join(", ") || "none"}`);

      // 4) customers → clients
      const clientIdByCode: Record<string, string> = {};
      const customers = Array.isArray(data.customers) ? data.customers : [];
      for (let i = 0; i < customers.length; i++) {
        const c = customers[i] ?? {};
        const clientCode = `MIG${codeToken(username)}-C${String(i + 1).padStart(3, "0")}`;
        const r = await pool.query(
          `INSERT INTO clients
             (tenant_id, client_code, company_name, contact_person, phone, email, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT DO NOTHING RETURNING id`,
          [tenantId, clientCode, c.name || c.company || c.customerName || `Migrated Client ${i + 1}`,
           c.contactPerson || null, c.phone || null, c.email || null, JSON.stringify(c).slice(0, 500)]
        );
        clientIdByCode[String(c.code ?? c.id ?? i)] = r.rows[0]?.id;
      }
      userReport.clientsImported = customers.length;
      console.log(`  clients: ${customers.length}`);

      // 5) recipes → mix_designs
      const mixIdByRecipeCode: Record<string, string> = {};
      const recipes = Array.isArray(data.recipes) ? data.recipes : [];
      for (let i = 0; i < recipes.length; i++) {
        const rec = recipes[i] ?? {};
        const code = `MIG${codeToken(username)}-${sanitizeCode(rec.code || `R${i + 1}`)}`;
        const r = await pool.query(
          `INSERT INTO mix_designs
             (tenant_id, design_code, grade_description, target_strength_mpa, target_slump_cm,
              cement_kg_per_m3, sand_kg_per_m3, gravel_20mm_kg_per_m3, water_litres_per_m3, admixture_plasticizer_l_per_m3)
           VALUES ($1,$2,$3,30,8,$4,$5,$6,$7,$8)
           ON CONFLICT (design_code) DO NOTHING RETURNING id`,
          [tenantId, code, rec.code || `Recipe ${i + 1}`,
           rec.cement ?? 0, rec.sand ?? 0, rec.gravel ?? 0, rec.water ?? 0, rec.admixture ?? 0]
        );
        mixIdByRecipeCode[String(rec.code ?? i)] = r.rows[0]?.id;
      }
      userReport.mixDesignsImported = recipes.length;
      console.log(`  mix designs (recipes): ${recipes.length}`);

      // 6) assets → fleet_vehicles (plus driver users by name)
      const driverIdByName: Record<string, string> = {};
      const assets = Array.isArray(data.assets) ? data.assets : [];
      for (let i = 0; i < assets.length; i++) {
        const a = assets[i] ?? {};
        const driverName = String(a.driver || "").trim();
        let driverId: string | null = null;
        if (driverName) {
          if (!driverIdByName[driverName]) {
            driverIdByName[driverName] = randomUUID();
            await pool.query(
              `INSERT INTO users
                 (id, tenant_id, employee_code, full_name, email, phone_number, password_hash, role, is_active)
               VALUES ($1,$2,$3,$4,$5,$6,$7,'DRIVER',true)
               ON CONFLICT DO NOTHING`,
              [driverIdByName[driverName], tenantId,
               `MIG${codeToken(username)}-DRV${i + 1}`, driverName,
               `${sanitizeCode(username)}.driver${i + 1}@migrated.fimtosoft.com`,
               deterministicPhone(username + driverName),
               await import("bcryptjs").then((b) => b.hashSync(`Migrated@${username}${i}`, 10))]
            );
          }
          driverId = driverIdByName[driverName];
        }
        const type = String(a.type || "").toLowerCase();
        const vehicleType = type.includes("pump") ? "CONCRETE_PUMP" : "MIXER_TRUCK";
        const plate = String(a.plate || `MIG-${username}-${i + 1}`).trim();
        const vehicleCode = sanitizeCode(plate);
        const status = String(a.status || "AVAILABLE").toLowerCase().includes("maint")
          ? "IN_WORKSHOP" : "AVAILABLE";
        await pool.query(
          `INSERT INTO fleet_vehicles
             (tenant_id, vehicle_code, plate_number, vehicle_type, vehicle_class, make, model,
              tare_weight_tonnes, odometre_km, assigned_driver_id, insurance_expires_at,
              inspection_due_at, current_status, is_active, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,$14)
           ON CONFLICT (plate_number) DO NOTHING`,
          [tenantId, vehicleCode, plate, vehicleType,
           type.includes("pump") ? "PUMP" : "MIXER",
           null, null, parseFloat(a.tare) || 0, parseFloat(a.initOdo) || 0, driverId,
           toIso(a.insExpiry), toIso(a.regExpiry), status, JSON.stringify(a).slice(0, 500)]
        );
      }
      userReport.vehiclesImported = assets.length;
      console.log(`  vehicles: ${assets.length}`);

      // 7) orders → orders (+ synthetic clients/sites/mix)
      const orders = Array.isArray(data.orders) ? data.orders : [];
      const orderIdBySiteNo: Record<string, string> = {};
      for (let i = 0; i < orders.length; i++) {
        const o = orders[i] ?? {};
        const orderNumber = `MIG${codeToken(username)}-ORD${String(i + 1).padStart(3, "0")}`;
        const clientCode = `MIG${codeToken(username)}-C000`;
        // ensure a synthetic client exists for each order
        const clientRes = await pool.query(
          `INSERT INTO clients (tenant_id, client_code, company_name, notes)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (client_code) DO NOTHING RETURNING id`,
          [tenantId, clientCode, o.customerCode || o.customerId || `Order Client ${i + 1}`,
           JSON.stringify(o).slice(0, 300)]
        );
        if (!clientRes.rows[0]) {
          const existing = await pool.query(
            `SELECT id FROM clients WHERE tenant_id=$1 AND client_code=$2`, [tenantId, clientCode]
          );
          clientRes.rows[0] = existing.rows[0];
        }
        const clientId = clientRes.rows[0].id;

        const siteCode = `${orderNumber}-SITE`;
        const coords = String(o.locationCoords || "").match(/-?\d+\.?\d*\s*[,;]\s*-?\d+\.?\d*/);
        const [lat, lng] = coords ? coords[0].split(/[,;]/).map((x) => parseFloat(x)) : [null, null];
        const siteRes = await pool.query(
          `INSERT INTO delivery_sites (tenant_id, client_id, site_code, site_name, address_line, latitude, longitude)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (site_code) DO NOTHING RETURNING id`,
          [tenantId, clientId, siteCode, o.projectLocation || o.siteName || `Site ${i + 1}`,
           o.projectLocation || null, lat, lng]
        );
        if (!siteRes.rows[0]) {
          const existing = await pool.query(
            `SELECT id FROM delivery_sites WHERE tenant_id=$1 AND site_code=$2`, [tenantId, siteCode]
          );
          siteRes.rows[0] = existing.rows[0];
        }
        const siteId = siteRes.rows[0].id;

        const mixKey = `${o.concreteType || ""}${o.cementType || ""}` || `D${i + 1}`;
        const designCode = `MIG${codeToken(username)}-${sanitizeCode(o.concreteType || `ORD${i + 1}`)}`;
        const mixRes = await pool.query(
          `INSERT INTO mix_designs
             (tenant_id, design_code, grade_description, target_strength_mpa, target_slump_cm,
              cement_kg_per_m3, sand_kg_per_m3, gravel_20mm_kg_per_m3, water_litres_per_m3)
           VALUES ($1,$2,$3,30,$4,0,0,0,0)
           ON CONFLICT (design_code) DO NOTHING RETURNING id`,
          [tenantId, designCode, o.concreteType || `Order mix ${i + 1}`, parseFloat(o.slump) || 8]
        );
        if (!mixRes.rows[0]) {
          const existing = await pool.query(
            `SELECT id FROM mix_designs WHERE tenant_id=$1 AND design_code=$2`, [tenantId, designCode]
          );
          mixRes.rows[0] = existing.rows[0];
        }
        const mixId = mixRes.rows[0].id;

        const statusMap: Record<string, string> = {
          completed: "DELIVERED", approved: "APPROVED", pending: "PENDING_FINANCE",
          rejected: "FINANCE_REJECTED", cancelled: "CANCELLED",
        };
        const accStatus = String(o.accountStatus || "pending").toLowerCase();
        const status = statusMap[accStatus] ?? "DRAFT";

        const orderRes = await pool.query(
          `INSERT INTO orders
             (tenant_id, order_number, client_id, delivery_site_id, mix_design_id,
              total_volume_m3, remaining_volume_m3, price_per_m3_sar, scheduled_date,
              status, created_by_rep_id, special_instructions, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$6,0,$7,$8,$9,$10,now(),now())
           RETURNING id`,
          [tenantId, orderNumber, clientId, siteId, mixId,
           parseFloat(o.quantity) || 0, o.orderDate ? new Date(o.orderDate) : new Date(),
           status, adminId, JSON.stringify(o).slice(0, 500)]
        );
        orderIdBySiteNo[String(o.id ?? o.orderNo ?? i)] = orderRes.rows[0].id;
      }
      userReport.ordersImported = orders.length;
      console.log(`  orders: ${orders.length}`);

      // 8) trips → trips (link vehicle/driver/mix/order)
      const trips = Array.isArray(data.trips) ? data.trips : [];
      const vehicleIdByCode: Record<string, string> = {};

      // Ensure at least one order exists so trips can link (FK requirement).
      let fallbackOrderId = Object.values(orderIdBySiteNo)[0] ?? null;
      if (!fallbackOrderId && trips.length) {
        const histClient = await pool.query(
          `INSERT INTO clients (tenant_id, client_code, company_name, notes)
           VALUES ($1,$2,'Historical Trips','MIGRATED') ON CONFLICT DO NOTHING RETURNING id`,
          [tenantId, `MIG${codeToken(username)}-HIST-C`]
        );
        if (!histClient.rows[0]) {
          const existing = await pool.query(
            `SELECT id FROM clients WHERE tenant_id=$1 AND client_code=$2`,
            [tenantId, `MIG${codeToken(username)}-HIST-C`]
          );
          histClient.rows[0] = existing.rows[0];
        }
        const histClientId = histClient.rows[0].id;
        const histSite = await pool.query(
          `INSERT INTO delivery_sites (tenant_id, client_id, site_code, site_name)
           VALUES ($1,$2,$3,'Historical Site') ON CONFLICT DO NOTHING RETURNING id`,
          [tenantId, histClientId, `MIG${codeToken(username)}-HIST-SITE`]
        );
        if (!histSite.rows[0]) {
          const existing = await pool.query(
            `SELECT id FROM delivery_sites WHERE tenant_id=$1 AND site_code=$2`,
            [tenantId, `MIG${codeToken(username)}-HIST-SITE`]
          );
          histSite.rows[0] = existing.rows[0];
        }
        const histMix = await pool.query(
          `INSERT INTO mix_designs (tenant_id, design_code, grade_description, target_strength_mpa,
             target_slump_cm, cement_kg_per_m3, sand_kg_per_m3, gravel_20mm_kg_per_m3, water_litres_per_m3)
           VALUES ($1,$2,'Historical',30,8,0,0,0,0) ON CONFLICT DO NOTHING RETURNING id`,
          [tenantId, `MIG${codeToken(username)}-HIST-MIX`]
        );
        if (!histMix.rows[0]) {
          const existing = await pool.query(
            `SELECT id FROM mix_designs WHERE tenant_id=$1 AND design_code=$2`,
            [tenantId, `MIG${codeToken(username)}-HIST-MIX`]
          );
          histMix.rows[0] = existing.rows[0];
        }
        const histOrder = await pool.query(
          `INSERT INTO orders
             (tenant_id, order_number, client_id, delivery_site_id, mix_design_id,
              total_volume_m3, remaining_volume_m3, price_per_m3_sar, scheduled_date,
              status, created_by_rep_id, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,0,0,0,now(),'DRAFT',$6,now(),now()) RETURNING id`,
          [tenantId, `MIG${codeToken(username)}-ORD-HIST`, histClientId, histSite.rows[0].id,
           histMix.rows[0].id, adminId]
        );
        fallbackOrderId = histOrder.rows[0].id;
        orderIdBySiteNo["__hist__"] = fallbackOrderId;
      }

      for (let i = 0; i < trips.length; i++) {
        const t = trips[i] ?? {};
        const code = String(t.code || `m${i + 1}`).trim();
        if (!vehicleIdByCode[code]) {
          const plate = `${username}-${code}`;
          const r = await pool.query(
            `INSERT INTO fleet_vehicles
               (tenant_id, vehicle_code, plate_number, vehicle_type, vehicle_class,
                tare_weight_tonnes, current_status, is_active)
             VALUES ($1,$2,$3,'MIXER_TRUCK','MIXER',0,'AVAILABLE',true)
             ON CONFLICT (plate_number) DO NOTHING RETURNING id`,
            [tenantId, `MIG${codeToken(username)}-V${sanitizeCode(code).slice(0, 5)}`, plate]
          );
          if (!r.rows[0]) {
            const existing = await pool.query(
              `SELECT id FROM fleet_vehicles WHERE tenant_id=$1 AND plate_number=$2`, [tenantId, plate]
            );
            r.rows[0] = existing.rows[0];
          }
          vehicleIdByCode[code] = r.rows[0]?.id;
        }

        const driverName = String(t.driver || "").trim() || username;
        if (!driverIdByName[driverName]) {
          driverIdByName[driverName] = randomUUID();
          await pool.query(
            `INSERT INTO users
               (id, tenant_id, employee_code, full_name, email, phone_number, password_hash, role, is_active)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'DRIVER',true)
             ON CONFLICT DO NOTHING`,
            [driverIdByName[driverName], tenantId,
             `MIG${codeToken(username)}-DRV-T${i + 1}`, driverName,
             `${sanitizeCode(username)}.tripdriver${i + 1}@migrated.fimtosoft.com`,
             deterministicPhone(username + driverName),
             await import("bcryptjs").then((b) => b.hashSync(`Migrated@${username}T${i}`, 10))]
          );
        }

        const mixCode = `MIG${codeToken(username)}-DEFAULT`;
        const mixRes = await pool.query(
          `INSERT INTO mix_designs (tenant_id, design_code, grade_description, target_strength_mpa,
             target_slump_cm, cement_kg_per_m3, sand_kg_per_m3, gravel_20mm_kg_per_m3, water_litres_per_m3)
           VALUES ($1,$2,'Default',30,8,0,0,0,0)
           ON CONFLICT (design_code) DO NOTHING RETURNING id`,
          [tenantId, mixCode]
        );
        if (!mixRes.rows[0]) {
          const existing = await pool.query(
            `SELECT id FROM mix_designs WHERE tenant_id=$1 AND design_code=$2`, [tenantId, mixCode]
          );
          mixRes.rows[0] = existing.rows[0];
        }
        const mixId = mixRes.rows[0].id;

        // link to an order if any imported order matches, else the first order
        const orderId = orderIdBySiteNo[t.id] ?? orderIdBySiteNo[t.orderId]
          ?? Object.values(orderIdBySiteNo)[0];

        const tripNumber = `MIG${codeToken(username)}-TRP${String(i + 1).padStart(3, "0")}`;
        await pool.query(
          `INSERT INTO trips
             (tenant_id, trip_number, order_id, vehicle_id, driver_id, mix_design_id,
              loaded_volume_m3, current_checkpoint, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),now())
           ON CONFLICT (trip_number) DO NOTHING`,
          [tenantId, tripNumber, orderId, vehicleIdByCode[code], driverIdByName[driverName],
           mixId, parseFloat(t.qty) || 0,
           String(t.status || "").toUpperCase() === "COMPLETED" ? "RETURN_PLANT" : "ARR_PLANT"]
        );
      }
      userReport.tripsImported = trips.length;
      console.log(`  trips: ${trips.length}`);

      // 9) inventory → silos
      const inventory = data.inventory ?? {};
      const siloMap: Array<[string, string, string, any]> = [
        ["cement", "CEMENT", "SLO-C1", "Cement Silo"],
        ["sand", "SAND", "BIN-S1", "Sand Bin"],
        ["gravel", "GRAVEL_20MM", "BIN-G1", "Gravel Bin"],
        ["admixture", "ADMIXTURE_PLASTICIZER", "TNK-A1", "Admixture Tank"],
      ];
      let silosImported = 0;
      for (const [key, category, code, name] of siloMap) {
        const qty = parseFloat(inventory[key]);
        if (isNaN(qty) || qty === 0) continue;
        await pool.query(
          `INSERT INTO inventory_silos
             (tenant_id, silo_code, silo_name, material_category, current_stock_kg, capacity_kg, reorder_level_kg)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (silo_code) DO NOTHING`,
          [tenantId, `MIG${codeToken(username)}-${code}`, name, category,
           Math.round(qty * 1000), 100000, 20000]
        );
        silosImported++;
      }
      userReport.silosImported = silosImported;
      console.log(`  silos: ${silosImported}`);

      // 10) payments → migrated_payments
      const payments = Array.isArray(data.payments) ? data.payments : [];
      for (const p of payments) {
        await pool.query(
          `INSERT INTO migrated_payments
             (tenant_id, client_name, amount, method, status, reference, order_no, date, note, link, qr)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [tenantId, p.client ?? p.customer ?? null, parseFloat(p.amount) || 0,
           p.method || null, p.status || null, p.ref || null, p.orderNo || null,
           toIso(p.date) ? new Date(p.date) : null, p.note || null, p.link || null, p.qr || null]
        );
      }
      userReport.paymentsImported = payments.length;
      console.log(`  payments: ${payments.length}`);

      report[username] = userReport;
      console.log(`  ✔ ${username} migrated.`);
    }

    fs.writeFileSync(
      path.join(__dirname, "migration-report.json"),
      JSON.stringify(report, null, 2)
    );
    console.log("\nMigration complete. Report: scripts/migrate-firebase/migration-report.json");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
