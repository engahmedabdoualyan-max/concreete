/**
 * ============================================================
 *  /api/plant/controllers/[id]/batch — fire and book
 * ============================================================
 *  POST { "action": "fire" | "record", "mixDesignId"?, "ticketNumber"?,
 *         "batchSizeM3"? }
 *
 *  fire   → send the design + target weights to the plant (or tell the operator
 *           to press it on the panel when remote writes are not commissioned)
 *  record → pull the finished ticket and post the ACTUAL consumption to the
 *           silos, which is what turns cost per m³ into a measured number
 *
 *  RBAC: BATCH_START (a batch operator action — it moves material)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { z } from "zod";

import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { checkNextRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import {
  fireBatch,
  recordBatchConsumption,
} from "@/lib/services/batch-execution.service";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  action: z.enum(["fire", "record"]).default("fire"),
  mixDesignId: z.string().uuid().optional(),
  ticketNumber: z.string().trim().min(1).max(40).optional(),
  batchSizeM3: z.coerce.number().positive().max(4).default(1),
  panelDesignCode: z.coerce.number().int().min(0).max(65535).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.BATCH_START);
  if ("status" in auth) return auth;
  const { id } = await params;

  const rate = checkNextRateLimit(
    `batch:${auth.user.tenantId}:${clientIpFromHeaders(req.headers)}`,
    60
  );
  if (!rate.allowed) {
    return errorResponse("RATE_LIMITED", "Too many batch actions", 429, {
      retryAfterSeconds: rate.retryAfterSeconds,
    });
  }

  let json: unknown = {};
  try {
    const raw = await req.text();
    if (raw) json = JSON.parse(raw);
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid batch action", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const body = parsed.data;

  if (body.action === "fire") {
    if (!body.mixDesignId) {
      return errorResponse("VALIDATION_ERROR", "mixDesignId is required to fire a batch", 400);
    }
    const result = await fireBatch(auth.user.tenantId, {
      controllerId: id,
      mixDesignId: body.mixDesignId,
      panelDesignCode: body.panelDesignCode,
      batchSizeM3: body.batchSizeM3,
    });
    if (!result.ok) {
      const detail = typeof result.message === "string" ? result.message : "Invalid batch request";
      return errorResponse(result.code, detail, result.code === "NOT_FOUND" ? 404 : 400, {
        fields: typeof result.message === "string" ? undefined : result.message,
      });
    }
    return successResponse(result);
  }

  const result = await recordBatchConsumption(auth.user.tenantId, {
    controllerId: id,
    ticketNumber: body.ticketNumber ?? `T${Date.now().toString().slice(-8)}`,
    batchSizeM3: body.batchSizeM3,
    performedById: auth.user.sub,
  });
  if (!result.ok) {
    const detail = typeof result.message === "string" ? result.message : "Invalid booking request";
    return errorResponse(result.code, detail, result.code === "NOT_FOUND" ? 404 : 400, {
      fields: typeof result.message === "string" ? undefined : result.message,
    });
  }
  return successResponse(result);
}
