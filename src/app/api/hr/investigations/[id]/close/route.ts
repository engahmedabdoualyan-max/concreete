import { NextRequest } from "next/server";
import { db } from "@/db";
import { hrInvestigations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/** POST /api/hr/investigations/[id]/close — file the outcome (HR_WRITE) */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return errorResponse("INVALID_ID", "Invalid investigation id", 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const outcome = z.object({ outcome: z.string().max(2000).optional() }).safeParse(body);
  const note = outcome.success ? outcome.data.outcome ?? null : null;

  const [closed] = await db
    .update(hrInvestigations)
    .set({ status: "CLOSED", outcome: note, closedById: auth.user.sub, closedAt: new Date() })
    .where(
      and(
        eq(hrInvestigations.id, id),
        eq(hrInvestigations.tenantId, auth.user.tenantId),
        eq(hrInvestigations.status, "OPEN")
      )
    )
    .returning();

  if (!closed) {
    return errorResponse("INVESTIGATION_NOT_FOUND", "Only OPEN investigations can be closed", 409);
  }
  return successResponse(closed, "تم إغلاق التحقيق");
}
