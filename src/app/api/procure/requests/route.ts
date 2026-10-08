import { NextRequest } from "next/server";
import { db } from "@/db";
import { procureQuotes, procureRequests, fleetVehicles } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  GET  /api/procure/requests — list with quote counts
 *  POST /api/procure/requests — raise one (PROCURE_REQUEST)
 *  Actions live under /[id]/<action>: quotes, submit, review,
 *  approve, receive, issue (see those route files).
 * ============================================================
 */

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.PROCURE_REQUEST);
  if ("status" in auth) return auth;
  const status = new URL(req.url).searchParams.get("status");
  const rows = await db
    .select({
      req: procureRequests,
      vehicleCode: fleetVehicles.vehicleCode,
      plateNumber: fleetVehicles.plateNumber,
    })
    .from(procureRequests)
    .leftJoin(fleetVehicles, eq(fleetVehicles.id, procureRequests.vehicleId))
    .where(eq(procureRequests.tenantId, auth.user.tenantId))
    .orderBy(desc(procureRequests.createdAt));
  const counts = await db
    .select({ requestId: procureQuotes.requestId })
    .from(procureQuotes)
    .where(eq(procureQuotes.tenantId, auth.user.tenantId));
  const nByReq = new Map<string, number>();
  for (const q of counts) nByReq.set(q.requestId, (nByReq.get(q.requestId) ?? 0) + 1);
  const list = rows.map((r) => ({
    ...r.req,
    vehicleCode: r.vehicleCode,
    plateNumber: r.plateNumber,
    quotes: nByReq.get(r.req.id) ?? 0,
  }));
  return successResponse(
    { requests: status ? list.filter((r) => r.status === status) : list },
    `${list.length} request(s)`
  );
}

const CreateSchema = z.object({
  itemName: z.string().min(1).max(200),
  /** Registry code from warehouse_items (search-select in the form). */
  itemCode: z.string().trim().max(30).optional(),
  /** Vehicle the part/material is for. */
  vehicleId: z.string().uuid().optional(),
  quantity: z.number().positive(),
  unit: z.string().max(20).optional(),
  reason: z.string().max(2000).optional(),
  workshopRef: z.string().max(120).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.PROCURE_REQUEST);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid request payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const d = parsed.data;
  if (d.vehicleId) {
    const v = await db
      .select({ id: fleetVehicles.id })
      .from(fleetVehicles)
      .where(and(eq(fleetVehicles.id, d.vehicleId), eq(fleetVehicles.tenantId, auth.user.tenantId)))
      .limit(1);
    if (!v[0]) return errorResponse("VEHICLE_NOT_FOUND", "المركبة غير موجودة", 404);
  }
  const [created] = await db
    .insert(procureRequests)
    .values({
      tenantId: auth.user.tenantId,
      itemName: d.itemName.trim(),
      itemCode: d.itemCode?.trim() || null,
      vehicleId: d.vehicleId ?? null,
      quantity: String(d.quantity),
      unit: d.unit?.trim() || "قطعة",
      reason: d.reason?.trim() || null,
      workshopRef: d.workshopRef?.trim() || null,
      requestedById: auth.user.sub,
    })
    .returning();
  return successResponse(created, "تم إنشاء طلب الشراء", 201);
}
