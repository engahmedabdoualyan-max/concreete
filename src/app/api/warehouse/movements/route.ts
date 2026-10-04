/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/warehouse/movements — the stock ledger
 * ============================================================
 *
 *  ENDPOINTS:
 *  GET  /api/warehouse/movements?vehicleId=…  — history (optionally per truck)
 *  POST /api/warehouse/movements              — issue / install / remove / scrap
 *
 *  ONE ENDPOINT FOR THE WHOLE LIFECYCLE
 *  ─────────────────────────────────────────────────────────
 *      RECEIVE   →  goods in
 *      ISSUE     →  to a mechanic, not yet fitted
 *      INSTALL   →  fitted to a vehicle   (binds the label to that vehicle)
 *      REMOVE    →  taken off             (closes the binding, history kept)
 *      RETURN    →  back on the shelf, unused
 *      TO_SCRAP  →  into مخزن الهالك
 *      DISPOSE   →  gone for good         (needs warehouse:dispose)
 *
 *  WHY DISPOSE IS A SEPARATE PERMISSION
 *  ─────────────────────────────────────────────────────────
 *  Issuing a part is routine. Destroying the record that a part existed is the
 *  one action that can make a fraudulent return unfalsifiable, so it is gated
 *  behind `warehouse:dispose` and written to the audit log every time.
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS, userHasPermission } from "@/lib/auth/rbac";
import {
  listMovements,
  recordMovement,
  MOVEMENT_TYPES,
} from "@/lib/services/warehouse.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const MovementSchema = z.object({
  itemId: z.string().uuid("itemId must be a UUID"),
  movementType: z.enum(MOVEMENT_TYPES),
  quantity: z.number().positive("quantity must be greater than zero"),
  /** Which physical piece, for serialized items. */
  unitId: z.string().uuid().optional().nullable(),
  vehicleId: z.string().uuid().optional().nullable(),
  workOrderId: z.string().uuid().optional().nullable(),
  /** For ADJUST: the counted total, not a delta. */
  countedQty: z.number().min(0).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
});

/** Actions the scrap warehouse is allowed to perform. */
const SCRAP_GATED = ["TO_SCRAP", "FROM_SCRAP", "DISPOSE"] as const;

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.WAREHOUSE_READ);
  if ("status" in auth) return auth;

  const vehicleId = req.nextUrl.searchParams.get("vehicleId") ?? undefined;
  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1 || limit > 500)) {
    return errorResponse("INVALID_LIMIT", "limit must be between 1 and 500.", 400);
  }

  const movements = await listMovements(auth.user.tenantId, { vehicleId, limit });
  return successResponse(movements, `${movements.length} movement(s)`);
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.WAREHOUSE_WRITE);
  if ("status" in auth) return auth;

  const parsed = MovementSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(
      "INVALID_BODY",
      parsed.error.issues[0]?.message ?? "Invalid movement.",
      400,
      parsed.error.flatten()
    );
  }

  const data = parsed.data;

  // Scrap handling and disposal are gated separately from ordinary writes.
  if ((SCRAP_GATED as readonly string[]).includes(data.movementType)) {
    const permission =
      data.movementType === "DISPOSE"
        ? PERMISSIONS.WAREHOUSE_DISPOSE
        : PERMISSIONS.WAREHOUSE_SCRAP;

    if (
      !userHasPermission(auth.user.role, auth.user.permissions ?? [], permission)
    ) {
      return errorResponse(
        "FORBIDDEN",
        data.movementType === "DISPOSE"
          ? "Writing stock off for good needs the dispose permission. Ask the plant manager — it is deliberately not part of ordinary stores access."
          : "Moving stock into or out of the scrap warehouse needs the scrap permission.",
        403
      );
    }
  }

  const result = await recordMovement({
    tenantId: auth.user.tenantId,
    movedById: auth.user.sub,
    itemId: data.itemId,
    movementType: data.movementType,
    quantity: data.quantity,
    unitId: data.unitId ?? null,
    vehicleId: data.vehicleId ?? null,
    workOrderId: data.workOrderId ?? null,
    countedQty: data.countedQty ?? null,
    note: data.note ?? null,
  });

  if (!result.ok) {
    return errorFor(result, data.movementType);
  }

  await db.insert(auditLogs).values({
    userId: auth.user.sub,
    tenantId: auth.user.tenantId,
    action: `STOCK_${data.movementType}`,
    entityType: "stock_movements",
    entityId: result.movement.id,
    newState: {
      movementType: data.movementType,
      quantity: Number(result.movement.quantity),
      unitId: data.unitId ?? null,
      vehicleId: data.vehicleId ?? null,
      workOrderId: data.workOrderId ?? null,
      qtyOnHand: result.qtyOnHand,
      unitState: result.unitState,
      note: data.note ?? null,
    },
  });

  return successResponse(
    {
      movement: result.movement,
      qtyOnHand: result.qtyOnHand,
      unitState: result.unitState,
    },
    successMessage(data.movementType, result.unitState)
  );
}

