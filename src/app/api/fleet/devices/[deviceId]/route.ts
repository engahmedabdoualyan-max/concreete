/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/fleet/devices/[deviceId] — relink or uncode a device
 * ============================================================
 *
 *  ENDPOINTS:
 *  PATCH  /api/fleet/devices/[deviceId]  — move the device to another vehicle
 *  DELETE /api/fleet/devices/[deviceId]  — uncode it from its vehicle
 *
 *  Both are workshop actions: a tracker swapped between two mixers, or a probe
 *  pulled off a truck for repair. Neither destroys history — the device row and
 *  every reading it produced stay, so the drum reports keep working.
 */

import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { telematicsDevices, fleetVehicles, auditLogs } from "@/db/schema";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { relinkDevice, unlinkDevice } from "@/lib/services/telematics.service";

export const dynamic = "force-dynamic";

const RelinkSchema = z.object({
  vehicleId: z.string().uuid("vehicleId must be a UUID"),
  isPrimary: z.boolean().optional(),
});

// ─── PATCH: move the device to another vehicle ────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.FLEET_UPDATE);
  if ("status" in auth) return auth;

  const { deviceId } = await params;
  if (!z.string().uuid().safeParse(deviceId).success) {
    return errorResponse("VALIDATION_ERROR", "Invalid device id", 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = RelinkSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid relink data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const before = await db
    .select({ vehicleId: telematicsDevices.vehicleId })
    .from(telematicsDevices)
    .where(
      and(
        eq(telematicsDevices.id, deviceId),
        eq(telematicsDevices.tenantId, auth.user.tenantId)
      )
    )
    .limit(1);
  if (!before[0]) {
    return errorResponse("DEVICE_NOT_FOUND", "That device is not coded in your company.", 404);
  }

  const result = await relinkDevice(auth.user.tenantId, deviceId, parsed.data);

  if (!result.ok) {
    if (result.reason === "DEVICE_NOT_FOUND") {
      return errorResponse(
        "DEVICE_NOT_FOUND",
        "That device is not coded in your company.",
        404
      );
    }
    return errorResponse(
      "VEHICLE_NOT_FOUND",
      "That vehicle does not exist, or is archived, in your company.",
      404
    );
  }

  const targetCode = await db
    .select({ code: fleetVehicles.vehicleCode })
    .from(fleetVehicles)
    .where(eq(fleetVehicles.id, result.device.vehicleId))
    .limit(1);

  await db.insert(auditLogs).values({
    userId: auth.user.sub,
    tenantId: auth.user.tenantId,
    action: "DEVICE_RELINKED",
    entityType: "telematics_devices",
    entityId: deviceId,
    previousState: { vehicleId: before[0].vehicleId },
    newState: { vehicleId: result.device.vehicleId, isPrimary: result.device.isPrimary },
  });

  return successResponse(
    {
      id: result.device.id,
      vehicleId: result.device.vehicleId,
      vehicleCode: targetCode[0]?.code ?? null,
      deviceCode: result.device.deviceCode,
      serialNumber: result.device.serialNumber,
      isPrimary: result.device.isPrimary,
      linkedAt: result.device.linkedAt,
    },
    `Device moved to vehicle ${targetCode[0]?.code ?? result.device.vehicleId}.`
  );
}

// ─── DELETE: uncode the device ────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.FLEET_UPDATE);
  if ("status" in auth) return auth;

  const { deviceId } = await params;
  if (!z.string().uuid().safeParse(deviceId).success) {
    return errorResponse("VALIDATION_ERROR", "Invalid device id", 400);
  }

  const before = await db
    .select({
      vehicleId: telematicsDevices.vehicleId,
      vehicleCode: fleetVehicles.vehicleCode,
      deviceCode: telematicsDevices.deviceCode,
      serialNumber: telematicsDevices.serialNumber,
    })
    .from(telematicsDevices)
    .innerJoin(fleetVehicles, eq(fleetVehicles.id, telematicsDevices.vehicleId))
    .where(
      and(
        eq(telematicsDevices.id, deviceId),
        eq(telematicsDevices.tenantId, auth.user.tenantId)
      )
    )
    .limit(1);
  if (!before[0]) {
    return errorResponse("DEVICE_NOT_FOUND", "That device is not coded in your company.", 404);
  }

  const result = await unlinkDevice(auth.user.tenantId, deviceId);
  if (!result.ok) {
    return errorResponse("DEVICE_NOT_FOUND", "That device is not coded in your company.", 404);
  }

  await db.insert(auditLogs).values({
    userId: auth.user.sub,
    tenantId: auth.user.tenantId,
    action: "DEVICE_UNCODED",
    entityType: "telematics_devices",
    entityId: deviceId,
    previousState: before[0],
    newState: { isActive: false, note: "uncoded, history preserved" },
  });

  return successResponse(
    { id: deviceId, isActive: false },
    `Device ${before[0].deviceCode ?? before[0].serialNumber} uncoded from ${before[0].vehicleCode}. Its history is kept.`
  );
}