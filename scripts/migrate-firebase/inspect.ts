/**
 * ============================================================
 *  FIMTO SOFT — Firebase → PostgreSQL Data Migration
 *  scripts/migrate-firebase/inspect.ts
 * ============================================================
 *
 *  Read-only inspection of the website Firestore data
 *  (project `concrete-erb`) via the Firestore REST API.
 *
 *  Uses the same anonymous public-read path as the website
 *  (firestore.rules allow read: if true), so it works with just
 *  the API key — no service account needed.
 *
 *  USAGE: npx tsx scripts/migrate-firebase/inspect.ts
 * ============================================================
 */

import * as fs from "fs";
import * as path from "path";

const API_KEY = "AIzaSyBbK2e2saN8Olu7O6vjHP23MkTsUgyN2iE";
const PROJECT = "concrete-erb";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

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

async function getJson(url: string) {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

/** Converts a Firestore REST value into a plain JS value */
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
  if (v.arrayValue) {
    return (v.arrayValue.values ?? []).map(decode);
  }
  if (v.mapValue) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v.mapValue.fields ?? {})) {
      out[k] = decode(val);
    }
    return out;
  }
  return null;
}

/** Wraps a document's `fields` map into a Value object for decode() */
function decodeFields(fields: any): any {
  return decode({ mapValue: { fields: fields ?? {} } });
}

const SENSITIVE_KEYS = new Set([
  "password", "passwordHash", "accessToken", "refreshToken", "token",
  "authorization", "dataUrl", "qrCodeToken", "signatureImage", "phone", "email",
]);

function redact(value: any, depth = 0): any {
  if (depth > 8) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, any> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SENSITIVE_KEYS.has(key) ? "[REDACTED]" : redact(item, depth + 1);
  }
  return out;
}

function summarize(v: any, depth = 0): string {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    return `Array(${v.length}) of ${summarize(v[0], depth + 1)}`;
  }
  if (typeof v === "object") {
    const keys = Object.keys(v).slice(0, 14);
    return `{${keys.map((k) => `${k}:${summarize(v[k], depth + 1)}`).join(", ")}}`;
  }
  return typeof v;
}

async function readAllPages(url: string) {
  const out: any[] = [];
  let nextUrl: string | null = url;
  while (nextUrl) {
    const json = await getJson(nextUrl);
    out.push(...(json.documents ?? []));
    nextUrl = json.nextPageToken
      ? `${url}&pageToken=${json.nextPageToken}`
      : null;
  }
  return out;
}

async function main() {
  const usersDocs = await readAllPages(
    `${BASE}/users?pageSize=100&key=${API_KEY}`
  );
  console.log(`Users in Firestore: ${usersDocs.length}`);
  if (usersDocs.length === 0) {
    console.log("No users found — nothing to migrate.");
    return;
  }

  const outDir = path.join(__dirname, "inspect-out");
  fs.mkdirSync(outDir, { recursive: true });
  const report: Record<string, any> = {};

  for (const doc of usersDocs) {
    const userId = doc.name.split("/").pop();
    const userFields = redact(decodeFields(doc.fields));
    console.log(`\n=== User: ${userId} ===`);
    console.log(`  fields: ${JSON.stringify(userFields).slice(0, 400)}`);

    const detail: Record<string, any> = { userFields };

    for (const col of COLLECTIONS) {
      try {
        // Rules only grant read on the exact document path
        // userData/{userId}/{collectionName}/data — not on listing the
        // collection — so we fetch each document directly.
        const url = `${BASE}/userData/${userId}/${col}/data?key=${API_KEY}`;
        const json = await getJson(url);
        const decoded = decodeFields(json.fields);
        const list = Array.isArray(decoded?.data) ? decoded.data : [decoded?.data];
        console.log(
          `  ${col}: ${list.length} record(s) — shape: ${summarize(
            list[0]
          ).slice(0, 320)}`
        );
        detail[col] = { count: list.length, sample: redact(list.slice(0, 3)) };
      } catch (e) {
        console.log(`  ${col}: 0`);
      }
    }

    fs.writeFileSync(
      path.join(outDir, `user-${userId}.json`),
      JSON.stringify(detail, null, 2)
    );
    report[userId] = {
      userFields,
      collections: Object.fromEntries(
        Object.entries(detail)
          .filter(([k]) => k !== "userFields")
          .map(([k, v]) => [k, (v as any).count ?? 0])
      ),
    };
  }

  fs.writeFileSync(path.join(outDir, "_summary.json"), JSON.stringify(report, null, 2));
  console.log(`\n\nInspection complete. Files in ${outDir}`);
}

main().catch((e) => {
  console.error("Inspection failed:", e);
  process.exit(1);
});
