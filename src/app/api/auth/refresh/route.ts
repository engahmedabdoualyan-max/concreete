/**
 * POST /api/auth/refresh
 * Issues a new access token using a valid refresh token.
 * Implements refresh token rotation (old session revoked, new one created).
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { users, userSessions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { verifyRefreshToken, issueTokenPair, AuthError } from "@/lib/auth/jwt";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { z } from "zod";

export const dynamic = "force-dynamic";

const RefreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = RefreshSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Missing refresh token", 400);
  }

  let payload;
  try {
    payload = verifyRefreshToken(parsed.data.refreshToken);
  } catch (err) {
    if (err instanceof AuthError) {
      return errorResponse(err.code, err.message, 401);
    }
    return errorResponse("TOKEN_INVALID", "Refresh token is invalid", 401);
  }

  // Check session is not revoked
  const sessionRows = await db
    .select()
    .from(userSessions)
    .where(
      and(eq(userSessions.jti, payload.jti), eq(userSessions.userId, payload.sub))
    )
    .limit(1);

  if (sessionRows.length === 0 || sessionRows[0].isRevoked) {
    return errorResponse("TOKEN_REVOKED", "Session is invalid or has been revoked", 401);
  }

  // Fetch current user data
  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);

  if (userRows.length === 0 || !userRows[0].isActive) {
    return errorResponse("ACCOUNT_DISABLED", "Account not found or disabled", 403);
  }

  const user = userRows[0];

  // Rotate: revoke old session
  await db
    .update(userSessions)
    .set({ isRevoked: true })
    .where(eq(userSessions.jti, payload.jti));

  // Issue new token pair
  const newTokenPair = issueTokenPair({
    sub: user.id,
    tenantId: user.tenantId,
    employeeCode: user.employeeCode,
    fullName: user.fullName,
    role: user.role,
    permissions: (user.permissions as string[]) ?? [],
    zone: user.zone ?? undefined,
  });

  // Persist new session
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  await db.insert(userSessions).values({
    userId: user.id,
    tenantId: user.tenantId,
    jti: newTokenPair.jti,
    deviceInfo: {
      platform: sessionRows[0].deviceInfo
        ? (sessionRows[0].deviceInfo as { platform: string }).platform
        : "unknown",
      appVersion: "rotated",
      deviceId: "rotated",
      ip,
    },
    isRevoked: false,
    expiresAt: newTokenPair.refreshExpiresAt,
  });

  return successResponse(
    {
      accessToken: newTokenPair.accessToken,
      refreshToken: newTokenPair.refreshToken,
      expiresAt: newTokenPair.accessExpiresAt.toISOString(),
    },
    "Token refreshed successfully"
  );
}
