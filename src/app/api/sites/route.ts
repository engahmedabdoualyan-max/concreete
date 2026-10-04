/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/sites — مواقع المصنع والفروع (plant + branch locations)
 * ============================================================
 *
 *  ENDPOINTS:
 *  GET  /api/sites        — the register, primary first
 *  POST /api/sites        — add a site (or the first, primary, site)
 *
 *  WHY THIS IS IN POSTGRES AND NOT THE COMPANY SCREEN
 *  "بيانات الشركة" persists to Firestore, but everything that would *use* these
 *  coordinates — `fleet_vehicles`, `telematics_devices`, `telematics_readings`,
 *  `driver_locations` — is Postgres. A coordinate saved only to Firestore cannot
 *  reach the telemetry, so distance-from-plant and arrival detection would have
 *  nothing to read. Hence a table beside the fleet, not a field beside the logo.
 *
 *  READ is deliberately broad (SITE_READ, granted to drivers and dispatchers):
 *  "which yard is this load for" and "am I back at the plant" are both distance
 *  questions, and a role that cannot read the site list cannot answer either.
 *
 *  WRITE is SITE_WRITE, plant owner and above. Moving the plant moves every
 *  distance and ETA in the system, so a dispatcher gets to read that answer and
 *  never to change it.
 *
 *  Reading the SITE register is not the same as being allowed to see the fleet on
 *  it. A driver reads the sites — his own distance to the plant, via
 *  /api/sites/near — without seeing where anyone else's truck is. That second
 *  capability is FLEET_POSITION_READ and is reported separately as
 *  `canReadFleetPositions` so the SPA can hide that tab instead of shipping a tab
 *  that 403s.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS, roleHasPermission } from "@/lib/auth/rbac";
import type { UserRole } from "@/db/schema";
import {
  createSite,
  listSites,
  SiteError,
  type SiteErrorKind,
} from "@/lib/services/sites.service";

export const dynamic = "force-dynamic";

const CreateSiteSchema = z.object({
  siteCode: z
    .string()
    .trim()
    .min(1, "Site code is required")
    .max(30)
    .regex(
      /^[A-Za-z0-9._-]+$/,
      "Site code may only contain letters, digits, dot, dash, underscore"
    ),
  siteName: z.string().trim().min(2, "Site name is required").max(200),
  siteType: z.enum(["PLANT", "BRANCH", "STATION", "YARD"]).optional(),
  addressLine: z.string().trim().max(400).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  // Validated here for a readable error, and again by CHECK constraints in the
  // database, which are the actual guard.
  latitude: z.number().min(-90, "Latitude must be between -90 and 90").max(90),
  longitude: z.number().min(-180, "Longitude must be between -180 and 180").max(180),
  geofenceRadiusMetres: z.number().int().positive("Radius must be greater than zero").max(50_000).optional(),
  isPrimary: z.boolean().optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

/** Turn a service error into advice the caller can act on, not a restatement. */
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

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.SITE_READ);
  if ("status" in auth) return auth;

  const includeInactive = req.nextUrl.searchParams.get("includeInactive") === "1";
  const rows = await listSites(auth.user.tenantId, includeInactive);

  return successResponse(
    {
      sites: rows.map((s) => ({
        ...s,
        latitude: Number(s.latitude),
        longitude: Number(s.longitude),
      })),
      hasPrimary: rows.some((s) => s.isPrimary),
      // Told to the client rather than reimplemented there. The alternative is a
      // second copy of the role→permission table in the SPA, which is guaranteed
      // to drift the first time a grant changes — and a stale copy fails OPEN,
      // showing an edit form whose every submission 403s.
      canWrite: roleHasPermission(auth.user.role as UserRole, PERMISSIONS.SITE_WRITE),
      // Whether to offer the "fleet on the map" tab at all. Without this the SPA
      // would either show a tab whose every request 403s, or hide the tab by
      // reimplementing this role table client-side — which drifts, and a stale
      // copy here fails in the *safe* direction (hidden tab) only by luck.
      // A driver holds SITE_READ and must still not be offered the fleet map, so
      // this is not implied by canWrite.
      canReadFleetPositions: roleHasPermission(
        auth.user.role as UserRole,
        PERMISSIONS.FLEET_POSITION_READ
      ),
    },
    `${rows.length} site(s)`
  );
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.SITE_WRITE);
  if ("status" in auth) return auth;

  const parsed = CreateSiteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(
      "INVALID_BODY",
      parsed.error.issues[0]?.message ?? "Invalid site.",
      400,
      parsed.error.flatten()
    );
  }

  try {
    const site = await createSite(auth.user.tenantId, parsed.data, auth.user.sub);

    await db.insert(auditLogs).values({
      userId: auth.user.sub,
      tenantId: auth.user.tenantId,
      action: "SITE_REGISTERED",
      entityType: "site",
      entityId: site.id,
      newState: {
        siteCode: site.siteCode,
        siteName: site.siteName,
        siteType: site.siteType,
        latitude: site.latitude,
        longitude: site.longitude,
        isPrimary: site.isPrimary,
      },
    });

    return successResponse(site, `Site "${site.siteName}" registered.`, 201);
  } catch (err) {
    if (err instanceof SiteError) return errorFor(err);
    throw err;
  }
}