/**
 * ============================================================
 *  POST /api/push/register — Store the caller's Expo push token
 *  Body: { token: "ExponentPushToken[...]" }
 * ============================================================
 *  RBAC: any authenticated user (own token only)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requireAuth, errorResponse, successResponse } from "@/lib/auth/middleware";
import { registerPushToken } from "@/lib/services/push.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const RegisterSchema = z.object({
  token: z.string().min(20).max(255),
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

  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid token payload", 400);
  }

  try {
    const ok = await registerPushToken(
      auth.user.tenantId,
      auth.user.sub,
      parsed.data.token
    );
    if (!ok) return errorResponse("INVALID_PUSH_TOKEN", "Not an Expo push token", 400);
    return successResponse({ registered: true }, "Push token registered");
  } catch (err) {
    console.error("[POST /api/push/register]", err);
    return errorResponse("PUSH_ERROR", "Registration failed", 500);
  }
}
