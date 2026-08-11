/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/users/:userId — Single-user management
 * ============================================================
 *
 *  ENDPOINTS:
 *  PATCH  /api/users/:userId  — Update profile fields
 *  DELETE /api/users/:userId  — Deactivate (soft delete)
 *  POST   /api/users/:userId/reset-password  (see subfolder)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { normalizePhone } from "@/lib/auth/phone";
import { z } from "zod";

export const dynamic = "force-dynamic";

const USER_ROLES = [
  "SUPER_ADMIN",
  "PLANT_MGR",
  "ACCOUNTANT",
  "LAB_TECH",
  "BATCH_OPERATOR",
  "SALES_REP",
  "DRIVER",
  "FINANCE",
  "DISPATCHER",
  "WORKSHOP_MGR",
  "LAB_TECHNICIAN",
  "WORKSHOP_MECHANIC",
] as const;

const UpdateUserSchema = z.object({
  fullName: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(8).optional(),
  role: z.enum(USER_ROLES as never).optional(),
  zone: z.string().max(100).nullable().optional(),
  employeeCode: z.string().min(2).optional(),
  isActive: z.boolean().optional(),
});

type Params = { params: Promise<{ userId: string }> };

function isScopedToTenant(
  auth: { user: { tenantId: string; role: string } },
  targetTenantId: string
): boolean {
  return auth.user.role === "SUPER_ADMIN" || auth.user.tenantId === targetTenantId;
}

export async function PATCH(req: NextRequest, ctx: Params) {
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
  if (!isScopedToTenant(auth, existing[0].tenantId)) {
    return errorResponse("INSUFFICIENT_ROLE", "You cannot manage users in another tenant.", 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON.", 400);
  }

  const parsed = UpdateUserSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid user data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.fullName !== undefined) patch.fullName = parsed.data.fullName.trim();
  if (parsed.data.email !== undefined) patch.email = parsed.data.email.toLowerCase().trim();
  if (parsed.data.phone !== undefined) patch.phoneNumber = normalizePhone(parsed.data.phone);
  if (parsed.data.role !== undefined) {
    if (auth.user.role !== "SUPER_ADMIN") {
      return errorResponse("INSUFFICIENT_ROLE", "Only SUPER_ADMIN can change roles.", 403);
    }
    patch.role = parsed.data.role as never;
  }
  if (parsed.data.zone !== undefined) patch.zone = parsed.data.zone;
  if (parsed.data.employeeCode !== undefined) patch.employeeCode = parsed.data.employeeCode.trim().toUpperCase();
  if (parsed.data.isActive !== undefined) {
    if (auth.user.role !== "SUPER_ADMIN" && auth.user.role !== "PLANT_MGR") {
      return errorResponse("INSUFFICIENT_ROLE", "You cannot activate/deactivate users.", 403);
    }
    if (userId === auth.user.sub && !parsed.data.isActive) {
      return errorResponse("SELF_DEACTIVATE", "You cannot deactivate your own account.", 400);
    }
    patch.isActive = parsed.data.isActive;
  }

  if (Object.keys(patch).length === 0) {
    return errorResponse("EMPTY_UPDATE", "No fields to update.", 400);
  }
  patch.updatedAt = new Date();

  try {
    const [updated] = await db
      .update(users)
      .set(patch)
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        employeeCode: users.employeeCode,
        fullName: users.fullName,
        email: users.email,
        phoneNumber: users.phoneNumber,
        role: users.role,
        zone: users.zone,
        isActive: users.isActive,
      });
    return successResponse({ user: updated }, "User updated successfully");
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "23505") {
      return errorResponse("CONFLICT", "Email, phone, or employee code already in use.", 409);
    }
    return errorResponse("SERVER_ERROR", "Failed to update user: " + (e as Error).message, 500);
  }
}

export async function DELETE(req: NextRequest, ctx: Params) {
  const auth = await requirePermission(req, PERMISSIONS.USER_DELETE);
  if ("status" in auth) return auth;

  const { userId } = await ctx.params;

  if (userId === auth.user.sub) {
    return errorResponse("SELF_DELETE", "You cannot deactivate your own account.", 400);
  }

  const existing = await db
    .select({ id: users.id, tenantId: users.tenantId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (existing.length === 0) {
    return errorResponse("USER_NOT_FOUND", "User not found.", 404);
  }
  if (!isScopedToTenant(auth, existing[0].tenantId)) {
    return errorResponse("INSUFFICIENT_ROLE", "You cannot manage users in another tenant.", 403);
  }

  await db.update(users).set({ isActive: false, updatedAt: new Date() }).where(eq(users.id, userId));
  return successResponse({ id: userId, isActive: false }, "User deactivated successfully");
}
