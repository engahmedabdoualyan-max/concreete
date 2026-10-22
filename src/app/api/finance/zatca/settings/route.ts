/**
 * ============================================================
 *  /api/finance/zatca/settings — ZATCA Settings (Password Protected)
 * ============================================================
 *  GET    → Get ZATCA settings (masked secrets)
 *  PUT    → Update settings (requires password: 01001006627)
 *  POST   → Test connection
 *  DELETE → Reset/clear settings (requires password)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { tenantZatcaSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

const ZATCA_SETTINGS_PASSWORD = "01001006627";

const UpdateSettingsSchema = z.object({
  sellerName: z.string().min(2).max(200).optional(),
  vatNumber: z.string().min(10).max(30).optional(),
  street: z.string().max(200).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  branchName: z.string().max(100).optional().nullable(),
  buildingNumber: z.string().max(20).optional().nullable(),
  additionalNumber: z.string().max(20).optional().nullable(),
  district: z.string().max(100).optional().nullable(),
  zipCode: z.string().max(10).optional().nullable(),
  env: z.enum(["sandbox", "simulation", "production"]).optional(),
  binaryToken: z.string().optional().nullable(),
  secret: z.string().optional().nullable(),
  password: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_READ);
  if ("status" in auth) return auth;

  try {
    const [settings] = await db
      .select()
      .from(tenantZatcaSettings)
      .where(eq(tenantZatcaSettings.tenantId, auth.user.tenantId))
      .limit(1);

    if (!settings) {
      return successResponse({
        configured: false,
        sellerName: "",
        vatNumber: "",
        street: "",
        city: "",
        branchName: "",
        buildingNumber: "",
        additionalNumber: "",
        district: "",
        zipCode: "",
        env: "sandbox",
        binaryToken: "",
        secret: "",
      });
    }

    // Mask sensitive fields
    return successResponse({
      ...settings,
      binaryToken: settings.binaryToken ? "••••••••" : "",
      secret: settings.secret ? "••••••••" : "",
    });
  } catch (err) {
    console.error("[GET /api/finance/zatca/settings]", err);
    return errorResponse("ZATCA_SETTINGS_ERROR", "Failed to load ZATCA settings", 500);
  }
}


export async function PUT(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_CLIENT_UPDATE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = UpdateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid settings data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  // Verify password
  if (parsed.data.password !== "01001006627") {
    return errorResponse("INVALID_PASSWORD", "كلمة مرور خاطئة لإعدادات زاتكا", 403);
  }

  // Remove password from payload
  const { password, ...payload } = parsed.data;

  // Verify seller name and VAT number are provided if configuring
  if (payload.env === "production" && (!payload.sellerName?.trim() || !payload.vatNumber?.trim())) {
    return errorResponse("VALIDATION_ERROR", "Seller name and VAT number are required for production environment", 400);
  }

  try {
    const existing = await db
      .select()
      .from(tenantZatcaSettings)
      .where(eq(tenantZatcaSettings.tenantId, auth.user.tenantId))
      .limit(1);

    let result;
    if (existing.length > 0) {
      // Update existing
      const [updated] = await db
        .update(tenantZatcaSettings)
        .set({
          ...payload,
          binaryTokenUpdatedAt: payload.binaryToken !== undefined ? new Date() : undefined,
          secretUpdatedAt: payload.secret !== undefined ? new Date() : undefined,
          updatedAt: new Date(),
        })
        .where(eq(tenantZatcaSettings.tenantId, auth.user.tenantId))
        .returning();
      result = updated;
    } else {
      const [created] = await db
        .insert(tenantZatcaSettings)
        .values({
          tenantId: auth.user.tenantId,
          sellerName: payload.sellerName ?? "",
          vatNumber: payload.vatNumber ?? "",
          street: payload.street ?? null,
          city: payload.city ?? null,
          branchName: payload.branchName ?? null,
          buildingNumber: payload.buildingNumber ?? null,
          additionalNumber: payload.additionalNumber ?? null,
          district: payload.district ?? null,
          zipCode: payload.zipCode ?? null,
          env: payload.env ?? "sandbox",
          binaryToken: payload.binaryToken ?? null,
          secret: payload.secret ?? null,
        })
        .returning();
      result = created;
    }

    return successResponse(
      { ...result, binaryToken: result.binaryToken ? "••••••••" : "", secret: result.secret ? "••••••••" : "" },
      "تم حفظ إعدادات زاتكا بنجاح"
    );
  } catch (err) {
    console.error("[PUT /api/finance/zatca/settings]", err);
    return errorResponse("ZATCA_SETTINGS_ERROR", "Failed to save ZATCA settings", 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_CLIENT_UPDATE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = z.object({ password: z.string().min(1) }).safeParse(body);
  if (!parsed.success || parsed.data.password !== "01001006627") {
    return errorResponse("INVALID_PASSWORD", "كلمة مرور خاطئة لاختبار الاتصال", 403);
  }

  try {
    const [settings] = await db
      .select()
      .from(tenantZatcaSettings)
      .where(eq(tenantZatcaSettings.tenantId, auth.user.tenantId))
      .limit(1);

    if (!settings || !settings.configured) {
      return errorResponse("ZATCA_NOT_CONFIGURED", "ZATCA not configured", 400);
    }

    // Test connection by calling the test endpoint
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/finance/zatca/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.INTERNAL_API_TOKEN || ''}` },
    }).catch(() => null);

    const result = res ? await res.json().catch(() => ({ ok: false, message: 'Test request failed' })) : { ok: false, message: 'Test request failed' };

    if (res?.ok && result.ok) {
      // Update last tested timestamp
      await db
        .update(tenantZatcaSettings)
        .set({ lastTestedAt: new Date(), lastTestResult: result, updatedAt: new Date() })
        .where(eq(tenantZatcaSettings.tenantId, auth.user.tenantId));

      return successResponse(result, "✅ " + (result.message || "Connection test successful"));
    } else {
      return errorResponse("ZATCA_TEST_FAILED", result.message || "Connection test failed", 400);
    }
  } catch (err) {
    console.error("[POST /api/finance/zatca/settings]", err);
    return errorResponse("ZATCA_TEST_ERROR", "Connection test failed", 500);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_CLIENT_UPDATE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = z.object({ password: z.string().min(1) }).safeParse(body);
  if (!parsed.success || parsed.data.password !== "01001006627") {
    return errorResponse("INVALID_PASSWORD", "كلمة مرور خاطئة لحذف الإعدادات", 403);
  }

  try {
    await db
      .delete(tenantZatcaSettings)
      .where(eq(tenantZatcaSettings.tenantId, auth.user.tenantId));

    return successResponse(null, "تم حذف إعدادات زاتكا بنجاح");
  } catch (err) {
    console.error("[DELETE /api/finance/zatca/settings]", err);
    return errorResponse("ZATCA_DELETE_ERROR", "Failed to delete ZATCA settings", 500);
  }
}