/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  GET /api/clients — Tenant-scoped client reference data
 *  Used by the Sales Rep mobile app for the booking form.
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { z } from "zod";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { isUniqueViolation } from "@/lib/db/pg-errors";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.ORDER_READ);
  if ("status" in auth) return auth;

  const result = await db
    .select({
      id: clients.id,
      clientCode: clients.clientCode,
      companyName: clients.companyName,
      contactPerson: clients.contactPerson,
      phone: clients.phone,
      email: clients.email,
      isActive: clients.isActive,
      creditLimitSar: clients.creditLimitSar,
      outstandingBalanceSar: clients.outstandingBalanceSar,
      isBlacklisted: clients.isBlacklisted,
      riskScore: clients.riskScore,
      riskNotes: clients.riskNotes,
      riskLastUpdatedAt: clients.riskLastUpdatedAt,
    })
    .from(clients)
    .where(
      and(eq(clients.tenantId, auth.user.tenantId), eq(clients.isActive, true))
    )
    .orderBy(asc(clients.companyName));

  return successResponse(result);
}

const CreateClientSchema = z.object({
  companyName: z.string().trim().min(2).max(200),
  contactPerson: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  vatNumber: z.string().trim().max(50).optional(),
  creditLimitSar: z.number().int().nonnegative().max(1000000000).optional(),
  notes: z.string().trim().max(1000).optional(),
});

/**
 * POST /api/clients — register a customer (ORDER_CREATE).
 * Code auto-generated per tenant (CL-0001…); globally unique via retry.
 */
export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.ORDER_CREATE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = CreateClientSchema.safeParse(body);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Invalid client payload", 400);
  const d = parsed.data;

  for (let attempt = 0; attempt < 3; attempt++) {
    const n = await db.execute(sql`
      SELECT COALESCE(COUNT(*), 0)::int AS n FROM clients
      WHERE tenant_id = ${auth.user.tenantId}
    `);
    const code = `CL-${String(Number((n.rows as { n: number }[])[0]?.n ?? 0) + 1 + attempt).padStart(4, "0")}`;
    try {
      const [row] = await db
        .insert(clients)
        .values({
          tenantId: auth.user.tenantId,
          clientCode: code,
          companyName: d.companyName,
          contactPerson: d.contactPerson || null,
          phone: d.phone || null,
          email: d.email || null,
          vatNumber: d.vatNumber || null,
          creditLimitSar: d.creditLimitSar ?? 0,
          notes: d.notes || null,
        })
        .returning({ id: clients.id, clientCode: clients.clientCode });
      return successResponse(row, `تم تسجيل العميل ${code}`, 201);
    } catch (e: unknown) {
      if (isUniqueViolation(e)) continue;
      throw e;
    }
  }
  return errorResponse("CLIENT_FAILED", "تعذر تسجيل العميل", 500);
}
