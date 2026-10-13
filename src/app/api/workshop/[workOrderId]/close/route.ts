/**
 * POST /api/workshop/[workOrderId]/close
 * Closes a maintenance work order and returns vehicle to AVAILABLE status.
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { maintenanceOrders, fleetVehicles, auditLogs, expenses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { recordMovement } from "@/lib/services/warehouse.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CloseWorkOrderSchema = z.object({
  actionTaken: z.string().min(10, "Action description required"),
  labourHours: z.number().positive().optional(),
  totalCostSar: z.number().int().nonnegative().optional(),
  partsUsed: z
    .array(
      z.object({
        partCode: z.string(),
        description: z.string(),
        quantityUsed: z.number(),
        costSar: z.number(),
        /** Coded registry item — when present, stock is issued automatically. */
        itemId: z.string().uuid().optional(),
      })
    )
    .optional(),
  nextServiceDueKm: z.number().positive().optional(),
  /** Override: return vehicle to a non-AVAILABLE status if still partially constrained */
  returnVehicleStatus: z
    .enum(["AVAILABLE", "STANDBY", "OUT_OF_SERVICE"])
    .default("AVAILABLE"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workOrderId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.WORKSHOP_CLOSE_ORDER);
  if ("status" in auth) return auth;

  const { workOrderId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = CloseWorkOrderSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid closure data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const woRows = await db
    .select()
    .from(maintenanceOrders)
    .where(eq(maintenanceOrders.id, workOrderId))
    .limit(1);

  if (woRows.length === 0) return errorResponse("NOT_FOUND", "Work order not found", 404);

  const wo = woRows[0];
  if (wo.status === "COMPLETED" || wo.status === "CANCELLED") {
    return errorResponse("ALREADY_CLOSED", `Work order is already ${wo.status}`, 409);
  }

  const now = new Date();
  const parts = parsed.data.partsUsed ?? [];
  const partsTotalSar = parts.reduce(
    (s, p) => s + (Number(p.quantityUsed) || 0) * (Number(p.costSar) || 0),
    0
  );

  await db
    .update(maintenanceOrders)
    .set({
      status: "COMPLETED",
      actionTaken: parsed.data.actionTaken,
      labourHours: parsed.data.labourHours?.toFixed(2),
      totalCostSar:
        parsed.data.totalCostSar ?? Math.round(partsTotalSar),
      partsUsed: parts,
      nextServiceDueKm: parsed.data.nextServiceDueKm?.toFixed(1),
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(maintenanceOrders.id, workOrderId));

  // Issue coded parts out of warehouse stock (best-effort: never blocks closure).
  const stockWarnings: string[] = [];
  for (const p of parts) {
    if (!p.itemId || (Number(p.quantityUsed) || 0) <= 0) continue;
    const res = await recordMovement({
      tenantId: wo.tenantId,
      movedById: auth.user.sub,
      itemId: p.itemId,
      movementType: "ISSUE",
      quantity: Number(p.quantityUsed),
      vehicleId: wo.vehicleId,
      workOrderId,
      note: `WO ${wo.workOrderNumber} — ${p.description}`.slice(0, 200),
    });
    if (!res.ok) {
      stockWarnings.push(`${p.partCode}: ${res.code}`);
    }
  }

  // Carry parts cost into indirect cost (finance maintenance expense).
  let expenseId: string | null = null;
  if (partsTotalSar > 0) {
    const [exp] = await db
      .insert(expenses)
      .values({
        tenantId: wo.tenantId,
        category: "maintenance",
        amountSar: Math.round(partsTotalSar * 100),
        date: now.toISOString().slice(0, 10),
        description: `قطع غيار أمر الشغل ${wo.workOrderNumber}`.slice(0, 500),
        vehicleId: wo.vehicleId,
        referenceNumber: wo.workOrderNumber,
        createdById: auth.user.sub,
      })
      .returning({ id: expenses.id });
    expenseId = exp?.id ?? null;
  }

  // Return vehicle to specified status (default: AVAILABLE)
  await db
    .update(fleetVehicles)
    .set({ currentStatus: parsed.data.returnVehicleStatus, updatedAt: now })
    .where(eq(fleetVehicles.id, wo.vehicleId));

  await db.insert(auditLogs).values({
    userId: auth.user.sub,
    tenantId: wo.tenantId,
    action: "WORK_ORDER_CLOSED",
    entityType: "maintenance_orders",
    entityId: workOrderId,
    previousState: { status: wo.status },
    newState: {
      status: "COMPLETED",
      vehicleReturnedTo: parsed.data.returnVehicleStatus,
      actionTaken: parsed.data.actionTaken,
    },
    socketEvent: "vehicle:status_changed",
  });

  return successResponse(
    {
      workOrderId,
      workOrderNumber: wo.workOrderNumber,
      closedAt: now.toISOString(),
      vehicleReturnedTo: parsed.data.returnVehicleStatus,
      partsTotalSar: Math.round(partsTotalSar * 100) / 100,
      expenseId,
      stockWarnings,
      socketBroadcast: {
        event: "vehicle:status_changed",
        rooms: ["dispatch", "fleet"],
        payload: {
          vehicleId: wo.vehicleId,
          newStatus: parsed.data.returnVehicleStatus,
          workOrderClosed: wo.workOrderNumber,
        },
      },
    },
    `Work order ${wo.workOrderNumber} closed. Vehicle returned to ${parsed.data.returnVehicleStatus}.`
  );
}
