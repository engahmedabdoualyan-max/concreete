/**
 * /api/suppliers/purchase-orders
 * GET  — list purchase orders (+ items, payments, balances)
 * POST — create a purchase order with line items
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { listPurchaseOrders, createPurchaseOrder } from "@/lib/services/suppliers.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const ItemSchema = z.object({
  siloId: z.string().uuid().optional().nullable(),
  materialCategory: z.string().min(2),
  materialName: z.string().min(1),
  quantityKg: z.number().positive(),
  ratePerKgSar: z.number().int().nonnegative(),
});

const CreatePOSchema = z.object({
  supplierId: z.string().uuid("Invalid supplier"),
  purchaseDate: z.string().min(1),
  dueDate: z.string().optional().nullable(),
  vatPercent: z.number().int().min(0).max(100).optional(),
  transportCostSar: z.number().int().nonnegative().optional(),
  notes: z.string().optional().nullable(),
  items: z.array(ItemSchema).min(1, "أمر الشراء يتطلب عنصراً واحداً على الأقل"),
});

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_READ);
  if ("status" in auth) return auth;

  try {
    const purchaseOrders = await listPurchaseOrders(auth.user.tenantId);
    return successResponse({ purchaseOrders });
  } catch (err) {
    console.error("[GET /api/suppliers/purchase-orders]", err);
    return errorResponse("PO_FETCH_ERROR", "Failed to load purchase orders", 500);
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

  const parsed = CreatePOSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid purchase order", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const d = parsed.data;
  try {
    const result = await createPurchaseOrder(auth.user.tenantId, auth.user.sub, {
      supplierId: d.supplierId,
      purchaseDate: new Date(d.purchaseDate),
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
      vatPercent: d.vatPercent,
      transportCostSar: d.transportCostSar,
      notes: d.notes ?? null,
      items: d.items.map((i) => ({
        siloId: i.siloId ?? null,
        materialCategory: i.materialCategory,
        materialName: i.materialName,
        quantityKg: i.quantityKg,
        ratePerKgSar: i.ratePerKgSar,
      })),
    });
    return successResponse(result, `تم إنشاء أمر الشراء ${result.po.poNumber}`);
  } catch (err) {
    console.error("[POST /api/suppliers/purchase-orders]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("PO_CREATE_ERROR", message, 500);
  }
}
