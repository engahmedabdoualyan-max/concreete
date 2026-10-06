import { NextRequest } from "next/server";
import { db } from "@/db";
import { fleetVehicles } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/** PUT /api/hr/vehicles/[id]/renewals — set paperwork dates (HR_WRITE) */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RenewalsSchema = z.object({
  istimaraExpiry: z.string().min(1).nullable().optional(),
  insuranceExpiresAt: z.string().min(1).nullable().optional(),
  inspectionDueAt: z.string().min(1).nullable().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;
  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return errorResponse("INVALID_ID", "Invalid vehicle id", 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = RenewalsSchema.safeParse(body);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Invalid dates payload", 400);
  const d = parsed.data;
  if (d.istimaraExpiry === undefined && d.insuranceExpiresAt === undefined && d.inspectionDueAt === undefined) {
    return errorResponse("VALIDATION_ERROR", "Nothing to update", 400);
  }

  const patch: Record<string, Date | null> = {};
  if (d.istimaraExpiry !== undefined) patch.istimaraExpiry = d.istimaraExpiry ? new Date(d.istimaraExpiry) : null;
  if (d.insuranceExpiresAt !== undefined) patch.insuranceExpiresAt = d.insuranceExpiresAt ? new Date(d.insuranceExpiresAt) : null;
  if (d.inspectionDueAt !== undefined) patch.inspectionDueAt = d.inspectionDueAt ? new Date(d.inspectionDueAt) : null;

  const [updated] = await db
    .update(fleetVehicles)
    .set(patch)
    .where(and(eq(fleetVehicles.id, id), eq(fleetVehicles.tenantId, auth.user.tenantId)))
    .returning({ id: fleetVehicles.id });
  if (!updated) return errorResponse("VEHICLE_NOT_FOUND", "Vehicle not found", 404);
  return successResponse({ id: updated.id }, "تم حفظ تواريخ التجديد");
}
