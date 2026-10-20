/**
 * /api/suppliers/:id/statement
 * GET — كشف حساب المورد في أي وقت (?from=YYYY-MM-DD&to=YYYY-MM-DD):
 *       فواتير + أوامر شراء (بلا فاتورة) مدين، المدفوعات دائن، برصيد جارٍ.
 */

import { NextRequest } from "next/server";
import { requireAnyPermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  supplierStatement,
  SupplierNotFoundError,
} from "@/lib/services/supplier-invoices.service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const READ_GUARD = [PERMISSIONS.FINANCE_READ, PERMISSIONS.SUPPLIER_READ];

function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireAnyPermission(req, READ_GUARD);
  if ("status" in auth) return auth;
  const { id } = await params;

  const sp = req.nextUrl.searchParams;
  try {
    const statement = await supplierStatement(auth.user.tenantId, id, {
      from: parseDate(sp.get("from")),
      to: parseDate(sp.get("to")),
    });
    return successResponse(statement);
  } catch (err) {
    if (err instanceof SupplierNotFoundError) return errorResponse("NOT_FOUND", err.message, 404);
    console.error("[GET /api/suppliers/:id/statement]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("STATEMENT_ERROR", message, 500);
  }
}
