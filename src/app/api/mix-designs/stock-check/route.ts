/**
 * POST /api/mix-designs/stock-check
 * MixRatio sufficiency check — for a given design + quantity (m³), computes
 * the required kg per material and compares against silo stock grouped by
 * material category. Mirrors the Django `ConcreteDelivery.validate_stock`.
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { mixDesigns, inventorySilos } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

const StockCheckSchema = z.object({
  designCode: z.string().min(1, "معرّف الخلطة مطلوب"),
  quantityM3: z.number().positive("الكمية يجب أن تكون موجبة"),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.ORDER_READ);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = StockCheckSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid input", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { designCode, quantityM3 } = parsed.data;

  try {
    const [design] = await db
      .select()
      .from(mixDesigns)
      .where(and(eq(mixDesigns.tenantId, auth.user.tenantId), eq(mixDesigns.designCode, designCode)));
    if (!design) return errorResponse("NOT_FOUND", "Mix design not found", 404);

    const num = (v: string | null | undefined) => parseFloat(v ?? "0");
    const num2 = (v: string | null | undefined) => {
      const n = num(v);
      return Math.round(n * 1000) / 1000;
    };

    const components: { material: string; category: string; kgPerM3: number; requiredKg: number }[] = [
      { material: "أسمنت", category: "CEMENT", kgPerM3: num2(design.cementKgPerM3), requiredKg: num(design.cementKgPerM3) * quantityM3 },
      { material: "رمل", category: "SAND", kgPerM3: num2(design.sandKgPerM3), requiredKg: num(design.sandKgPerM3) * quantityM3 },
      { material: "ركام 10مم", category: "GRAVEL_10MM", kgPerM3: num2(design.gravel10mmKgPerM3), requiredKg: num(design.gravel10mmKgPerM3) * quantityM3 },
      { material: "ركام 20مم", category: "GRAVEL_20MM", kgPerM3: num2(design.gravel20mmKgPerM3), requiredKg: num(design.gravel20mmKgPerM3) * quantityM3 },
      { material: "ركام 40مم", category: "GRAVEL_40MM", kgPerM3: num2(design.gravel40mmKgPerM3), requiredKg: num(design.gravel40mmKgPerM3) * quantityM3 },
      { material: "رماد متطاير", category: "FLY_ASH", kgPerM3: num2(design.flyAshKgPerM3), requiredKg: num(design.flyAshKgPerM3) * quantityM3 },
      { material: "غبار سيليكا", category: "SILICA_FUME", kgPerM3: num2(design.silicaFumeKgPerM3), requiredKg: num(design.silicaFumeKgPerM3) * quantityM3 },
      { material: "ماء", category: "WATER", kgPerM3: num2(design.waterLitresPerM3), requiredKg: num(design.waterLitresPerM3) * quantityM3 },
    ].filter((c) => c.kgPerM3 > 0);

    const silos = await db
      .select({ category: inventorySilos.materialCategory, stockKg: inventorySilos.currentStockKg, siloCode: inventorySilos.siloCode, siloName: inventorySilos.siloName })
      .from(inventorySilos)
      .where(eq(inventorySilos.tenantId, auth.user.tenantId));

    const byCategory = new Map<string, number>();
    const siloDetails = new Map<string, { siloCode: string; siloName: string; stockKg: number }[]>();
    for (const s of silos) {
      byCategory.set(s.category, (byCategory.get(s.category) ?? 0) + num(s.stockKg));
      const list = siloDetails.get(s.category) ?? [];
      list.push({ siloCode: s.siloCode, siloName: s.siloName, stockKg: num(s.stockKg) });
      siloDetails.set(s.category, list);
    }

    const lines = components.map((c) => {
      const availableKg = byCategory.get(c.category) ?? 0;
      return {
        material: c.material,
        category: c.category,
        kgPerM3: c.kgPerM3,
        requiredKg: Math.round(c.requiredKg * 10) / 10,
        availableKg: Math.round(availableKg * 10) / 10,
        sufficient: availableKg >= c.requiredKg,
        shortageKg: Math.round(Math.max(0, c.requiredKg - availableKg) * 10) / 10,
        silos: (siloDetails.get(c.category) ?? []).slice(0, 5),
      };
    });

    const insufficient = lines.filter((l) => !l.sufficient);

    return successResponse({
      designCode: design.designCode,
      gradeDescription: design.gradeDescription,
      quantityM3,
      lines,
      ok: insufficient.length === 0,
      insufficientCount: insufficient.length,
    });
  } catch (err) {
    console.error("[POST /api/mix-designs/stock-check]", err);
    return errorResponse("STOCK_CHECK_ERROR", "Failed to check stock", 500);
  }
}
