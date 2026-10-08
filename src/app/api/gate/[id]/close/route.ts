import { NextRequest } from "next/server";
import { db } from "@/db";
import { gatePasses } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * PUT /api/gate/[id]/close — stamp the second weighing (WEIGHBRIDGE_RECORD)
 *
 * Closes an OPEN ticket: net = |entry − exit|, computed server-side so the
 * delivered/received tonnage can never be hand-typed.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CloseSchema = z.object({
  weightKg: z.number().positive().max(200000),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.WEIGHBRIDGE_RECORD);
  if ("status" in auth) return auth;
  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return errorResponse("INVALID_ID", "Invalid ticket id", 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = CloseSchema.safeParse(body);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Invalid weighing", 400);

  const [t] = await db
    .select()
    .from(gatePasses)
    .where(and(eq(gatePasses.id, id), eq(gatePasses.tenantId, auth.user.tenantId)))
    .limit(1);
  if (!t) return errorResponse("TICKET_NOT_FOUND", "التذكرة غير موجودة", 404);
  if (t.status !== "OPEN") return errorResponse("TICKET_CLOSED", "التذكرة مغلقة بالفعل", 409);
  if (t.entryWeightKg === null)
    return errorResponse("NO_ENTRY_WEIGHT", "لا توجد وزنة دخول", 400);

  const entry = Number(t.entryWeightKg);
  const net = Math.abs(entry - parsed.data.weightKg);
  const [updated] = await db
    .update(gatePasses)
    .set({
      exitWeightKg: String(parsed.data.weightKg),
      netWeightKg: String(net),
      status: "CLOSED",
      closedAt: new Date(),
    })
    .where(eq(gatePasses.id, id))
    .returning({ ticketNo: gatePasses.ticketNo });
  return successResponse(
    { ticketNo: updated.ticketNo, netWeightKg: net },
    `تم إغلاق ${updated.ticketNo} — الصافي ${net.toLocaleString("ar-EG")} كجم`
  );
}
