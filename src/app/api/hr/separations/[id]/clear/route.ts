import { NextRequest } from "next/server";
import { db } from "@/db";
import { hrSeparations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/** POST /api/hr/separations/[id]/clear — clear the exit (HR_WRITE) */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return errorResponse("INVALID_ID", "Invalid separation id", 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const note = z.object({ clearanceNote: z.string().max(2000).optional() }).safeParse(body);
  const clearanceNote = note.success ? note.data.clearanceNote?.trim() || null : null;

  const [cleared] = await db
    .update(hrSeparations)
    .set({ status: "CLEARED", clearanceNote, clearedById: auth.user.sub, clearedAt: new Date() })
    .where(
      and(
        eq(hrSeparations.id, id),
        eq(hrSeparations.tenantId, auth.user.tenantId),
        eq(hrSeparations.status, "OPEN")
      )
    )
    .returning();

  if (!cleared) {
    return errorResponse("SEPARATION_NOT_FOUND", "Only OPEN separations can be cleared", 409);
  }
  return successResponse(cleared, "تم إخلاء الطرف");
}
