import { NextRequest } from "next/server";
import { db } from "@/db";
import { hrCustody } from "@/db/schema";
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
 *  GET /api/hr/custody — company property with employees
 *  POST /api/hr/custody — hand an item over (HR_WRITE)
 *  POST /api/hr/custody/[id]/return — take it back (HR_WRITE)
 * ============================================================
 */

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;
  const status = new URL(req.url).searchParams.get("status");
  const rows = await db
    .select()
    .from(hrCustody)
    .where(eq(hrCustody.tenantId, auth.user.tenantId))
    .orderBy(desc(hrCustody.handedAt));
  const list =
    status === "HELD" || status === "RETURNED"
      ? rows.filter((r) => r.status === status)
      : rows;
  return successResponse({ custody: list }, `${list.length} item(s)`);
}

const HandSchema = z.object({
  employeeId: z.string().uuid(),
  item: z.string().min(1).max(200),
  serialNo: z.string().max(100).optional(),
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
  const parsed = HandSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid custody payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const [created] = await db
      .insert(hrCustody)
      .values({
        tenantId: auth.user.tenantId,
        employeeId: parsed.data.employeeId,
        item: parsed.data.item,
        serialNo: parsed.data.serialNo ?? null,
        notes: parsed.data.notes ?? null,
        handedById: auth.user.sub,
      })
      .returning();
    return successResponse(created, "تم تسليم العهدة", 201);
  } catch (err) {
    console.error("[POST /api/hr/custody]", err);
    return errorResponse("HR_ERROR", "Failed to record custody", 500);
  }
}
