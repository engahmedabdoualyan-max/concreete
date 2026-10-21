/**
 * /api/finance/depreciation/settings
 * GET  — إعدادات إهلاك الأصول على مستوى المنشأة (معدل التضخم الافتراضي…)
 * PUT  — تعديلها
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  getDepreciationSettings,
  updateDepreciationSettings,
} from "@/lib/services/depreciation.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const SettingsSchema = z.object({
  defaultInflationRatePct: z.number().min(0).max(100).optional(),
  defaultLifeYears: z.number().int().min(1).max(60).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_READ);
  if ("status" in auth) return auth;

  const row = await getDepreciationSettings(auth.user.tenantId);
  return successResponse({
    defaultInflationRatePct: String(row.defaultInflationRatePct),
    defaultLifeYears: row.defaultLifeYears,
  });
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

  const parsed = SettingsSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "بيانات غير صحيحة", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const row = await updateDepreciationSettings(auth.user.tenantId, auth.user.sub, parsed.data);
    return successResponse(
      {
        defaultInflationRatePct: String(row.defaultInflationRatePct),
        defaultLifeYears: row.defaultLifeYears,
      },
      "تم حفظ الإعدادات"
    );
  } catch (err) {
    console.error("[PUT /api/finance/depreciation/settings]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("DEPRECIATION_ERROR", message, 500);
  }
}
