/**
 * POST /api/quality/environment-compensation
 * Returns the compensated mix design given ambient conditions.
 * Used by Lab Technician before each batch to verify corrections.
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { mixDesigns } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { computeEnvironmentCompensation } from "@/lib/services/environment-compensation.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CompensationRequestSchema = z.object({
  mixDesignId: z.string().uuid("Invalid mix design ID"),
  temperatureC: z.number().min(-10).max(60),
  humidityPct: z.number().min(0).max(100),
  estimatedTransitMinutes: z.number().min(1).max(480).optional(),
  volumeM3: z.number().positive().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.LAB_READ);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = CompensationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid compensation request", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const mixRows = await db
    .select()
    .from(mixDesigns)
    .where(
      and(
        eq(mixDesigns.id, parsed.data.mixDesignId),
        eq(mixDesigns.tenantId, auth.user.tenantId)
      )
    )
    .limit(1);

  if (mixRows.length === 0) {
    return errorResponse("NOT_FOUND", "Mix design not found", 404);
  }

  const mixDesign = mixRows[0];

  const compensation = computeEnvironmentCompensation(mixDesign, {
    temperatureC: parsed.data.temperatureC,
    humidityPct: parsed.data.humidityPct,
    estimatedTransitMinutes: parsed.data.estimatedTransitMinutes,
  });

  return successResponse({
    mixDesignCode: mixDesign.designCode,
    gradeDescription: mixDesign.gradeDescription,
    baseRecipe: {
      waterLitresPerM3: mixDesign.waterLitresPerM3,
      retarderLPerM3: mixDesign.admixtureRetarderLPerM3,
      plasticiserLPerM3: mixDesign.admixturePlasiticzerLPerM3,
      targetSlumpCm: mixDesign.targetSlumpCm,
      targetStrengthMpa: mixDesign.targetStrengthMpa,
    },
    compensation,
    region: "Al-Sharqia, Saudi Arabia",
    computedAt: new Date().toISOString(),
  });
}
