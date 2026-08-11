/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/users — User Management (admin panel)
 * ============================================================
 *
 *  ENDPOINTS:
 *  GET  /api/users                     — List users (filter: ?role=, ?isActive=, ?tenantCode=)
 *  POST /api/users                     — Create a new user
 * ============================================================
 *
 *  Access: SUPER_ADMIN manages any tenant; other roles only their own tenant.
 *  Creating users in another tenant requires the caller to be SUPER_ADMIN.
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { users, tenants } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { normalizePhone } from "@/lib/auth/phone";
import { z } from "zod";
import bcrypt from "bcryptjs";

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

const CreateUserSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(8, "Phone number is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(USER_ROLES as never),
  employeeCode: z.string().min(2).optional(),
  zone: z.string().max(100).optional(),
  /** SUPER_ADMIN only — create the user inside a different tenant */
  tenantCode: z.string().max(40).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.USER_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const roleFilter = url.searchParams.get("role");
  const activeFilter = url.searchParams.get("isActive");
  const tenantCodeFilter = url.searchParams.get("tenantCode");
  const search = url.searchParams.get("q");

  let tenantScope: string | null = auth.user.tenantId;
  if (auth.user.role === "SUPER_ADMIN") {
    if (tenantCodeFilter) {
      const ten = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.tenantCode, tenantCodeFilter))
        .limit(1);
      if (ten.length === 0) {
        return errorResponse("TENANT_NOT_FOUND", "Unknown tenant code.");
      }
      tenantScope = ten[0].id;
    } else {
      tenantScope = null; // SUPER_ADMIN sees all tenants by default
    }
  }

  const conditions = [];
  if (tenantScope) conditions.push(eq(users.tenantId, tenantScope));
  if (roleFilter) conditions.push(eq(users.role, roleFilter as never));

  const rows = await db
    .select({
      id: users.id,
      tenantId: users.tenantId,
      tenantCode: tenants.tenantCode,
      tenantName: tenants.companyName,
      employeeCode: users.employeeCode,
      fullName: users.fullName,
      email: users.email,
      phoneNumber: users.phoneNumber,
      role: users.role,
      zone: users.zone,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .innerJoin(tenants, eq(users.tenantId, tenants.id))
    .where(conditions.length ? and(...(conditions as never[])) : undefined)
    .orderBy(desc(users.createdAt));

  let result = rows;
  if (search) {
    const q = search.toLowerCase();
    result = rows.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.phoneNumber ?? "").includes(q) ||
        r.employeeCode.toLowerCase().includes(q)
    );
  }
  if (activeFilter !== null) {
    const wantActive = activeFilter === "true";
    result = result.filter((r) => r.isActive === wantActive);
  }

  return successResponse({ users: result, total: result.length });
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.USER_CREATE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON.");
  }

  const parsed = CreateUserSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid user data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { fullName, email, phone, password, role, employeeCode, zone, tenantCode } =
    parsed.data;

  // Tenant resolution
  let targetTenantId = auth.user.tenantId;
  if (tenantCode) {
    if (auth.user.role !== "SUPER_ADMIN") {
      return errorResponse(
        "INSUFFICIENT_ROLE",
        "Only SUPER_ADMIN can create users in another tenant.",
        403
      );
    }
    const ten = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.tenantCode, tenantCode))
      .limit(1);
    if (ten.length === 0) {
      return errorResponse("TENANT_NOT_FOUND", "Unknown tenant code.");
    }
    targetTenantId = ten[0].id;
  }

  // Employee code
  let finalCode = employeeCode?.trim().toUpperCase();
  if (!finalCode) {
    const seq = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.tenantId, targetTenantId));
    finalCode = `EMP-${String((seq[0]?.n ?? 0) + 1).padStart(3, "0")}`;
  }

  const phoneNormalized = normalizePhone(phone);
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const [created] = await db
      .insert(users)
      .values({
        tenantId: targetTenantId,
        employeeCode: finalCode,
        fullName: fullName.trim(),
        email: email.toLowerCase().trim(),
        phoneNumber: phoneNormalized,
        passwordHash,
        role: role as never,
        zone: zone?.trim() ?? null,
        isActive: true,
      })
      .returning({
        id: users.id,
        employeeCode: users.employeeCode,
        fullName: users.fullName,
        email: users.email,
        phoneNumber: users.phoneNumber,
        role: users.role,
        zone: users.zone,
      });

    return successResponse({ user: created }, "User created successfully", 201);
  } catch (err) {
    const e = err as { code?: string; constraint?: string };
    if (e.code === "23505") {
      return errorResponse(
        "CONFLICT",
        "A user with this employee code, email, or phone already exists.",
        409
      );
    }
    return errorResponse("SERVER_ERROR", "Failed to create user: " + (e as Error).message, 500);
  }
}
