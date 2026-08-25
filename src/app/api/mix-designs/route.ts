/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  GET /api/mix-designs — Tenant-scoped active mix design
 *  reference data (Sales Rep booking form / batching panel).
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { mixDesigns } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.ORDER_READ);
  if ("status" in auth) return auth;

  const result = await db
    .select({
      id: mixDesigns.id,
      designCode: mixDesigns.designCode,
      gradeDescription: mixDesigns.gradeDescription,
      targetStrengthMpa: mixDesigns.targetStrengthMpa,
      targetSlumpCm: mixDesigns.targetSlumpCm,
      cementKgPerM3: mixDesigns.cementKgPerM3,
      sandKgPerM3: mixDesigns.sandKgPerM3,
      gravel10mmKgPerM3: mixDesigns.gravel10mmKgPerM3,
      gravel20mmKgPerM3: mixDesigns.gravel20mmKgPerM3,
      gravel40mmKgPerM3: mixDesigns.gravel40mmKgPerM3,
      waterLitresPerM3: mixDesigns.waterLitresPerM3,
      admixturePlasiticzerLPerM3: mixDesigns.admixturePlasiticzerLPerM3,
      admixtureRetarderLPerM3: mixDesigns.admixtureRetarderLPerM3,
      flyAshKgPerM3: mixDesigns.flyAshKgPerM3,
      silicaFumeKgPerM3: mixDesigns.silicaFumeKgPerM3,
      isActive: mixDesigns.isActive,
    })
    .from(mixDesigns)
    .where(
      and(
        eq(mixDesigns.tenantId, auth.user.tenantId),
        eq(mixDesigns.isActive, true)
      )
    )
    .orderBy(asc(mixDesigns.designCode));

  return successResponse(result);
}
