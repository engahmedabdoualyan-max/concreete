import { NextRequest } from "next/server";
import { db } from "@/db";
import { hrViolations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/** POST /api/hr/violations/[id]/pay — mark paid (HR_WRITE) */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return errorResponse("INVALID_ID", "Invalid violation id", 400);
  }

  const [paid] = await db
    .update(hrViolations)
    .set({ paid: true, paidAt: new Date() })
    .where(
      and(
        eq(hrViolations.id, id),
        eq(hrViolations.tenantId, auth.user.tenantId),
        eq(hrViolations.paid, false)
      )
    )
    .returning({ id: hrViolations.id });

  if (!paid) {
    return errorResponse("VIOLATION_NOT_FOUND", "Violation not found or already paid", 409);
  }
  return successResponse({ id: paid.id }, "تم تحصيل المخالفة");
}
