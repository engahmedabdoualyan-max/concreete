import { NextRequest } from "next/server";
import { db } from "@/db";
import { hrAbsences, payrollEmployees } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { isUniqueViolation } from "@/lib/db/pg-errors";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  HR absences — manual غياب registration against the payroll roster
 *  GET    /api/hr/absences?date=YYYY-MM-DD — day list + manpower summary
 *  POST   /api/hr/absences — mark absent (HR_WRITE)
 *  DELETE /api/hr/absences?id= — unmark (HR_WRITE)
 * ============================================================
 *  present = active roster − absent that day. The broadcast manpower tile
 *  reads the summary (e.g. 107/110) from GET.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dayRiyadh(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;
  const q = new URL(req.url).searchParams.get("date");
  const date = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : dayRiyadh();

  const roster = await db
    .select({ id: payrollEmployees.id })
    .from(payrollEmployees)
    .where(
      and(
        eq(payrollEmployees.tenantId, auth.user.tenantId),
        eq(payrollEmployees.isActive, true)
      )
    );
  const rows = await db
    .select({
      id: hrAbsences.id,
      employeeId: hrAbsences.employeeId,
      name: payrollEmployees.fullName,
      code: payrollEmployees.employeeCode,
      reason: hrAbsences.reason,
    })
    .from(hrAbsences)
    .innerJoin(payrollEmployees, eq(payrollEmployees.id, hrAbsences.employeeId))
    .where(and(eq(hrAbsences.tenantId, auth.user.tenantId), eq(hrAbsences.workDate, date)))
    .orderBy(payrollEmployees.fullName);

  const total = roster.length;
  const absent = rows.length;
  return successResponse(
    {
      date,
      total,
      absent,
      present: Math.max(0, total - absent),
      absences: rows,
    },
    `${absent} absent of ${total}`
  );
}

const MarkSchema = z.object({
  employeeId: z.string().uuid(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  reason: z.string().trim().max(200).optional(),
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
  const parsed = MarkSchema.safeParse(body);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Invalid absence payload", 400);

  const emp = await db
    .select({ id: payrollEmployees.id })
    .from(payrollEmployees)
    .where(
      and(
        eq(payrollEmployees.id, parsed.data.employeeId),
        eq(payrollEmployees.tenantId, auth.user.tenantId)
      )
    )
    .limit(1);
  if (!emp[0]) return errorResponse("EMPLOYEE_NOT_FOUND", "الموظف غير موجود", 404);

  try {
    const [row] = await db
      .insert(hrAbsences)
      .values({
        tenantId: auth.user.tenantId,
        employeeId: parsed.data.employeeId,
        workDate: parsed.data.date ?? dayRiyadh(),
        reason: parsed.data.reason || null,
        recordedById: auth.user.sub,
      })
      .returning({ id: hrAbsences.id });
    return successResponse({ id: row.id }, "تم تسجيل الغياب", 201);
  } catch (e: unknown) {
    if (isUniqueViolation(e))
      return errorResponse("ALREADY_MARKED", "الغياب مسجل بالفعل لهذا اليوم", 409);
    throw e;
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !UUID_RE.test(id)) return errorResponse("INVALID_ID", "Invalid absence id", 400);
  const [deleted] = await db
    .delete(hrAbsences)
    .where(and(eq(hrAbsences.id, id), eq(hrAbsences.tenantId, auth.user.tenantId)))
    .returning({ id: hrAbsences.id });
  if (!deleted) return errorResponse("ABSENCE_NOT_FOUND", "Not found", 404);
  return successResponse({ id: deleted.id }, "تم إلغاء الغياب");
}
