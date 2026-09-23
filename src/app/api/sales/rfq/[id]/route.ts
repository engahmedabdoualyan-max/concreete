/**
 * ============================================================
 *  GET    /api/sales/rfq/[id]  — Quotation + items
 *  PUT    /api/sales/rfq/[id]  — Status machine / edit draft
 *  DELETE /api/sales/rfq/[id]  — Delete DRAFT only
 * ============================================================
 *  Body for PUT: { action: SUBMIT|MARK_COSTED|APPROVE|REJECT,
 *                  rejectionReason? } OR draft edits { notes?, validUntil? }
 *  RBAC: ORDER_CREATE (SUBMIT/COST/edit) · RFQ_APPROVE (APPROVE/REJECT)
 * ============================================================
 */

import { NextRequest } from "next/server";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { getRfq, deleteRfq, transitionRfq } from "@/lib/services/rfq.service";
import { db } from "@/db";
import { rfqs } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function badId() {
  return errorResponse("INVALID_RFQ_ID", "RFQ ID must be a valid UUID", 400);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.ORDER_CREATE);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return badId();

  try {
    const rfq = await getRfq(auth.user.tenantId, id);
    if (!rfq) return errorResponse("RFQ_NOT_FOUND", "Quotation not found", 404);
    return successResponse(rfq, "Quotation");
  } catch (err) {
    console.error("[GET /api/sales/rfq/:id]", err);
    return errorResponse("RFQ_ERROR", "Failed to load quotation", 500);
  }
}

const PutSchema = z.object({
  action: z.enum(["SUBMIT", "MARK_COSTED", "APPROVE", "REJECT"]).optional(),
  rejectionReason: z.string().max(1000).optional(),
  notes: z.string().max(2000).optional(),
  validUntil: z.string().min(1).optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return badId();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid RFQ payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const needsApproval =
    parsed.data.action === "APPROVE" || parsed.data.action === "REJECT";
  const auth = await requirePermission(
    req,
    needsApproval ? PERMISSIONS.RFQ_APPROVE : PERMISSIONS.ORDER_CREATE
  );
  if ("status" in auth) return auth;

  try {
    if (parsed.data.action) {
      const res = await transitionRfq(
        auth.user.tenantId,
        auth.user.sub,
        id,
        parsed.data.action,
        parsed.data.rejectionReason
      );
      if (!res.ok) return errorResponse("RFQ_TRANSITION_BLOCKED", res.error, 409);
      return successResponse(res.rfq, `Quotation ${res.rfq.status}`);
    }

    // Draft edits
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes;
    if (parsed.data.validUntil !== undefined)
      patch.validUntil = new Date(parsed.data.validUntil);
    const [updated] = await db
      .update(rfqs)
      .set(patch)
      .where(
        and(
          eq(rfqs.id, id),
          eq(rfqs.tenantId, auth.user.tenantId),
          eq(rfqs.status, "DRAFT")
        )
      )
      .returning();
    if (!updated)
      return errorResponse("RFQ_EDIT_BLOCKED", "Only DRAFT quotes are editable", 409);
    return successResponse(updated, "Quotation updated");
  } catch (err) {
    console.error("[PUT /api/sales/rfq/:id]", err);
    return errorResponse("RFQ_ERROR", "Failed to update quotation", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.ORDER_CREATE);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return badId();

  try {
    const ok = await deleteRfq(auth.user.tenantId, id);
    if (!ok)
      return errorResponse("RFQ_DELETE_BLOCKED", "Only DRAFT quotes can be deleted", 409);
    return successResponse({ id }, "Quotation deleted");
  } catch (err) {
    console.error("[DELETE /api/sales/rfq/:id]", err);
    return errorResponse("RFQ_ERROR", "Failed to delete quotation", 500);
  }
}
