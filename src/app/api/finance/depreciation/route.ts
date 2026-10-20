/**
 * /api/finance/depreciation
 * GET  — قسم «اهلاك معدات»: الأصول + الحسابات (الإهلاك الشهري/المُتراكم/
 *        القيمة الدفترية) + خيارات المركبات والمعدات (?period=YYYY-MM)
 * POST — إضافة أصل إهلاك (مركبة أو معدة) بمعدل سنوي
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  listDepreciation,
  createDepreciationAsset,
  DepreciationAssetExistsError,
} from "@/lib/services/depreciation.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CreateAssetSchema = z.object({
  source: z.enum(["vehicle", "equipment"]),
  vehicleId: z.string().uuid("Invalid vehicle").optional().nullable(),
  equipmentId: z.string().uuid("Invalid equipment").optional().nullable(),
  /** SAR cents */
  purchaseCostSar: z.number().int().positive("سعر الشراء يجب أن يكون موجباً"),
  purchaseDate: z.string().optional().nullable(),
  /** 25 = 25% سنوياً (خطي) */
  annualRatePct: z.number().positive("المعدل يجب أن يكون موجباً").max(100, "المعدل لا يتجاوز 100%"),
  salvageValueSar: z.number().int().min(0).optional(),
  notes: z.string().optional().nullable(),
});

/** ?period=YYYY-MM — any date inside the month works; defaults to current. */
function parsePeriod(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_READ);
  if ("status" in auth) return auth;

  const period = parsePeriod(req.nextUrl.searchParams.get("period"));
  const result = await listDepreciation(auth.user.tenantId, { period });
  return successResponse(result);
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

  const parsed = CreateAssetSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "بيانات الأصل غير صحيحة", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const d = parsed.data;
  if (d.source === "vehicle" && !d.vehicleId) {
    return errorResponse("VALIDATION_ERROR", "اختر المركبة", 400);
  }
  if (d.source === "equipment" && !d.equipmentId) {
    return errorResponse("VALIDATION_ERROR", "اختر المعدة", 400);
  }

  try {
    const row = await createDepreciationAsset(auth.user.tenantId, auth.user.sub, {
      source: d.source,
      vehicleId: d.vehicleId ?? null,
      equipmentId: d.equipmentId ?? null,
      purchaseCostSar: d.purchaseCostSar,
      purchaseDate: d.purchaseDate ? new Date(d.purchaseDate) : null,
      annualRatePct: d.annualRatePct,
      salvageValueSar: d.salvageValueSar ?? 0,
      notes: d.notes ?? null,
    });
    return successResponse(row, "تمت إضافة الأصل");
  } catch (err) {
    if (err instanceof DepreciationAssetExistsError) {
      return errorResponse("ASSET_EXISTS", err.message, 409);
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[POST /api/finance/depreciation]", err);
    return errorResponse("DEPRECIATION_ERROR", message, 500);
  }
}
