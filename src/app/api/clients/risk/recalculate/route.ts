/**
 * POST /api/clients/risk/recalculate
 * Recomputes the automatic credit-risk score (LOW/MEDIUM/HIGH) for a single
 * client (body: { clientId }) or for the whole tenant when no clientId given.
 * Persists clients.risk_score / risk_notes / risk_last_updated_at.
 */

import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  computeClientRiskScore,
  recalculateAllClientRisk,
} from "@/lib/services/risk.service";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

export const dynamic = "force-dynamic";

const RecalculateSchema = z.object({
  clientId: z.string().uuid("Invalid client ID").optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_CLIENT_UPDATE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = RecalculateSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid request", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    // Single client (must belong to this tenant)
    if (parsed.data.clientId) {
      const owned = await db
        .select({ id: clients.id })
        .from(clients)
        .where(
          and(
            eq(clients.id, parsed.data.clientId),
            eq(clients.tenantId, auth.user.tenantId)
          )
        )
        .limit(1);
      if (owned.length === 0) {
        return errorResponse("NOT_FOUND", "Client not found in this tenant", 404);
      }
      const result = await computeClientRiskScore(parsed.data.clientId);
      return successResponse(
        { result, summary: { [result.riskLevel]: 1 } },
        "تم تحديث تقييم المخاطر"
      );
    }

    // Whole tenant
    const { results, summary } = await recalculateAllClientRisk(auth.user.tenantId);
    return successResponse(
      { results, summary },
      `تم تحديث تقييم المخاطر لـ ${results.length} عميل`
    );
  } catch (err) {
    console.error("[POST /api/clients/risk/recalculate]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("RISK_CALCULATION_ERROR", message, 500);
  }
}
