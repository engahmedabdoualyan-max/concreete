/**
 * ============================================================
 *  POST /api/portal/share  — Issue a magic link (ORDER or CLIENT)
 *  GET  /api/portal/share  — List issued links (management)
 * ============================================================
 *  Body: { scope: "ORDER"|"CLIENT", orderId?, clientId?,
 *          expiresInDays? (1–365, default 30), label? }
 *  RBAC: ORDER_READ or FINANCE_READ
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requireAnyPermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  createShareToken,
  listShareTokens,
} from "@/lib/services/portal.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const ShareSchema = z.object({
  scope: z.enum(["ORDER", "CLIENT"]),
  orderId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
  label: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAnyPermission(req, [
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.FINANCE_READ,
  ]);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = ShareSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid share payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const issued = await createShareToken(
      auth.user.tenantId,
      auth.user.sub,
      parsed.data
    );
    if (!issued)
      return errorResponse(
        "SHARE_TARGET_NOT_FOUND",
        "Order or client not found in your tenant",
        404
      );
    return successResponse(
      {
        token: issued.token,
        link: issued.link,
        scope: issued.scope,
        expiresAt: issued.expiresAt,
      },
      "Share link issued",
      201
    );
  } catch (err) {
    console.error("[POST /api/portal/share]", err);
    return errorResponse("PORTAL_SHARE_ERROR", "Failed to issue share link", 500);
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAnyPermission(req, [
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.FINANCE_READ,
  ]);
  if ("status" in auth) return auth;

  try {
    const tokens = await listShareTokens(auth.user.tenantId);
    return successResponse({ tokens }, `${tokens.length} share link(s)`);
  } catch (err) {
    console.error("[GET /api/portal/share]", err);
    return errorResponse("PORTAL_SHARE_ERROR", "Failed to list share links", 500);
  }
}
