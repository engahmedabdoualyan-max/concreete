/**
 * ============================================================
 *  GET  /api/plant/controllers  — Controller registry (sanitized)
 *  POST /api/plant/controllers  — Bind a controller to a plant
 * ============================================================
 *  RBAC: BATCH_CALIBRATE | SYSTEM_SETTINGS | LAB_READ (GET)
 *        SYSTEM_SETTINGS (POST)
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
import { listControllers, createController } from "@/lib/services/batch-control.service";
import { BATCH_CONTROLLER_PROVIDERS } from "@/lib/integrations/batch/controller";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAnyPermission(req, [
    PERMISSIONS.BATCH_CALIBRATE,
    PERMISSIONS.SYSTEM_SETTINGS,
    PERMISSIONS.LAB_READ,
  ]);
  if ("status" in auth) return auth;

  try {
    const controllers = await listControllers(auth.user.tenantId);
    return successResponse(
      { controllers, providers: BATCH_CONTROLLER_PROVIDERS },
      `${controllers.length} controller(s)`
    );
  } catch (err) {
    console.error("[GET /api/plant/controllers]", err);
    return errorResponse("BATCH_CTRL_ERROR", "Failed to list controllers", 500);
  }
}

const CreateControllerSchema = z.object({
  batchPlantId: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  provider: z.enum(["MODBUS_TCP", "HTTP_GATEWAY", "SIMULATOR"]),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.SYSTEM_SETTINGS);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = CreateControllerSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid controller payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const created = await createController(auth.user.tenantId, auth.user.sub, {
      batchPlantId: parsed.data.batchPlantId,
      name: parsed.data.name,
      provider: parsed.data.provider,
      settings: parsed.data.settings as Record<string, unknown> | undefined,
    });
    return successResponse(created, "Controller registered", 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Register failed";
    return errorResponse("BATCH_CTRL_ERROR", message, 422);
  }
}
