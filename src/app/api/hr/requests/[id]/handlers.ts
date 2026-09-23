/**
 * ============================================================
 *  POST /api/hr/requests/[id]/review — APPROVED | REJECTED
 *  POST /api/hr/requests/[id]/cancel — Withdraw own PENDING request
 * ============================================================
 *  Review RBAC: HR_WRITE · Cancel: owner only (service-enforced)
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
import { reviewRequest, cancelRequest } from "@/lib/services/hr-social.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function badId() {
  return errorResponse("INVALID_REQUEST_ID", "Request ID must be a valid UUID", 400);
}

const ReviewSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  reviewNote: z.string().max(500).optional(),
});

export async function reviewRoute(
  req: NextRequest,
  params: Promise<{ id: string }>
) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return badId();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = ReviewSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid review payload", 400);
  }

  try {
    const updated = await reviewRequest(
      auth.user.tenantId,
      auth.user.sub,
      id,
      parsed.data.decision,
      parsed.data.reviewNote
    );
    if (!updated)
      return errorResponse("REQUEST_NOT_FOUND", "Only PENDING requests can be reviewed", 409);
    return successResponse(updated, `Request ${updated.status}`);
  } catch (err) {
    console.error("[POST /api/hr/requests/:id/review]", err);
    return errorResponse("HR_ERROR", "Review failed", 500);
  }
}

export async function cancelRoute(
  req: NextRequest,
  params: Promise<{ id: string }>
) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return badId();

  try {
    const ok = await cancelRequest(auth.user.tenantId, auth.user.sub, id);
    if (!ok)
      return errorResponse("REQUEST_NOT_FOUND", "Only your PENDING requests can be withdrawn", 409);
    return successResponse({ id }, "Request withdrawn");
  } catch (err) {
    console.error("[POST /api/hr/requests/:id/cancel]", err);
    return errorResponse("HR_ERROR", "Withdraw failed", 500);
  }
}
