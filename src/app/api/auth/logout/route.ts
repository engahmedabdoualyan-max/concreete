/**
 * POST /api/auth/logout
 * Revokes the current session (marks JTI as revoked in DB)
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { userSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  await db
    .update(userSessions)
    .set({ isRevoked: true })
    .where(eq(userSessions.jti, auth.user.jti));

  return successResponse(null, "Logged out successfully");
}
