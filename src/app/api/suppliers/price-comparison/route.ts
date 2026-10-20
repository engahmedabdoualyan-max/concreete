/**
 * /api/suppliers/price-comparison
 * GET — ذكاء الموردين: لكل مادة (أسمنت/رمل/…) موردوها مرتبون بالأولوية
 *       🥇 حسب آخر سعر + المتوسط المرجّح + نسبة الفرق عن أفضل سعر.
 *       ?materialCategory=CEMENT &supplierId=<uuid> &category=<مجال العمل>
 *
 * Derives purely from PO line items — no extra data entry.
 */

import { NextRequest } from "next/server";
import { requireAnyPermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { priceComparison } from "@/lib/services/supplier-insights.service";

export const dynamic = "force-dynamic";

const READ_GUARD = [PERMISSIONS.FINANCE_READ, PERMISSIONS.SUPPLIER_READ];

export async function GET(req: NextRequest) {
  const auth = await requireAnyPermission(req, READ_GUARD);
  if ("status" in auth) return auth;

  const sp = req.nextUrl.searchParams;
  try {
    const result = await priceComparison(auth.user.tenantId, {
      materialCategory: sp.get("materialCategory") || null,
      supplierId: sp.get("supplierId") || null,
      category: sp.get("category") || null,
    });
    return successResponse(result);
  } catch (err) {
    console.error("[GET /api/suppliers/price-comparison]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("PRICE_COMPARISON_ERROR", message, 500);
  }
}
