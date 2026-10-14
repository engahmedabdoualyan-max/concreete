import { NextRequest } from "next/server";
import { db } from "@/db";
import { hrPenalties, hrRewards } from "@/db/schema";
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
 *  GET /api/hr/actions — penalties + rewards, newest first
 *  POST /api/hr/actions — issue one (HR_WRITE)
 * ============================================================
 *  kind PENALTY: WARNING | DEDUCTION | SUSPENSION | TERMINATION
 *  kind REWARD:  BONUS | OVERTIME_BONUS | RECOGNITION
 *  A DEDUCTION/BONUS here is a signed record; it reaches payroll only
 *  when the payroll officer adds it to a run. ?kind= filters the list.
 */

const ActionSchema = z.object({
  kind: z.enum(["PENALTY", "REWARD"]),
  employeeId: z.string().uuid(),
  subKind: z.string().min(1).max(20),
  amountSar: z.number().nonnegative().optional(),
  suspensionDays: z.number().int().nonnegative().optional(),
  reason: z.string().min(1).max(2000),
});

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;
  const kind = new URL(req.url).searchParams.get("kind");

  const [pens, rews] = await Promise.all([
    kind && kind !== "PENALTY"
      ? []
      : db
          .select()
          .from(hrPenalties)
          .where(eq(hrPenalties.tenantId, auth.user.tenantId))
          .orderBy(desc(hrPenalties.issuedAt)),
    kind && kind !== "REWARD"
      ? []
      : db
          .select()
          .from(hrRewards)
          .where(eq(hrRewards.tenantId, auth.user.tenantId))
          .orderBy(desc(hrRewards.issuedAt)),
  ]);

  const rows = [
    ...pens.map((p) => ({ ...p, kind: "PENALTY" as const, subKind: p.kind })),
    ...rews.map((r) => ({ ...r, kind: "REWARD" as const, subKind: r.kind })),
  ].sort((a, b) => +new Date(b.issuedAt) - +new Date(a.issuedAt));

  return successResponse({ actions: rows }, `${rows.length} action(s)`);
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid action payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const d = parsed.data;

  try {
    if (d.kind === "PENALTY") {
      const [created] = await db
        .insert(hrPenalties)
        .values({
          tenantId: auth.user.tenantId,
          employeeId: d.employeeId,
          kind: d.subKind,
          amountSar: d.amountSar !== undefined ? String(d.amountSar) : null,
          suspensionDays: d.suspensionDays ?? null,
          reason: d.reason,
          issuedById: auth.user.sub,
        })
        .returning();
      return successResponse({ ...created, kind: "PENALTY" }, "تم تسجيل الجزاء", 201);
    }
    const [created] = await db
      .insert(hrRewards)
      .values({
        tenantId: auth.user.tenantId,
        employeeId: d.employeeId,
        kind: d.subKind,
        amountSar: d.amountSar !== undefined ? String(d.amountSar) : null,
        reason: d.reason,
        issuedById: auth.user.sub,
      })
      .returning();
    return successResponse({ ...created, kind: "REWARD" }, "تم تسجيل المكافأة", 201);
  } catch (err) {
    console.error("[POST /api/hr/actions]", err);
    return errorResponse("HR_ERROR", "Failed to record action", 500);
  }
}
