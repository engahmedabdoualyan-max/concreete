/**
 * ============================================================
 *  GET  /api/hr/sites  — Company branches (sites) for HR
 * ============================================================
 *  RBAC: HR_READ
 *
 *  The HR screens (employee file, org chart) need the list of
 *  branches. They used to read it from the fleet readiness report
 *  (/api/fleet/readiness), which made HR depend on FLEET_READ and
 *  on the vehicles module being available. This endpoint gives HR
 *  its own source: active sites of the caller's tenant.
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { db } from "@/db";
import { sites } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;

  try {
    const rows = await db
      .select({ id: sites.id, code: sites.siteCode, name: sites.siteName })
      .from(sites)
      .where(and(eq(sites.tenantId, auth.user.tenantId), eq(sites.isActive, true)))
      .orderBy(asc(sites.siteCode));

    return successResponse({ sites: rows }, `${rows.length} site(s)`);
  } catch (err) {
    console.error("[GET /api/hr/sites]", err);
    return errorResponse("HR_ERROR", "Failed to load sites", 500);
  }
}
