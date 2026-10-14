import { NextRequest } from "next/server";
import { db } from "@/db";
import { gatePasses } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/gate/[id] — one ticket with its receiving-document bytes.
 *
 * Bytes are excluded from the day list (multi-MB data URIs × 300 rows) and
 * fetched per ticket when the user taps read/download.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.WEIGHBRIDGE_READ);
  if ("status" in auth) return auth;
  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return errorResponse("INVALID_ID", "Invalid ticket id", 400);
  const [t] = await db
    .select({
      id: gatePasses.id,
      ticketNo: gatePasses.ticketNo,
      docName: gatePasses.docName,
      docUrl: gatePasses.docUrl,
    })
    .from(gatePasses)
    .where(and(eq(gatePasses.id, id), eq(gatePasses.tenantId, auth.user.tenantId)))
    .limit(1);
  if (!t) return errorResponse("TICKET_NOT_FOUND", "التذكرة غير موجودة", 404);
  return successResponse(t, t.docName ?? "no document");
}
