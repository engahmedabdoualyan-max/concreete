import { NextRequest } from "next/server";
import { db } from "@/db";
import { hrOvertime } from "@/db/schema";
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
 *  GET /api/hr/overtime[?status=] — extra-hours slips
 *  POST /api/hr/overtime — file one (any authenticated employee
 *    files their own; HR files for anyone)
 *  POST /api/hr/overtime/[id]/review — APPROVED|REJECTED (HR_WRITE)
 * ============================================================
 *  Approved slips are the payroll officer's source of truth when the
 *  monthly run is drafted.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;
  const status = new URL(req.url).searchParams.get("status");
  const rows = await db
    .select()
    .from(hrOvertime)
    .where(eq(hrOvertime.tenantId, auth.user.tenantId))
    .orderBy(desc(hrOvertime.workDate));
  const list =
    status === "PENDING" || status === "APPROVED" || status === "REJECTED"
      ? rows.filter((r) => r.status === status)
      : rows;
  return successResponse({ overtime: list }, `${list.length} slip(s)`);
}

const SlipSchema = z.object({
  employeeId: z.string().uuid(),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.number().positive().max(24),
  rateSar: z.number().nonnegative().optional(),
  reason: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = SlipSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid overtime payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const d = parsed.data;
  const [created] = await db
    .insert(hrOvertime)
    .values({
      tenantId: auth.user.tenantId,
      employeeId: d.employeeId,
      workDate: d.workDate,
      hours: String(d.hours),
      rateSar: d.rateSar !== undefined ? String(d.rateSar) : null,
      reason: d.reason ?? null,
    })
    .returning();
  return successResponse(created, "تم تسجيل الساعات الإضافية", 201);
}

const ReviewSchema = z.object({ decision: z.enum(["APPROVED", "REJECTED"]) });

export async function PUT(req: NextRequest) {
  // Review lives here (not nested) to keep the route tree flat:
  // PUT /api/hr/overtime?id=<slip>&decision=APPROVED|REJECTED (HR_WRITE)
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const decision = url.searchParams.get("decision") ?? "";
  if (!UUID_RE.test(id)) return errorResponse("INVALID_ID", "Invalid slip id", 400);
  const parsed = ReviewSchema.safeParse({ decision });
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "decision must be APPROVED|REJECTED", 400);

  const [updated] = await db
    .update(hrOvertime)
    .set({ status: parsed.data.decision, reviewedById: auth.user.sub })
    .where(
      and(
        eq(hrOvertime.id, id),
        eq(hrOvertime.tenantId, auth.user.tenantId),
        eq(hrOvertime.status, "PENDING")
      )
    )
    .returning();
  if (!updated) return errorResponse("SLIP_NOT_FOUND", "Only PENDING slips can be reviewed", 409);
  return successResponse(updated, `Slip ${updated.status}`);
}
