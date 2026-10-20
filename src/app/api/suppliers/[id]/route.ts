/**
 * /api/suppliers/:id
 * GET — one supplier (read register or finance).
 * PUT — edit a supplier in place: contact details, VAT, السجل التجاري، شروط
 *       الدفع، الآيبان، and `isActive` (soft retire — keeps the PO history).
 *
 * Both paths accept the legacy finance key or the narrow supplier key, so
 * مدير المشتروات can maintain the register without being given the ledger.
 */

import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { requireAnyPermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { updateSupplier, SupplierNotFoundError } from "@/lib/services/suppliers.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const UpdateSupplierSchema = z.object({
  name: z.string().min(2, "اسم المورد مطلوب").optional(),
  contactPerson: z.string().max(100).nullable().optional(),
  phone: z.string().min(5, "رقم الهاتف مطلوب").max(20).optional(),
  email: z.union([z.string().email("بريد غير صحيح"), z.literal("")]).nullable().optional(),
  vatNumber: z.string().max(20).nullable().optional(),
  crNumber: z.string().max(32).nullable().optional(),
  paymentTerms: z.string().max(120).nullable().optional(),
  bankIban: z.string().max(40).nullable().optional(),
  address: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireAnyPermission(req, [PERMISSIONS.FINANCE_READ, PERMISSIONS.SUPPLIER_READ]);
  if ("status" in auth) return auth;

  const { id } = await params;
  try {
    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, id), eq(suppliers.tenantId, auth.user.tenantId)));
    if (!supplier) return errorResponse("SUPPLIER_NOT_FOUND", "المورد غير موجود", 404);
    return successResponse({ supplier });
  } catch (err) {
    console.error("[GET /api/suppliers/:id]", err);
    return errorResponse("SUPPLIER_FETCH_ERROR", "Failed to load supplier", 500);
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireAnyPermission(req, [PERMISSIONS.FINANCE_CLIENT_UPDATE, PERMISSIONS.SUPPLIER_MANAGE]);
  if ("status" in auth) return auth;

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = UpdateSupplierSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid supplier data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const supplier = await updateSupplier(auth.user.tenantId, id, parsed.data);
    return successResponse({ supplier }, "تم تحديث بيانات المورد");
  } catch (err) {
    if (err instanceof SupplierNotFoundError) {
      return errorResponse("SUPPLIER_NOT_FOUND", err.message, 404);
    }
    console.error("[PUT /api/suppliers/:id]", err);
    return errorResponse("SUPPLIER_UPDATE_ERROR", "Failed to update supplier", 500);
  }
}
