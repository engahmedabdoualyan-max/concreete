/**
 * /api/finance/depreciation/:id
 * PUT    — تعديل أصل (التكلفة/المعدل/القيمة التخلصية) أو تفعيل/إيقافه
 * DELETE — حذف أصل لم يُهلك بعد (الأصول ذات القيود تُوقف تفعيلها حفاظاً على التاريخ)
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  updateDepreciationAsset,
  deleteDepreciationAsset,
  DepreciationAssetNotFoundError,
  DepreciationAssetHasEntriesError,
} from "@/lib/services/depreciation.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const UpdateAssetSchema = z.object({
  purchaseCostSar: z.number().int().positive("سعر الشراء يجب أن يكون موجباً").optional(),
  purchaseDate: z.string().nullable().optional(),
  annualRatePct: z.number().positive().max(100, "المعدل لا يتجاوز 100%").optional(),
  salvageValueSar: z.number().int().min(0).optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_CLIENT_UPDATE);
  if ("status" in auth) return auth;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = UpdateAssetSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "بيانات غير صحيحة", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const d = parsed.data;
  try {
    const row = await updateDepreciationAsset(auth.user.tenantId, id, {
      purchaseCostSar: d.purchaseCostSar,
      purchaseDate: d.purchaseDate === undefined ? undefined : d.purchaseDate ? new Date(d.purchaseDate) : null,
      annualRatePct: d.annualRatePct,
      salvageValueSar: d.salvageValueSar,
      notes: d.notes,
      isActive: d.isActive,
    });
    return successResponse(row, "تم تعديل الأصل");
  } catch (err) {
    if (err instanceof DepreciationAssetNotFoundError) {
      return errorResponse("NOT_FOUND", err.message, 404);
    }
    console.error("[PUT /api/finance/depreciation/:id]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("DEPRECIATION_ERROR", message, 500);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_CLIENT_UPDATE);
  if ("status" in auth) return auth;
  const { id } = await params;

  try {
    await deleteDepreciationAsset(auth.user.tenantId, id);
    return successResponse({ id }, "تم حذف الأصل");
  } catch (err) {
    if (err instanceof DepreciationAssetNotFoundError) {
      return errorResponse("NOT_FOUND", err.message, 404);
    }
    if (err instanceof DepreciationAssetHasEntriesError) {
      // has posted entries — an account-history question, not a bug
      return errorResponse("ASSET_HAS_ENTRIES", err.message, 409);
    }
    console.error("[DELETE /api/finance/depreciation/:id]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("DEPRECIATION_ERROR", message, 500);
  }
}
