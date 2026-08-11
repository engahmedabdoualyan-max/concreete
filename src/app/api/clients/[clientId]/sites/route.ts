/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  GET /api/clients/[clientId]/sites — Tenant-scoped delivery
 *  sites for a client (Sales Rep booking form).
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { clients, deliverySites } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.ORDER_READ);
  if ("status" in auth) return auth;

  const { clientId } = await params;

  if (!clientId || !/^[0-9a-f-]{36}$/i.test(clientId)) {
    return errorResponse("INVALID_CLIENT_ID", "Client ID must be a valid UUID", 400);
  }

  // The client must exist within the caller's tenant.
  const clientRows = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(eq(clients.id, clientId), eq(clients.tenantId, auth.user.tenantId))
    )
    .limit(1);

  if (clientRows.length === 0) {
    return errorResponse("CLIENT_NOT_FOUND", "Client not found", 404);
  }

  const sites = await db
    .select({
      id: deliverySites.id,
      siteName: deliverySites.siteName,
      siteCode: deliverySites.siteCode,
      city: deliverySites.city,
      latitude: deliverySites.latitude,
      longitude: deliverySites.longitude,
      geofenceRadiusMetres: deliverySites.geofenceRadiusMetres,
      isActive: deliverySites.isActive,
    })
    .from(deliverySites)
    .where(
      and(
        eq(deliverySites.clientId, clientId),
        eq(deliverySites.tenantId, auth.user.tenantId),
        eq(deliverySites.isActive, true)
      )
    )
    .orderBy(asc(deliverySites.siteName));

  return successResponse(sites);
}
