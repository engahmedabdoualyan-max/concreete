/**
 * ============================================================
 *  /api/inventory/auto-check — Automatic inventory check against production schedule
 * ============================================================
 *  GET ?days=7  → Computes material requirements from scheduled orders
 *                and compares with current silo stock
 *  RBAC: INVENTORY_READ
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import {
  inventorySilos,
  mixDesigns,
  orders,
  trips,
  sites,
  plants,
  inventorySilos as silosTable,
} from "@/db/schema";
import { eq, and, gte, lt, sql, desc } from "drizzle-orm";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.INVENTORY_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "7", 10), 1), 30);
  const now = new Date();
  const horizonEnd = new Date(now.getTime() + days * 86400000);

  try {
    // 1. Get scheduled orders within horizon (status = SCHEDULED or IN_PROGRESS or APPROVED)
    const scheduledOrders = await db
      .select({
        order: orders,
        design: mixDesigns,
      })
      .from(orders)
      .leftJoin(mixDesigns, eq(mixDesigns.id, orders.mixDesignId))
      .where(
        and(
          eq(orders.tenantId, auth.user.tenantId),
          gte(orders.scheduledDate, now),
          lt(orders.scheduledDate, horizonEnd),
          // Orders that still have volume to pour and are approved/scheduled
          eq(orders.status, "SCHEDULED")
        )
      );

    // 2. Aggregate material requirements per m³
    const materialRequirements = new Map<string, { perM3: number; totalM3: number; totalKg: number }>();
    const materialCategories: Record<string, string> = {
      cementKgPerM3: "CEMENT",
      sandKgPerM3: "SAND",
      gravel10mmKgPerM3: "GRAVEL_10MM",
      gravel20mmKgPerM3: "GRAVEL_20MM",
      gravel40mmKgPerM3: "GRAVEL_40MM",
      waterLitresPerM3: "WATER",
      admixturePlasiticzerLPerM3: "ADMIXTURE_PLASTICIZER",
      admixtureRetarderLPerM3: "ADMIXTURE_RETARDER",
      flyAshKgPerM3: "FLY_ASH",
      silicaFumeKgPerM3: "SILICA_FUME",
    };

    let totalPlannedM3 = 0;

    for (const row of scheduledOrders) {
      if (!row.design) continue;
      const m3 = parseFloat(row.order.totalVolumeM3 ?? "0");
      if (m3 <= 0) continue;
      totalPlannedM3 += m3;

      for (const [field, category] of Object.entries(materialCategories)) {
        const kgPerM3 = parseFloat((row.design as any)[field] ?? "0");
        if (kgPerM3 <= 0) continue;
        const totalKg = kgPerM3 * m3;
        const existing = materialRequirements.get(category) ?? { perM3: 0, totalM3: 0, totalKg: 0 };
        existing.perM3 += kgPerM3;
        existing.totalM3 += m3;
        existing.totalKg += totalKg;
        materialRequirements.set(category, existing);
      }
    }

    // 3. Get current silo stock
    const silos = await db
      .select()
      .from(inventorySilos)
      .where(
        and(
          eq(inventorySilos.tenantId, auth.user.tenantId),
          eq(inventorySilos.isActive, true)
        )
      );

    // 4. Compute availability per material category
    const siloStockByCategory = new Map<string, number>();
    for (const silo of silos) {
      const cat = silo.materialCategory;
      const current = parseFloat(silo.currentStockKg ?? "0");
      siloStockByCategory.set(cat, (siloStockByCategory.get(cat) ?? 0) + current);
    }

    // 5. Build result
    const alerts = [];
    const details = [];

    for (const [category, req] of materialRequirements) {
      const available = siloStockByCategory.get(category) ?? 0;
      const shortage = Math.max(0, req.totalKg - available);
      const daysCoverage = req.perM3 > 0 ? Math.floor(available / req.perM3) : 0;

      const status = shortage > 0 ? "SHORTAGE" : daysCoverage < 3 ? "LOW" : "OK";

      details.push({
        category,
        perM3: req.perM3,
        plannedM3: req.totalM3,
        requiredKg: Math.round(req.totalKg),
        availableKg: Math.round(available),
        shortageKg: Math.round(shortage),
        daysCoverage,
        status,
      });

      if (status !== "OK") {
        alerts.push({
          category,
          message: shortage > 0
            ? `نقص ${Math.round(shortage).toLocaleString()} كجم ${category} (مطلوب ${Math.round(req.totalKg).toLocaleString()}، متاح ${Math.round(available).toLocaleString()})`
            : `مخزون ${category} يكفي ${daysCoverage} يوم فقط`,
          severity: shortage > 0 ? "CRITICAL" : "WARNING",
        });
      }
    }

    // Also check silos that have no upcoming requirements but are low
    for (const silo of silos) {
      const cat = silo.materialCategory;
      if (!materialRequirements.has(cat)) {
        const current = parseFloat(silo.currentStockKg ?? "0");
        const reorder = parseFloat(silo.reorderLevelKg ?? "0");
        if (current <= reorder) {
          alerts.push({
            category: cat,
            message: `صومعة ${silo.siloName} (${cat}) وصلت حد إعادة الطلب: ${silo.currentStockKg} / ${silo.reorderLevelKg} كجم`,
            severity: "WARNING",
            siloId: silo.id,
            siloName: silo.siloName,
          });
        }
      }
    }

    return successResponse({
      horizonDays: days,
      totalPlannedM3: Math.round(totalPlannedM3 * 10) / 10,
      materialDetails: details,
      alerts,
      summary: {
        totalCategories: details.length,
        critical: alerts.filter(a => a.severity === "CRITICAL").length,
        warnings: alerts.filter(a => a.severity === "WARNING").length,
      },
    }, `Auto-check completed for ${days} days horizon. ${totalPlannedM3}m³ planned.`);
  } catch (err) {
    console.error("[GET /api/inventory/auto-check]", err);
    return errorResponse("INVENTORY_ERROR", "Failed to run auto-check", 500);
  }
}