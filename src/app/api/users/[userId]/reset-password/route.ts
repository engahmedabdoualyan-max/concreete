/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/users/:userId/reset-password
 *  Force a new password for a user (admin reset).
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { z } from "zod";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

const ResetPasswordSchema = z.object({
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ userId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.USER_UPDATE);
  if ("status" in auth) return auth;

  const { userId } = await ctx.params;

  const existing = await db
    .select({ id: users.id, tenantId: users.tenantId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (existing.length === 0) {
    return errorResponse("USER_NOT_FOUND", "User not found.", 404);
  }
  if (auth.user.role !== "SUPER_ADMIN" && auth.user.tenantId !== existing[0].tenantId) {
    return errorResponse("INSUFFICIENT_ROLE", "You cannot manage users in another tenant.", 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON.", 400);
  }

  const parsed = ResetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid password", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return successResponse({ id: userId }, "Password reset successfully");
}
