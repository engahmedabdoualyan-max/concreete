/**
 * ============================================================
 *  PUT    /api/hr/employees/[id]  — Edit package / status
 *  DELETE /api/hr/employees/[id]  — Deactivate (keeps history)
 * ============================================================
 *  RBAC: HR_WRITE
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { updateEmployee } from "@/lib/services/payroll.service";
import { db } from "@/db";
import { payrollEmployees } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function badId() {
  return errorResponse("INVALID_EMPLOYEE_ID", "Employee ID must be a valid UUID", 400);
}

const UpdateEmployeeSchema = z.object({
  fullName: z.string().min(1).max(120).optional(),
  nationalId: z.string().max(20).optional(),
  nationality: z.enum(["SAUDI", "NON_SAUDI"]).optional(),
  gosiSystem: z.enum(["LEGACY", "NEW"]).optional(),
  jobTitle: z.string().max(120).optional(),
  department: z.string().max(80).optional(),
  baseSalarySar: z.number().nonnegative().optional(),
  housingAllowanceSar: z.number().nonnegative().optional(),
  transportAllowanceSar: z.number().nonnegative().optional(),
  otherAllowancesSar: z.number().nonnegative().optional(),
  bankIban: z.string().max(40).optional(),
  bankName: z.string().max(80).optional(),
  isActive: z.boolean().optional(),
  photoUrl: z.string().min(1).max(1_500_000).optional(),
  dateOfBirth: z.string().min(1).optional(),
  bloodGroup: z.string().max(5).optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return badId();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = UpdateEmployeeSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid employee payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const updated = await updateEmployee(auth.user.tenantId, id, parsed.data);
    if (!updated) return errorResponse("EMPLOYEE_NOT_FOUND", "Employee not found", 404);
    return successResponse(updated, "Employee updated");
  } catch (err) {
    console.error("[PUT /api/hr/employees/:id]", err);
    return errorResponse("HR_ERROR", "Failed to update employee", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return badId();

  try {
    const [updated] = await db
      .update(payrollEmployees)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(payrollEmployees.id, id),
          eq(payrollEmployees.tenantId, auth.user.tenantId)
        )
      )
      .returning({ id: payrollEmployees.id });
    if (!updated) return errorResponse("EMPLOYEE_NOT_FOUND", "Employee not found", 404);
    return successResponse({ id }, "Employee deactivated");
  } catch (err) {
    console.error("[DELETE /api/hr/employees/:id]", err);
    return errorResponse("HR_ERROR", "Failed to deactivate employee", 500);
  }
}
