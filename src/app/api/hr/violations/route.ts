import { NextRequest } from "next/server";
import { db } from "@/db";
import { hrViolations } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
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
 *  GET /api/hr/violations — traffic fines charged to drivers
 *  POST /api/hr/violations — record one (HR_WRITE)
 *  POST /api/hr/violations/[id]/pay — mark paid (HR_WRITE)
 * ============================================================
 *  Unpaid in-period violations flow into the monthly deductions
 *  statement; paying removes them from future statements.
 */

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;
  const paid = new URL(req.url).searchParams.get("paid");
  const rows = await db
    .select()
    .from(hrViolations)
    .where(eq(hrViolations.tenantId, auth.user.tenantId))
    .orderBy(desc(hrViolations.violationDate));
  const list =
    paid === "true" ? rows.filter((r) => r.paid)
    : paid === "false" ? rows.filter((r) => !r.paid)
    : rows;
  return successResponse({ violations: list }, `${list.length} violation(s)`);
}

const ViolationSchema = z.object({
  employeeId: z.string().uuid(),
  vehicleId: z.string().uuid().optional(),
  kind: z.enum(["TRAFFIC", "OTHER"]).optional(),
  amountSar: z.number().positive(),
  violationDate: z.string().min(1).optional(),
  location: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = ViolationSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid violation payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const d = parsed.data;

  try {
    const [created] = await db
      .insert(hrViolations)
      .values({
        tenantId: auth.user.tenantId,
        employeeId: d.employeeId,
        vehicleId: d.vehicleId ?? null,
        kind: d.kind ?? "TRAFFIC",
        amountSar: String(d.amountSar),
        violationDate: d.violationDate ? new Date(d.violationDate) : new Date(),
        location: d.location ?? null,
        notes: d.notes ?? null,
        recordedById: auth.user.sub,
      })
      .returning();
    return successResponse(created, "تم تسجيل المخالفة على السائق", 201);
  } catch (err) {
    console.error("[POST /api/hr/violations]", err);
    return errorResponse("HR_ERROR", "Failed to record violation", 500);
  }
}
