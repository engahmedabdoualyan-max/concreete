import { NextRequest } from "next/server";
import { db } from "@/db";
import { hrCustody } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/** POST /api/hr/custody/[id]/return — take an item back (HR_WRITE) */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return errorResponse("INVALID_ID", "Invalid custody id", 400);
  }

  const [returned] = await db
    .update(hrCustody)
    .set({ status: "RETURNED", returnedAt: new Date() })
    .where(
      and(
        eq(hrCustody.id, id),
        eq(hrCustody.tenantId, auth.user.tenantId),
        eq(hrCustody.status, "HELD")
      )
    )
    .returning();

  if (!returned) {
    return errorResponse("CUSTODY_NOT_FOUND", "Only HELD items can be returned", 409);
  }
  return successResponse(returned, "تم استلام العهدة");
}
