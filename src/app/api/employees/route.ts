/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/employees — سجلات الموظفين: the employee master + badge QR
 * ============================================================
 *
 *  ENDPOINTS:
 *  GET  /api/employees            — the employee list, each row with its badge
 *  POST /api/employees            — add a worker and code their badge
 *  GET  /api/employees?code=EMP-12 — one employee, with movements history
 *
 *  OWNERSHIP
 *  ─────────────────────────────────────────────────────────
 *  `employee:read` / `employee:write` belong to HR_MANAGER (مدير الموارد البشرية)
 *  and SUPER_ADMIN. The HR officer files leave requests and broadcasts; the
 *  manager decides who exists. Creating a worker and issuing the badge they wear
 *  is one action — an employee with no badge cannot be checked at the gate.
 *
 *  WHAT IS DELIBERATELY NOT HERE
 *  ─────────────────────────────────────────────────────────
 *  The list response carries no salary, no bank IBAN and no national ID. Those
 *  live in the payroll module behind `hr:read`, and a badge directory is not the
 *  place to leak them — especially since this screen is reachable by anyone who
 *  can print a label sheet.
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { isUniqueViolation } from "@/lib/db/pg-errors";
import { payrollEmployees, users, auditLogs } from "@/db/schema";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  issueLabel,
  buildQrPayload,
  labelsForSubjects,
} from "@/lib/services/asset-qr.service";
import { and, eq, asc, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CreateEmployeeSchema = z.object({
  employeeCode: z
    .string()
    .trim()
    .min(2, "employeeCode is too short")
    .max(20)
    .regex(/^[A-Za-z0-9._-]+$/, "employeeCode may only contain letters, digits, dot, dash, underscore"),
  fullName: z.string().trim().min(2).max(120),
  jobTitle: z.string().trim().max(120).optional().nullable(),
  department: z.string().trim().max(80).optional().nullable(),
  /** SAUDI | NON_SAUDI — drives the GOSI track defaults. */
  nationality: z.enum(["SAUDI", "NON_SAUDI"]).optional(),
  gosiSystem: z.enum(["LEGACY", "NEW"]).optional(),
  hireDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "hireDate must be YYYY-MM-DD")
    .optional()
    .nullable(),
  baseSalarySar: z.number().min(0).optional(),
  housingAllowanceSar: z.number().min(0).optional(),
  transportAllowanceSar: z.number().min(0).optional(),
  otherAllowancesSar: z.number().min(0).optional(),
  bankIban: z.string().trim().max(40).optional().nullable(),
  bankName: z.string().trim().max(80).optional().nullable(),
  nationalId: z.string().trim().max(20).optional().nullable(),
  /** Link to a login account, when the worker also uses the system. */
  userId: z.string().uuid().optional().nullable(),
});

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.EMPLOYEE_READ);
  if ("status" in auth) return auth;

  const sp = req.nextUrl.searchParams;
  const code = sp.get("code");

  if (code) {
    const [emp] = await db
      .select({
        id: payrollEmployees.id,
        employeeCode: payrollEmployees.employeeCode,
        fullName: payrollEmployees.fullName,
        jobTitle: payrollEmployees.jobTitle,
        department: payrollEmployees.department,
        nationality: payrollEmployees.nationality,
        gosiSystem: payrollEmployees.gosiSystem,
        hireDate: payrollEmployees.hireDate,
        isActive: payrollEmployees.isActive,
        userId: payrollEmployees.userId,
        userEmail: users.email,
      })
      .from(payrollEmployees)
      .leftJoin(users, eq(users.id, payrollEmployees.userId))
      .where(
        and(
          eq(payrollEmployees.tenantId, auth.user.tenantId),
          eq(payrollEmployees.employeeCode, code)
        )
      )
      .limit(1);

    if (!emp) {
      return errorResponse("EMPLOYEE_NOT_FOUND", `No employee with code "${code}".`, 404);
    }

    const labels = await labelsForSubjects(auth.user.tenantId, "EMPLOYEE", [emp.id]);
    return successResponse(
      { ...emp, qrLabelCode: labels.get(emp.id)?.labelCode ?? null },
      "Employee"
    );
  }

  const conditions = [eq(payrollEmployees.tenantId, auth.user.tenantId)];
  if (sp.get("includeInactive") !== "1") {
    conditions.push(eq(payrollEmployees.isActive, true));
  }
  const search = sp.get("search")?.trim();
  if (search) {
    const needle = `%${search}%`;
    const clause = or(
      ilike(payrollEmployees.fullName, needle),
      ilike(payrollEmployees.employeeCode, needle),
      ilike(payrollEmployees.jobTitle, needle),
      ilike(payrollEmployees.department, needle)
    );
    if (clause) conditions.push(clause);
  }

  const rows = await db
    .select({
      id: payrollEmployees.id,
      employeeCode: payrollEmployees.employeeCode,
      fullName: payrollEmployees.fullName,
      jobTitle: payrollEmployees.jobTitle,
      department: payrollEmployees.department,
      nationality: payrollEmployees.nationality,
      gosiSystem: payrollEmployees.gosiSystem,
      hireDate: payrollEmployees.hireDate,
      isActive: payrollEmployees.isActive,
      hasLogin: sql<boolean>`${payrollEmployees.userId} IS NOT NULL`,
    })
    .from(payrollEmployees)
    .where(and(...conditions))
    .orderBy(asc(payrollEmployees.employeeCode))
    .limit(Number(sp.get("limit") ?? 300));

  const labels = await labelsForSubjects(
    auth.user.tenantId,
    "EMPLOYEE",
    rows.map((r) => r.id)
  );

  return successResponse(
    rows.map((r) => ({ ...r, qrLabelCode: labels.get(r.id)?.labelCode ?? null })),
    `${rows.length} employee(s)`
  );
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.EMPLOYEE_WRITE);
  if ("status" in auth) return auth;

  const parsed = CreateEmployeeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(
      "INVALID_BODY",
      parsed.error.issues[0]?.message ?? "Invalid employee.",
      400,
      parsed.error.flatten()
    );
  }

  const d = parsed.data;

  // A linked login must belong to this tenant, or the employee card would point
  // at somebody else's account in the staff directory.
  if (d.userId) {
    const [linked] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, d.userId),
          eq(users.tenantId, auth.user.tenantId),
          eq(users.isActive, true)
        )
      )
      .limit(1);
    if (!linked) {
      return errorResponse(
        "INVALID_USER_LINK",
        "That login does not exist in your plant, or it is deactivated.",
        400
      );
    }
  }

  try {
    const [employee] = await db
      .insert(payrollEmployees)
      .values({
        tenantId: auth.user.tenantId,
        employeeCode: d.employeeCode,
        fullName: d.fullName,
        jobTitle: d.jobTitle ?? null,
        department: d.department ?? null,
        nationality: d.nationality ?? "NON_SAUDI",
        gosiSystem: d.gosiSystem ?? "LEGACY",
        hireDate: d.hireDate ? new Date(d.hireDate) : null,
        baseSalarySar: String(d.baseSalarySar ?? 0),
        housingAllowanceSar: String(d.housingAllowanceSar ?? 0),
        transportAllowanceSar: String(d.transportAllowanceSar ?? 0),
        otherAllowancesSar: String(d.otherAllowancesSar ?? 0),
        bankIban: d.bankIban ?? null,
        bankName: d.bankName ?? null,
        nationalId: d.nationalId ?? null,
        userId: d.userId ?? null,
      })
      .returning();

    // The badge is part of adding the worker: it is how they are identified at
    // the gate, in the workshop and on a scanned part's paperwork.
    const issued = await issueLabel({
      tenantId: auth.user.tenantId,
      subjectType: "EMPLOYEE",
      subjectId: employee!.id,
      subjectRef: employee!.employeeCode,
      subjectLabel: employee!.fullName,
      issuedById: auth.user.sub,
    });

    await db.insert(auditLogs).values({
      userId: auth.user.sub,
      tenantId: auth.user.tenantId,
      action: "EMPLOYEE_CREATED",
      entityType: "payroll_employees",
      entityId: employee!.id,
      newState: {
        employeeCode: employee!.employeeCode,
        fullName: employee!.fullName,
        department: employee!.department,
        jobTitle: employee!.jobTitle,
        labelCode: issued.label.labelCode,
        hasLogin: Boolean(d.userId),
      },
    });

    return successResponse(
      {
        employee: employee!,
        qrLabelCode: issued.label.labelCode,
        qrPayload: issued.token
          ? buildQrPayload(issued.label.labelCode, issued.token)
          : null,
      },
      "Employee added. Print the badge now — scanning it needs the qr:scan permission.",
      201
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      return errorResponse(
        "EMPLOYEE_CODE_TAKEN",
        `Employee code "${d.employeeCode}" is already in use. The code is printed on the badge, so it must be unique.`,
        409
      );
    }
    throw err;
  }
}