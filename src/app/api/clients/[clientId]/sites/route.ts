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
import { eq, and, asc, sql } from "drizzle-orm";
import { z } from "zod";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { isUniqueViolation } from "@/lib/db/pg-errors";

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

const CreateSiteSchema = z.object({
  siteName: z.string().trim().min(2).max(200),
  city: z.string().trim().max(100).optional(),
  addressLine: z.string().trim().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

/**
 * POST /api/clients/[clientId]/sites — add a pour location (ORDER_CREATE).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.ORDER_CREATE);
  if ("status" in auth) return auth;
  const { clientId } = await params;
  if (!clientId || !/^[0-9a-f-]{36}$/i.test(clientId))
    return errorResponse("INVALID_CLIENT_ID", "Client ID must be a valid UUID", 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = CreateSiteSchema.safeParse(body);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Invalid site payload", 400);
  const d = parsed.data;

  const owner = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.tenantId, auth.user.tenantId)))
    .limit(1);
  if (!owner[0]) return errorResponse("CLIENT_NOT_FOUND", "Client not found", 404);

  for (let attempt = 0; attempt < 3; attempt++) {
    const n = await db.execute(sql`
      SELECT COALESCE(COUNT(*), 0)::int AS n FROM delivery_sites
      WHERE tenant_id = ${auth.user.tenantId}
    `);
    const code = `DS-${String(Number((n.rows as { n: number }[])[0]?.n ?? 0) + 1 + attempt).padStart(4, "0")}`;
    try {
      const [row] = await db
        .insert(deliverySites)
        .values({
          tenantId: auth.user.tenantId,
          clientId,
          siteName: d.siteName,
          siteCode: code,
          city: d.city || null,
          addressLine: d.addressLine || null,
          latitude: d.latitude !== undefined ? String(d.latitude) : null,
          longitude: d.longitude !== undefined ? String(d.longitude) : null,
        })
        .returning({ id: deliverySites.id, siteCode: deliverySites.siteCode });
      return successResponse(row, `تم تسجيل الموقع ${code}`, 201);
    } catch (e: unknown) {
      if (isUniqueViolation(e)) continue;
      throw e;
    }
  }
  return errorResponse("SITE_FAILED", "تعذر تسجيل الموقع", 500);
}
