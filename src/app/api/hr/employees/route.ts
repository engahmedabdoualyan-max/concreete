/**
 * ============================================================
 *  GET  /api/hr/employees  — Staff directory
 *  POST /api/hr/employees  — Add employee + salary package
 * ============================================================
 *  RBAC: HR_READ (GET) · HR_WRITE (POST)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { listEmployees, createEmployee } from "@/lib/services/payroll.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;

  try {
    const employees = await listEmployees(auth.user.tenantId);
    return successResponse({ employees }, `${employees.length} employee(s)`);
  } catch (err) {
    console.error("[GET /api/hr/employees]", err);
    return errorResponse("HR_ERROR", "Failed to load employees", 500);
  }
}

const CreateEmployeeSchema = z.object({
  employeeCode: z.string().min(1).max(20),
  fullName: z.string().min(1).max(120),
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
  hireDate: z.string().min(1).optional(),
  userId: z.string().uuid().optional(),
  countryCode: z.string().max(4).optional(),
  contactPhone: z.string().max(20).optional(),
  emergencyContactName: z.string().max(120).optional(),
  emergencyContactPhone: z.string().max(20).optional(),
  lastVacationDate: z.string().min(1).optional(),
  lastResumptionDate: z.string().min(1).optional(),
  medicalInsuranceNo: z.string().max(60).optional(),
  medicalInsuranceExpiry: z.string().min(1).optional(),
  iqamaExpiry: z.string().min(1).optional(),
  vehiclePlate: z.string().max(20).optional(),
  vehicleOwnership: z.enum(["PRIVATE", "COMPANY"]).optional(),
  dateOfBirth: z.string().min(1).optional(),
  bloodGroup: z.string().max(5).optional(),
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

  const parsed = CreateEmployeeSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid employee payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const employee = await createEmployee(auth.user.tenantId, parsed.data);
    return successResponse(employee, "Employee added", 201);
  } catch (err) {
    console.error("[POST /api/hr/employees]", err);
    return errorResponse("HR_ERROR", "Failed to add employee", 500);
  }
}