// ─── Error translation ────────────────────────────────────────────────────────

/**
 * Every failure gets a message a mechanic can act on. The point is that a 409
 * names the truck that already holds the part, so the workshop goes and fixes the
 * real problem instead of guessing.
 */
function errorFor(
  result: Extract<Awaited<ReturnType<typeof recordMovement>>, { ok: false }>,
  movementType: string
): ReturnType<typeof errorResponse> {
  switch (result.code) {
    case "ITEM_NOT_FOUND":
      return errorResponse("ITEM_NOT_FOUND", "No such item in your plant.", 404);

    case "UNIT_REQUIRED":
      return errorResponse(
        "UNIT_REQUIRED",
        `This item is tracked piece by piece, so "${result.itemCode}" needs the specific unit being handled. Scan its label, or send the unitId.`,
        400
      );

    case "UNIT_NOT_FOUND":
      return errorResponse("UNIT_NOT_FOUND", "That unit does not belong to this item.", 404);

    case "UNIT_WRONG_STATE":
      return errorResponse(
        "UNIT_WRONG_STATE",
        `Unit ${result.unitSerial} is ${result.state}, so it cannot be ${movementType.toLowerCase()} — it has to be ${result.expected} first.`,
        409,
        { unitSerial: result.unitSerial, currentState: result.state, expectedState: result.expected }
      );

    case "VEHICLE_REQUIRED":
      return errorResponse(
        "VEHICLE_REQUIRED",
        `${movementType === "INSTALL" ? "Installing" : "Removing"} a part needs the vehicle it goes on or comes off. The whole point is knowing which truck.`,
        400
      );

    case "VEHICLE_NOT_FOUND":
      return errorResponse("VEHICLE_NOT_FOUND", "No such vehicle in your plant.", 404);

    case "WORK_ORDER_WRONG_VEHICLE":
      return errorResponse(
        "WORK_ORDER_MISMATCH",
        `Work order ${result.workOrderNumber} is not open against that vehicle. A part fitted under the wrong work order would put a lie in the maintenance record.`,
        409
      );

    case "INSUFFICIENT_STOCK":
      return errorResponse(
        "INSUFFICIENT_STOCK",
        `Only ${result.available} in stock and ${result.requested} requested. Someone else may have taken it — reload the item card and check the movements.`,
        409,
        { available: result.available, requested: result.requested }
      );

    case "ALREADY_INSTALLED":
      return errorResponse(
        "PART_ALREADY_FITTED",
        `That part is already fitted to ${result.vehicleCode} (${result.plateNumber}). It cannot be on two trucks at once — remove it from that vehicle first if it really came off.`,
        409,
        { vehicleCode: result.vehicleCode, plateNumber: result.plateNumber }
      );

    default:
      return errorResponse("MOVEMENT_FAILED", "Could not record that movement.", 400);
  }
}

function successMessage(movementType: string, unitState: string | null): string {
  switch (movementType) {
    case "INSTALL":
      return `Fitted. The label is now bound to that vehicle and will remember it.`;
    case "REMOVE":
      return unitState === "IN_SCRAP"
        ? "Removed and booked into the scrap warehouse."
        : "Removed. Move it to the scrap warehouse separately if it is not reusable.";
    case "TO_SCRAP":
      return "Moved to the scrap warehouse (مخزن الهالك).";
    case "DISPOSE":
      return "Disposed of. The QR label is retired but its history is kept.";
    default:
      return "Recorded.";
  }
}