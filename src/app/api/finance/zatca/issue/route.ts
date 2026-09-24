/**
 * ============================================================
 *  POST /api/finance/zatca/issue — Issue a Phase-2 e-invoice
 * ============================================================
 *  Body: { orderId, type?: "STANDARD" | "SIMPLIFIED" }
 *  Builds UBL from the order, chains hash+counter, mints TLV QR,
 *  then clears (B2B) or reports (B2C) via Fatoora when tokens
 *  exist — otherwise stores as PENDING for later submission.
 *  RBAC: FINANCE_INVOICE_MANAGE
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { issueInvoice } from "@/lib/services/zatca.service";
import { checkNextRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const IssueSchema = z.object({
  orderId: z.string().uuid(),
  type: z.enum(["STANDARD", "SIMPLIFIED"]).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_INVOICE_MANAGE);
  if ("status" in auth) return auth;
  const rate = checkNextRateLimit(
    `zatca-issue:${auth.user.tenantId}:${clientIpFromHeaders(req.headers)}`,
    10
  );
  if (!rate.allowed) {
    return errorResponse("RATE_LIMITED", "Too many ZATCA invoice requests", 429, {
      retryAfterSeconds: rate.retryAfterSeconds,
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = IssueSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "orderId is required", 400);
  }

  try {
    const doc = await issueInvoice(
      auth.user.tenantId,
      auth.user.sub,
      parsed.data.orderId,
      parsed.data.type ?? "STANDARD"
    );
    return successResponse(doc, doc.message ?? "E-invoice issued", 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Issue failed";
    return errorResponse("ZATCA_ISSUE_FAILED", message, 422);
  }
}
