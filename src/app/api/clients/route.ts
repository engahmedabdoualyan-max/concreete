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
import { eq, and, asc } from "drizzle-orm";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

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
