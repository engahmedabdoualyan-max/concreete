/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/workspace — Website workspace blob store
 * ============================================================
 *
 *  Replaces the website's Firestore per-user data (userData/{user}/{col}/data)
 *  with JSONB blobs stored on the ERP PostgreSQL server, scoped to the
 *  authenticated user's tenant. Keeps the website's UI/pages unchanged while
 *  unifying the infrastructure onto a single database.
 *
 *  ENDPOINTS:
 *  GET  /api/workspace/:collection      — read one collection blob
 *  PUT  /api/workspace/:collection      — write one collection blob
 *  DELETE /api/workspace/:collection    — remove one collection blob
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { z } from "zod";

export const dynamic = "force-dynamic";

const MAX_BLOB_BYTES = 20 * 1024 * 1024; // 20 MB per collection

const ADMIN_ONLY_COLLECTIONS = new Set(["adminUsers"]);
const PLANT_ADMIN_COLLECTIONS = new Set(["adminPlantProfile"]);

function canManageCollection(role: string, collection: string): boolean {
  if (ADMIN_ONLY_COLLECTIONS.has(collection)) return role === "SUPER_ADMIN";
  if (PLANT_ADMIN_COLLECTIONS.has(collection)) {
    return role === "SUPER_ADMIN" || role === "PLANT_MGR";
  }
  return true;
}

const ALLOWED_COLLECTIONS = new Set([
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
  // Legacy site tables merged into the unified DB (migrated from the
  // third-party Supabase project mxdirmrmfuycrbqvjrsb):
  "gpsLocations",
  "adminUsers",
  "adminPlantProfile",
]);

const COLLECTION_SCHEMA = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-zA-Z0-9_-]+$/);

/** Ensures the blob table exists (self-contained, mirrors the schema). */
async function ensureTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS website_workspace (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      collection varchar(60) NOT NULL,
      data jsonb NOT NULL DEFAULT '{}'::jsonb,
      source varchar(20) NOT NULL DEFAULT 'website',
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE (tenant_id, collection)
    );
  `);
}

type Ctx = { params: Promise<{ collection: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { collection } = await ctx.params;
  const parsed = COLLECTION_SCHEMA.safeParse(collection);
  if (!parsed.success) return errorResponse("INVALID_COLLECTION", "Invalid collection name.", 400);
  if (!ALLOWED_COLLECTIONS.has(collection)) {
    return errorResponse("INVALID_COLLECTION", `Collection '${collection}' is not allowed.`, 400);
  }
  if (!canManageCollection(auth.user.role, collection)) {
    return errorResponse("FORBIDDEN", "You cannot manage this workspace collection.", 403);
  }

  await ensureTable();
  const rows = await db.execute(sql`
    SELECT data, updated_at FROM website_workspace
    WHERE tenant_id = ${auth.user.tenantId} AND collection = ${collection} LIMIT 1
  `);
  const row = rows.rows.length ? (rows.rows[0] as { data: unknown; updated_at: unknown }) : null;

  return successResponse({
    collection,
    data: row?.data ?? null,
    updatedAt: row?.updated_at ?? null,
  });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { collection } = await ctx.params;
  const parsed = COLLECTION_SCHEMA.safeParse(collection);
  if (!parsed.success) return errorResponse("INVALID_COLLECTION", "Invalid collection name.", 400);
  if (!ALLOWED_COLLECTIONS.has(collection)) {
    return errorResponse("INVALID_COLLECTION", `Collection '${collection}' is not allowed.`, 400);
  }
  if (!canManageCollection(auth.user.role, collection)) {
    return errorResponse("FORBIDDEN", "You cannot manage this workspace collection.", 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON.", 400);
  }

  const size = Buffer.byteLength(JSON.stringify(body ?? {}));
  if (size > MAX_BLOB_BYTES) {
    return errorResponse("BLOB_TOO_LARGE", `Collection payload exceeds ${MAX_BLOB_BYTES} bytes.`, 413);
  }

  await ensureTable();
  await db.execute(sql`
    INSERT INTO website_workspace (tenant_id, collection, data, source, updated_at, updated_by)
    VALUES (${auth.user.tenantId}, ${collection}, ${JSON.stringify(body ?? {})}::jsonb, 'website', now(), ${auth.user.sub})
    ON CONFLICT (tenant_id, collection)
    DO UPDATE SET data = EXCLUDED.data, source = EXCLUDED.source, updated_at = now(), updated_by = EXCLUDED.updated_by
  `);

  return successResponse({ collection, saved: true }, "Workspace collection saved.");
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { collection } = await ctx.params;
  const parsed = COLLECTION_SCHEMA.safeParse(collection);
  if (!parsed.success) return errorResponse("INVALID_COLLECTION", "Invalid collection name.", 400);
  if (!ALLOWED_COLLECTIONS.has(collection)) {
    return errorResponse("INVALID_COLLECTION", `Collection '${collection}' is not allowed.`, 400);
  }
  if (!canManageCollection(auth.user.role, collection)) {
    return errorResponse("FORBIDDEN", "You cannot manage this workspace collection.", 403);
  }

  await ensureTable();
  await db.execute(sql`
    DELETE FROM website_workspace WHERE tenant_id = ${auth.user.tenantId} AND collection = ${collection}
  `);
  return successResponse({ collection, deleted: true }, "Workspace collection deleted.");
}
