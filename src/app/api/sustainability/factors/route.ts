/**
 * ============================================================
 *  GET  /api/sustainability/factors  — Emission intensities
 *  PUT  /api/sustainability/factors  — Update a factor
 * ============================================================
 *  Body: { factorKey, kgco2ePerUnit }
 *  RBAC: RND_READ | FINANCE_READ (GET) · SYSTEM_SETTINGS (PUT)
 * ============================================================
 */

import { NextRequest } from "next/server";
import {
  requireAnyPermission,
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { listFactors, updateFactor } from "@/lib/services/sustainability.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAnyPermission(req, [
    PERMISSIONS.RND_READ,
    PERMISSIONS.FINANCE_READ,
  ]);
  if ("status" in auth) return auth;

  try {
    const factors = await listFactors(auth.user.tenantId);
    return successResponse({ factors }, `${factors.length} factor(s)`);
  } catch (err) {
    console.error("[GET /api/sustainability/factors]", err);
    return errorResponse("CARBON_ERROR", "Failed to load factors", 500);
  }
}

const UpdateFactorSchema = z.object({
  factorKey: z.string().min(1).max(40),
  kgco2ePerUnit: z.number().nonnegative().max(100000),
});

export async function PUT(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.SYSTEM_SETTINGS);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = UpdateFactorSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid factor payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const updated = await updateFactor(
      auth.user.tenantId,
      parsed.data.factorKey,
      parsed.data.kgco2ePerUnit
    );
    if (!updated) return errorResponse("FACTOR_NOT_FOUND", "Factor not found", 404);
    return successResponse(updated, "Factor updated");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return errorResponse("CARBON_ERROR", message, 422);
  }
}
