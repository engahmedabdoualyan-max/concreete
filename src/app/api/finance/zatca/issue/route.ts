/**
 * ============================================================
 *  POST /api/finance/zatca/issue — Issue a Phase-2 e-invoice
 * ============================================================
 *  Body: { orderId, type?: "STANDARD" | "SIMPLIFIED", idempotencyKey?: string }
 *  Builds the legacy UBL fallback, chains hash+counter, submits through Fatoora,
 *  and stores the returned QR/artifact. This route is not a certification
 *  engine until the external EGS/SDK boundary is connected.
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
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
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

  const headerKey = req.headers.get("idempotency-key")?.trim() || null;
  const bodyKey = parsed.data.idempotencyKey ?? null;
  if (headerKey && bodyKey && headerKey !== bodyKey) {
    return errorResponse(
      "IDEMPOTENCY_KEY_MISMATCH",
      "Idempotency-Key header and body value must match",
      400
    );
  }
  if (headerKey && (headerKey.length < 8 || headerKey.length > 200)) {
    return errorResponse("INVALID_IDEMPOTENCY_KEY", "Idempotency-Key must be 8-200 characters", 400);
  }
  const idempotencyKey = headerKey ?? bodyKey ?? undefined;

  try {
    const doc = await issueInvoice(
      auth.user.tenantId,
      auth.user.sub,
      parsed.data.orderId,
      parsed.data.type ?? "STANDARD",
      idempotencyKey
    );
    const status = doc.status === "CLEARED" || doc.status === "REPORTED"
      ? 201
      : doc.status === "PENDING"
        ? 202
        : 422;
    const safeDoc = { ...doc } as Record<string, unknown>;
    delete safeDoc.fatooraResponse;
    return successResponse(safeDoc, doc.message ?? "E-invoice issued", status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Issue failed";
    return errorResponse("ZATCA_ISSUE_FAILED", message, 422);
  }
}
