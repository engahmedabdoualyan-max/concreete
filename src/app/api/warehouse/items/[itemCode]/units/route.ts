/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/warehouse/items/[itemCode]/units — physical pieces
 * ============================================================
 *
 *  ENDPOINTS:
 *  GET  /api/warehouse/items/[itemCode]/units — every unit, with its QR
 *  POST /api/warehouse/items/[itemCode]/units — register one piece + mint its QR
 *
 *  A "unit" is one physical object: the pump that came off MIX-03, not "pumps,
 *  4 of them". Registering a unit is what makes a part individually traceable,
 *  and the QR minted here is the permanent sticker that goes on the part itself
 *  — never on the box, because the box is what gets thrown away.
 *
 *  `quantity` is deliberately not accepted here. Accepting a count would let the
 *  stock total claim more pieces than can be scanned. Bulk goods belong on a
 *  non-serialized item, where `stock_movements` carries the count instead.
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { isUniqueViolation } from "@/lib/db/pg-errors";
import { warehouseItems, stockMovements, auditLogs } from "@/db/schema";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { createUnit } from "@/lib/services/warehouse.service";
import { buildQrPayload, labelsForSubjects } from "@/lib/services/asset-qr.service";
import { and, eq, asc } from "drizzle-orm";
import { z } from "zod";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ itemCode: string }> };

const CreateUnitSchema = z.object({
  unitSerial: z
    .string()
    .trim()
    .min(1, "unitSerial is required — it is how this piece is told apart")
    .max(60),
  notes: z.string().trim().max(1000).optional().nullable(),
});

/** Load the item or return the standard 404 body. */
async function loadItem(tenantId: string, itemCode: string) {
  const [item] = await db
    .select()
    .from(warehouseItems)
    .where(
      and(eq(warehouseItems.tenantId, tenantId), eq(warehouseItems.itemCode, itemCode))
    )
    .limit(1);
  return item ?? null;
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requirePermission(req, PERMISSIONS.WAREHOUSE_READ);
  if ("status" in auth) return auth;

  const { itemCode } = await ctx.params;
  const item = await loadItem(auth.user.tenantId, decodeURIComponent(itemCode));
  if (!item) {
    return errorResponse("ITEM_NOT_FOUND", `No item card "${itemCode}".`, 404);
  }

  const { warehouseItemUnits } = await import("@/db/schema");
  const units = await db
    .select()
    .from(warehouseItemUnits)
    .where(
      and(
        eq(warehouseItemUnits.tenantId, auth.user.tenantId),
        eq(warehouseItemUnits.itemId, item.id)
      )
    )
    .orderBy(asc(warehouseItemUnits.unitSerial));

  const labels = await labelsForSubjects(
    auth.user.tenantId,
    "ITEM_UNIT",
    units.map((u) => u.id)
  );

  return successResponse(
    units.map((u) => ({
      ...u,
      qrLabelCode: labels.get(u.id)?.labelCode ?? null,
      fittedVehicleCode: labels.get(u.id)?.vehicleCode ?? null,
    })),
    `${units.length} unit(s)`
  );
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requirePermission(req, PERMISSIONS.WAREHOUSE_WRITE);
  if ("status" in auth) return auth;

  const { itemCode } = await ctx.params;
  const code = decodeURIComponent(itemCode);

  const parsed = CreateUnitSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(
      "INVALID_BODY",
      parsed.error.issues[0]?.message ?? "Invalid unit.",
      400,
      parsed.error.flatten()
    );
  }

  const item = await loadItem(auth.user.tenantId, code);
  if (!item) return errorResponse("ITEM_NOT_FOUND", `No item card "${code}".`, 404);

  try {
    const result = await createUnit({
      tenantId: auth.user.tenantId,
      createdById: auth.user.sub,
      itemId: item.id,
      unitSerial: parsed.data.unitSerial,
      notes: parsed.data.notes ?? null,
    });

    // Registering a unit means receiving it, so the ledger gets its RECEIVE row
    // here. Without it the piece would sit on a shelf the stock total calls
    // empty, and the first ISSUE would look like the warehouse was stealing.
    await db.insert(stockMovements).values({
      tenantId: auth.user.tenantId,
      itemId: item.id,
      movementType: "RECEIVE",
      quantity: "1",
      toWarehouse: item.defaultWarehouse,
      labelId: result.label.id,
      movedById: auth.user.sub,
      note: "Unit registered and labelled",
    });

    await db.insert(auditLogs).values({
      userId: auth.user.sub,
      tenantId: auth.user.tenantId,
      action: "WAREHOUSE_UNIT_REGISTERED",
      entityType: "warehouse_item_units",
      entityId: result.unit.id,
      newState: {
        unitSerial: result.unit.unitSerial,
        itemCode: item.itemCode,
        labelCode: result.label.labelCode,
      },
    });

    return successResponse(
      {
        unit: result.unit,
        qrLabelCode: result.label.labelCode,
        qrPayload: result.token
          ? buildQrPayload(result.label.labelCode, result.token)
          : null,
        itemCode: item.itemCode,
        itemName: item.name,
        qtyOnHand: "1",
      },
      "Unit registered. Put this label on the part itself, not on the box.",
      201
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      return errorResponse(
        "UNIT_SERIAL_TAKEN",
        `Unit "${parsed.data.unitSerial}" is already registered. Serials must be unique — the serial is what the QR prints.`,
        409
      );
    }
    throw err;
  }
}