/**
 * /api/suppliers
 * GET  — list suppliers (+ summary)
 * POST — create a supplier
 */

import { NextRequest } from "next/server";
import { requireAnyPermission, errorResponse, successResponse } from "@/lib/auth/middleware";
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
  /** السجل التجاري — supplier identity for the purchase contract */
  crNumber: z.string().max(32).optional().nullable(),
  /** شروط الدفع (مثال: 30 يوم · كاش) */
  paymentTerms: z.string().max(120).optional().nullable(),
  /** آيبان المورد — where the money actually goes */
  bankIban: z.string().max(40).optional().nullable(),
  /** مجال العمل (اسمنت، رمل، قطع غيار …) — أساس مقارنة الأسعار */
  category: z.string().max(60).optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  // Either key opens the register: FINANCE (unchanged) or the narrow supplier
  // read held by مدير المشتروات.
  const auth = await requireAnyPermission(req, [PERMISSIONS.FINANCE_READ, PERMISSIONS.SUPPLIER_READ]);
  if ("status" in auth) return auth;

  // ?includeInactive=1 → retired suppliers too, so a suspension can be undone
  // from the register (their purchase orders reference them either way).
  const includeInactive = new URL(req.url).searchParams.get("includeInactive") === "1";

  try {
    const [suppliers, summary] = await Promise.all([
      listSuppliers(auth.user.tenantId, includeInactive),
      supplierSummary(auth.user.tenantId),
    ]);
    return successResponse({ suppliers, summary });
  } catch (err) {
    console.error("[GET /api/suppliers]", err);
    return errorResponse("SUPPLIERS_FETCH_ERROR", "Failed to load suppliers", 500);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAnyPermission(req, [PERMISSIONS.FINANCE_CLIENT_UPDATE, PERMISSIONS.SUPPLIER_MANAGE]);
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
