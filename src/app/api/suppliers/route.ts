/**
 * /api/suppliers
 * GET  — list suppliers (+ summary)
 * POST — create a supplier
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { listSuppliers, createSupplier, supplierSummary } from "@/lib/services/suppliers.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CreateSupplierSchema = z.object({
  name: z.string().min(2, "اسم المورد مطلوب"),
  contactPerson: z.string().optional().nullable(),
  phone: z.string().min(5, "رقم الهاتف مطلوب"),
  email: z.string().email("بريد غير صحيح").optional().nullable(),
  vatNumber: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_READ);
  if ("status" in auth) return auth;

  try {
    const [suppliers, summary] = await Promise.all([
      listSuppliers(auth.user.tenantId),
      supplierSummary(auth.user.tenantId),
    ]);
    return successResponse({ suppliers, summary });
  } catch (err) {
    console.error("[GET /api/suppliers]", err);
    return errorResponse("SUPPLIERS_FETCH_ERROR", "Failed to load suppliers", 500);
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

  const parsed = CreateSupplierSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid supplier data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const supplier = await createSupplier(auth.user.tenantId, auth.user.sub, parsed.data);
    return successResponse({ supplier }, "تم إضافة المورد");
  } catch (err) {
    console.error("[POST /api/suppliers]", err);
    return errorResponse("SUPPLIER_CREATE_ERROR", "Failed to create supplier", 500);
  }
}
