/**
 * ============================================================
 *  FIMTO SOFT — Website Workspace Blob Migration
 *  scripts/migrate-firebase/migrate-workspace.ts
 * ============================================================
 *
 *  Moves the website's per-user data blobs
 *  (Firestore: userData/{user}/{collection}/data)
 *  into the unified ERP table `website_workspace`
 *  (scoped per tenant). This is the "unification" step that
 *  lets the website read/write the SAME PostgreSQL database as
 *  the mobile app — no Firebase round-trips.
 *
 *  USAGE: npx tsx scripts/migrate-firebase/migrate-workspace.ts
 * ============================================================
 */

import "dotenv/config";
import pg from "pg";

const API_KEY = "AIzaSyBbK2e2saN8Olu7O6vjHP23MkTsUgyN2iE";
const PROJECT = "concrete-erb";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const COLLECTIONS = [
  "trips",
  "oeeLogs",
  "recipes",
  "calibrationLogs",
  "inventory",
  "deliveries",
  "productionRuns",
  "qcRecords",
  "assets",
  "workshopConfig",
  "customers",
  "plantProfile",
  "weighbridgeRecords",
  "returnedConcrete",
  "payments",
  "purchaseOrders",
  "rawStock",
  "plants",
  "blockPlants",
  "gpsConfig",
  "gpsHistory",
  "livePositions",
  "orders",
  "notifications",
];

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

async function readAllPages(url: string) {
  const out: any[] = [];
  let nextUrl: string | null = url;
  while (nextUrl) {
    const json = await getJson(nextUrl);
    if (!json) break;
    out.push(...(json.documents ?? []));
    nextUrl = json.nextPageToken ? `${url}&pageToken=${json.nextPageToken}` : null;
  }
  return out;
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS website_workspace (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      collection varchar(60) NOT NULL,
      data jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE (tenant_id, collection)
    );
  `);

  // Map Firebase username → tenant via tenant_code (UPPER(username))
  const tenantRes = await pool.query(
    `SELECT id, tenant_code FROM tenants WHERE tenant_code = ANY($1::text[])`,
    [["ADMIN", "GUEST", "QUOTAPROBE86964", "QUOTATEST661749"]]
  );
  const tenantByCode: Record<string, string> = {};
  for (const t of tenantRes.rows) tenantByCode[t.tenant_code] = t.id;

  const usersDocs = await readAllPages(`${BASE}/users?pageSize=100&key=${API_KEY}`);
  console.log(`Firestore users: ${usersDocs.length}`);

  let migrated = 0;
  let skipped = 0;
  const report: Record<string, any> = {};

  for (const doc of usersDocs) {
    const username = doc.name.split("/").pop();
    const code = username.toUpperCase().replace(/_/g, "");
    const tenantId = tenantByCode[code];
    if (!tenantId) {
      console.log(`  [${username}] ⚠ no tenant found (code ${code}) — skipped`);
      skipped++;
      continue;
    }
    report[username] = { tenantCode: code, collections: {}, error: null };

    for (const col of COLLECTIONS) {
      try {
        const url = `${BASE}/userData/${username}/${col}/data?key=${API_KEY}`;
        const json = await getJson(url);
        if (!json?.fields) continue; // no data for this collection
        const decoded = decodeFields(json.fields);
        const data = decoded?.data ?? null;
        if (data === null || data === undefined) continue;

        const size = Buffer.byteLength(JSON.stringify(data));
        await pool.query(
          `INSERT INTO website_workspace (tenant_id, collection, data)
           VALUES ($1, $2, $3::jsonb)
           ON CONFLICT (tenant_id, collection)
           DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
          [tenantId, col, JSON.stringify(data)]
        );
        report[username].collections[col] = { bytes: size };
        migrated++;
        console.log(`  [${username}] ${col}: ${(size / 1024).toFixed(1)} KB ✓`);
      } catch (e: any) {
        report[username].error = e?.message;
        console.log(`  [${username}] ${col}: ERROR ${e?.message}`);
      }
    }
  }

  console.log(`\nMigrated collections: ${migrated}, users skipped: ${skipped}`);
  const fs = await import("fs");
  fs.writeFileSync(
    `${__dirname}/workspace-migration-report.json`,
    JSON.stringify(report, null, 2)
  );
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
