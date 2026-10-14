import { NextRequest } from "next/server";
import { db } from "@/db";
import { hrCustody, hrInvestigations, hrSeparations, hrViolations } from "@/db/schema";
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
 *  GET /api/hr/separations[?status=] — exits with live clearance
 *  POST /api/hr/separations — open one (HR_WRITE)
 *  POST /api/hr/separations/[id]/clear — clear it (HR_WRITE)
 * ============================================================
 *  Clearance is computed live from sibling tables (open custody,
 *  unpaid violations, open investigations) — nothing duplicated.
 *  Clearing records who cleared and when; history stays.
 */

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;
  const status = new URL(req.url).searchParams.get("status");
  const t = auth.user.tenantId;

  const rows = await db
    .select()
    .from(hrSeparations)
    .where(eq(hrSeparations.tenantId, t))
    .orderBy(desc(hrSeparations.createdAt));
  const list =
    status === "OPEN" || status === "CLEARED" ? rows.filter((r) => r.status === status) : rows;

  const [cust, vio, inv] = await Promise.all([
    db.select({ employeeId: hrCustody.employeeId }).from(hrCustody)
      .where(and(eq(hrCustody.tenantId, t), eq(hrCustody.status, "HELD"))),
    db.select({ employeeId: hrViolations.employeeId }).from(hrViolations)
      .where(and(eq(hrViolations.tenantId, t), eq(hrViolations.paid, false))),
    db.select({ employeeId: hrInvestigations.employeeId }).from(hrInvestigations)
      .where(and(eq(hrInvestigations.tenantId, t), eq(hrInvestigations.status, "OPEN"))),
  ]);
  const countBy = (rows: Array<{ employeeId: string }>) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.employeeId, (m.get(r.employeeId) ?? 0) + 1);
    return m;
  };
  const cCust = countBy(cust);
  const cVio = countBy(vio);
  const cInv = countBy(inv);

  return successResponse(
    {
      separations: list.map((s) => ({
        ...s,
        clearance: {
          openCustody: cCust.get(s.employeeId) ?? 0,
          unpaidViolations: cVio.get(s.employeeId) ?? 0,
          openInvestigations: cInv.get(s.employeeId) ?? 0,
        },
      })),
    },
    `${list.length} separation(s)`
  );
}

const OpenSchema = z.object({
  employeeId: z.string().uuid(),
  type: z.enum(["RESIGNATION", "TERMINATION", "END_CONTRACT"]),
  lastWorkingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(2000).optional(),
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
  const parsed = OpenSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid separation payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const d = parsed.data;
  const [created] = await db
    .insert(hrSeparations)
    .values({
      tenantId: auth.user.tenantId,
      employeeId: d.employeeId,
      type: d.type,
      lastWorkingDate: d.lastWorkingDate,
      reason: d.reason?.trim() || null,
      openedById: auth.user.sub,
    })
    .returning();
  return successResponse(created, "تم فتح ملف الخروج", 201);
}
