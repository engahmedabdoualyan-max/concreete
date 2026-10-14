/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/sites/[siteId] — تعديل موقع فرع (edit, promote, retire)
 * ============================================================
 *
 *  ENDPOINTS:
 *  PATCH  /api/sites/[siteId]  — update / promote / deactivate one site
 *
 *  Three actions on one route because they are one action in the plant: "this
 *  branch moved", "this branch is now the main one", "this branch closed". They
 *  share the same validation and the same audit shape, and splitting them across
 *  three routes would mean three places to keep the tenant check.
 *
 *  There is no DELETE. Telemetry keeps arriving for a site that closed, so a hard
 *  delete would leave live readings pointing at nothing; retiring sets
 *  `is_active = false` and the row stays readable for history.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  deactivateSite,
  promoteSite,
  SiteError,
  updateSite,
  type SiteErrorKind,
} from "@/lib/services/sites.service";

export const dynamic = "force-dynamic";

const PatchSiteSchema = z.object({
  siteName: z.string().trim().min(2).max(200).optional(),
  siteType: z.enum(["PLANT", "BRANCH", "STATION", "YARD"]).optional(),
  addressLine: z.string().trim().max(400).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  geofenceRadiusMetres: z.number().int().positive().max(50_000).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),

  // The two lifecycle actions, as flags on the same route.
  makePrimary: z.boolean().optional(),
  deactivate: z.boolean().optional(),
});

function errorFor(err: SiteError) {
  switch (err.kind as SiteErrorKind) {
    case "CODE_TAKEN":
      return errorResponse("SITE_CODE_TAKEN", err.message, 409);
    case "ANOTHER_PRIMARY_EXISTS":
      return errorResponse("SITE_PRIMARY_EXISTS", err.message, 409);
    case "PRIMARY_REQUIRED":
      return errorResponse("SITE_PRIMARY_REQUIRED", err.message, 409);
    case "BAD_COORDINATES":
      return errorResponse("SITE_BAD_COORDINATES", err.message, 400);
    case "BAD_RADIUS":
      return errorResponse("SITE_BAD_RADIUS", err.message, 400);
    case "NOT_FOUND":
      return errorResponse("SITE_NOT_FOUND", err.message, 404);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.SITE_WRITE);
  if ("status" in auth) return auth;

  const { siteId } = await params;
  const parsed = PatchSiteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(
      "INVALID_BODY",
      parsed.error.issues[0]?.message ?? "Invalid site update.",
      400,
      parsed.error.flatten()
    );
  }

  const { makePrimary, deactivate, ...patch } = parsed.data;

  try {
    // Field edits first, so a bad coordinate is reported before the lifecycle
    // change has already been applied — otherwise "you can't retire the primary"
    // masks the typo that was the actual problem.
    let site = Object.keys(patch).length
      ? await updateSite(auth.user.tenantId, siteId, patch)
      : null;

    if (makePrimary) {
      site = await promoteSite(auth.user.tenantId, siteId);
    }
    if (deactivate) {
      site = await deactivateSite(auth.user.tenantId, siteId);
    }
    if (!site) {
      // Nothing to change is not an error, but it does need a current row to
      // return — and it must be fetched under the tenant scope, not echoed back.
      const { getSite } = await import("@/lib/services/sites.service");
      const existing = await getSite(auth.user.tenantId, siteId);
      if (!existing) return errorResponse("SITE_NOT_FOUND", "Site not found.", 404);
      site = existing;
    }

    await db.insert(auditLogs).values({
      userId: auth.user.sub,
      tenantId: auth.user.tenantId,
      action: makePrimary
        ? "SITE_PROMOTED_PRIMARY"
        : deactivate
          ? "SITE_RETIRED"
          : "SITE_UPDATED",
      entityType: "site",
      entityId: site.id,
      newState: {
        siteCode: site.siteCode,
        siteName: site.siteName,
        siteType: site.siteType,
        latitude: site.latitude,
        longitude: site.longitude,
        geofenceRadiusMetres: site.geofenceRadiusMetres,
        isPrimary: site.isPrimary,
        isActive: site.isActive,
      },
    });

    return successResponse(site, `Site "${site.siteName}" updated.`);
  } catch (err) {
    if (err instanceof SiteError) return errorFor(err);
    throw err;
  }
}