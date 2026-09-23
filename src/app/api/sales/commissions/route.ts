/**
 * ============================================================
 *  GET  /api/sales/commissions?salesRepId=&from=&to=&status=
 *       — Preview earnings OR list stored rows
 *  POST /api/sales/commissions — Approve preview → PENDING rows
 * ============================================================
 *  GET with ?preview=1&salesRepId&from&to → computed preview.
 *  GET with ?status=&period= → stored rows.
 *  RBAC: own data (any auth) · all reps (RFQ_APPROVE).
 *  POST: RFQ_APPROVE.
 * ============================================================
 */

import { NextRequest } from "next/server";
import {
  requireAuth,
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  previewCommissions,
  approveCommissions,
  listCommissions,
} from "@/lib/services/rfq.service";
import { userHasPermission } from "@/lib/auth/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const preview = url.searchParams.get("preview") === "1";
  const canSeeAll = userHasPermission(
    auth.user.role,
    auth.user.permissions ?? [],
    PERMISSIONS.RFQ_APPROVE
  );

  try {
    if (preview) {
      const salesRepId = url.searchParams.get("salesRepId") ?? auth.user.sub;
      if (salesRepId !== auth.user.sub && !canSeeAll) {
        return errorResponse("FORBIDDEN", "You can only preview your own commissions", 403);
      }
      const from = url.searchParams.get("from") ?? new Date().toISOString().slice(0, 10);
      const to = url.searchParams.get("to") ?? from;
      const res = await previewCommissions(auth.user.tenantId, salesRepId, from, to);
      if (!res.ok) return errorResponse("NO_SCHEME", res.error, 409);
      return successResponse(res, "Commission preview");
    }

    const salesRepId = url.searchParams.get("salesRepId") ?? undefined;
    if (salesRepId && salesRepId !== auth.user.sub && !canSeeAll) {
      return errorResponse("FORBIDDEN", "You can only view your own commissions", 403);
    }
    const rows = await listCommissions(auth.user.tenantId, {
      salesRepId: canSeeAll ? salesRepId : auth.user.sub,
      period: url.searchParams.get("period") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });
    return successResponse({ commissions: rows }, `${rows.length} commission(s)`);
  } catch (err) {
    console.error("[GET /api/sales/commissions]", err);
    return errorResponse("COMMISSION_ERROR", "Failed to load commissions", 500);
  }
}

const ApproveSchema = z.object({
  salesRepId: z.string().uuid(),
  schemeId: z.string().uuid(),
  ratePct: z.number().min(0).max(100),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  lines: z
    .array(
      z.object({
        orderId: z.string().uuid(),
        revenueSar: z.number().nonnegative(),
        commissionSar: z.number().nonnegative(),
      })
    )
    .min(1)
    .max(500),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.RFQ_APPROVE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = ApproveSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid approval payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const res = await approveCommissions(
      auth.user.tenantId,
      auth.user.sub,
      parsed.data
    );
    return successResponse(res, `${res.created} commission row(s) approved`, 201);
  } catch (err) {
    console.error("[POST /api/sales/commissions]", err);
    return errorResponse("COMMISSION_ERROR", "Approval failed", 500);
  }
}
