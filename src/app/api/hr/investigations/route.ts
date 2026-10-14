import { NextRequest } from "next/server";
import { db } from "@/db";
import { hrInvestigations } from "@/db/schema";
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
 *  GET /api/hr/investigations — open first, then closed (?status=)
 *  POST /api/hr/investigations — open one (HR_WRITE)
 *  POST /api/hr/investigations/[id]/close — file the outcome (HR_WRITE)
 * ============================================================
 */

const OpenSchema = z.object({
  employeeId: z.string().uuid(),
  subject: z.string().min(1).max(200),
  details: z.string().max(4000).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;
  const status = new URL(req.url).searchParams.get("status");

  const rows = await db
    .select()
    .from(hrInvestigations)
    .where(eq(hrInvestigations.tenantId, auth.user.tenantId))
    .orderBy(desc(hrInvestigations.createdAt));

  const list =
    status === "OPEN" || status === "CLOSED"
      ? rows.filter((r) => r.status === status)
      : [...rows].sort((a, b) => (a.status === "OPEN" ? -1 : 1) - (b.status === "OPEN" ? -1 : 1));
  return successResponse({ investigations: list }, `${list.length} investigation(s)`);
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
  const parsed = OpenSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid investigation payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const [created] = await db
      .insert(hrInvestigations)
      .values({
        tenantId: auth.user.tenantId,
        employeeId: parsed.data.employeeId,
        subject: parsed.data.subject,
        details: parsed.data.details ?? null,
        openedById: auth.user.sub,
      })
      .returning();
    return successResponse(created, "تم فتح التحقيق", 201);
  } catch (err) {
    console.error("[POST /api/hr/investigations]", err);
    return errorResponse("HR_ERROR", "Failed to open investigation", 500);
  }
}
