/**
 * ============================================================
 *  GET  /api/hr/requests[?status=&type=]  — All requests (HR desk)
 *  POST /api/hr/requests                  — File a request (any staff)
 * ============================================================
 *  Body: { type: LEAVE|ADVANCE|SALARY_CONFIRM|OTHER,
 *          startDate?, endDate?, amountSar?, referenceId?, reason? }
 *  RBAC: HR_READ (GET) · any authenticated user (POST, own scope)
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
import { listAllRequests, createRequest } from "@/lib/services/hr-social.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  try {
    const rows = await listAllRequests(
      auth.user.tenantId,
      url.searchParams.get("status") ?? undefined,
      url.searchParams.get("type") ?? undefined
    );
    return successResponse({ requests: rows }, `${rows.length} request(s)`);
  } catch (err) {
    console.error("[GET /api/hr/requests]", err);
    return errorResponse("HR_ERROR", "Failed to load requests", 500);
  }
}

const CreateRequestSchema = z.object({
  type: z.enum(["LEAVE", "ADVANCE", "SALARY_CONFIRM", "OTHER"]),
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
  amountSar: z.number().nonnegative().optional(),
  referenceId: z.string().max(64).optional(),
  reason: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = CreateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid request payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const created = await createRequest(auth.user.tenantId, auth.user.sub, parsed.data);
    return successResponse(created, "Request sent to HR", 201);
  } catch (err) {
    console.error("[POST /api/hr/requests]", err);
    return errorResponse("HR_ERROR", "Failed to file request", 500);
  }
}
