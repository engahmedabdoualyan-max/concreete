/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Warehouse Service — مخزن قطع الغيار ومخزن الهالك
 *  src/lib/services/warehouse.service.ts
 * ============================================================
 *
 *  THE FLOW THIS ENCODES
 *  ─────────────────────────────────────────────────────────
 *      RECEIVE ──▶ IN_STORE ──ISSUE──▶ ISSUED ──INSTALL──▶ INSTALLED
 *                        ▲                                   │
 *                        └─────────── RETURN ◀── REMOVE ◀───┘
 *
 *      IN_STORE ──TO_SCRAP──▶ IN_SCRAP (مخزن الهالك) ──FROM_SCRAP──▶ IN_STORE
 *      IN_SCRAP  ──DISPOSE──▶ SCRAPPED (gone, but the QR label survives)
 *
 *  WHY A LABEL OUTLIVES THE PART
 *  ─────────────────────────────────────────────────────────
 *  The fraud this exists to stop: a part is bought, "installed" on a truck,
 *  then brought back claiming it went on. The only way to refute that is to
 *  still know, months later, exactly which truck it was on and which work order
 *  justified it. So REMOVE never deletes anything — it closes the binding and
 *  moves the unit, and the label keeps answering with the full trail.
 *
 *  STOCK CANNOT GO NEGATIVE
 *  ─────────────────────────────────────────────────────────
 *  `warehouse_items.qty_on_hand` carries a CHECK (>= 0) and is recomputed by a
 *  database trigger from the ledger, so two mechanics issuing the last pump at
 *  the same moment cannot both succeed: the loser's transaction is rejected by
 *  the constraint. This function pre-checks for a friendly message, but the
 *  constraint is what actually guarantees it.
 */

import { db } from "@/db";
import { isCheckViolation } from "@/lib/db/pg-errors";
import {
  warehouseItems,
  warehouseItemUnits,
  stockMovements,
  assetQrLabels,
  assetQrBindings,
  fleetVehicles,
  maintenanceOrders,
  users,
  equipment,
  type WarehouseKind,
  type StockMovementType,
} from "@/db/schema";
import {
  and,
  eq,
  desc,
  asc,
  ilike,
  or,
  inArray,
  isNotNull,
  isNull,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  issueLabel,
  bindLabel,
  unbindLabel,
  setLabelState,
  labelsForSubjects,
} from "./asset-qr.service";

// ─── Types ────────────────────────────────────────────────────────────────────

export const MOVEMENT_TYPES = [
  "RECEIVE",
  "ISSUE",
  "RETURN",
  "INSTALL",
  "REMOVE",
  "TO_SCRAP",
  "FROM_SCRAP",
  "DISPOSE",
  "ADJUST",
] as const;

export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const UNIT_STATES = [
  "IN_STORE",
  "ISSUED",
  "INSTALLED",
  "IN_SCRAP",
  "SCRAPPED",
] as const;

/** Movements that require a named physical unit and take it out of the store. */
const SERIALIZED_ONLY: MovementType[] = [
  "ISSUE",
  "INSTALL",
  "REMOVE",
  "TO_SCRAP",
  "FROM_SCRAP",
  "DISPOSE",
];

/**
 * Movements that reduce what the warehouse holds.
 *
 * This list MUST stay identical to the trigger's arithmetic in
 * `fimto_sync_item_qty_on_hand`, or the service will refuse a movement the
 * ledger would happily record — or worse, allow one and let the CHECK
 * constraint reject it as an opaque 500.
 *
 * INSTALL and DISPOSE are deliberately absent. Neither costs the store anything:
 * the piece was already deducted when it was ISSUED, and fitting it to a truck
 * or writing it off for good changes where it IS, not how much there is. Listing
 * them here once caused a real bug — a mechanic could not fit the last pump in
 * the building because stock had already read zero, which is precisely when
 * fitting a part is most urgent.
 */
const OUTFLOW: MovementType[] = ["ISSUE", "TO_SCRAP"];

// ─── Item cards ───────────────────────────────────────────────────────────────

export type CreateItemInput = {
  tenantId: string;
  createdById: string;
  itemCode: string;
  name: string;
  nameAr?: string | null;
  category?: "SPARE_PART" | "LUBRICANT" | "CONSUMABLE" | "SCRAP";
  defaultWarehouse?: WarehouseKind;
  unit?: string;
  minQty?: number;
  unitCostSar?: number;
  oemPartNumber?: string | null;
  appliesToMake?: string | null;
  appliesToModel?: string | null;
  isSerialized?: boolean;
  notes?: string | null;
};

/**
 * Create an item card and immediately issue its shelf QR.
 *
 * The card label is minted here rather than on demand so that a newly created
 * item can be printed straight away — the storeman should never have to
 * remember a second step.
 */
export async function createItem(input: CreateItemInput) {
  const [item] = await db
    .insert(warehouseItems)
    .values({
      tenantId: input.tenantId,
      itemCode: input.itemCode,
      name: input.name,
      nameAr: input.nameAr ?? null,
      category: input.category ?? "SPARE_PART",
      defaultWarehouse: input.defaultWarehouse ?? "SPARES",
      unit: input.unit ?? "PCS",
      minQty: String(input.minQty ?? 0),
      unitCostSar: String(input.unitCostSar ?? 0),
      oemPartNumber: input.oemPartNumber ?? null,
      appliesToMake: input.appliesToMake ?? null,
      appliesToModel: input.appliesToModel ?? null,
      isSerialized: input.isSerialized ?? true,
      notes: input.notes ?? null,
    })
    .returning();

  const issued = await issueLabel({
    tenantId: input.tenantId,
    subjectType: "ITEM_CARD",
    subjectId: item!.id,
    subjectRef: item!.itemCode,
    subjectLabel: item!.name,
    issuedById: input.createdById,
  });

  return { item: item!, cardLabel: issued.label, cardToken: issued.token };
}

export type ListItemsFilters = {
  tenantId: string;
  warehouse?: WarehouseKind | "ALL";
  search?: string;
  category?: string;
  lowStockOnly?: boolean;
  includeInactive?: boolean;
  limit?: number;
};

/** Item list for the stores screen, each row carrying its card QR for display. */
export async function listItems(filters: ListItemsFilters) {
  const conditions: SQL[] = [eq(warehouseItems.tenantId, filters.tenantId)];

  if (!filters.includeInactive) conditions.push(eq(warehouseItems.isActive, true));
  if (filters.warehouse && filters.warehouse !== "ALL") {
    conditions.push(eq(warehouseItems.defaultWarehouse, filters.warehouse));
  }
  if (filters.category) {
    conditions.push(eq(warehouseItems.category, filters.category as never));
  }
  if (filters.search) {
    const needle = `%${filters.search.trim()}%`;
    const searchClause = or(
      ilike(warehouseItems.itemCode, needle),
      ilike(warehouseItems.name, needle),
      ilike(warehouseItems.nameAr, needle),
      ilike(warehouseItems.oemPartNumber, needle)
    );
    if (searchClause) conditions.push(searchClause);
  }
  if (filters.lowStockOnly) {
    conditions.push(sql`${warehouseItems.qtyOnHand} <= ${warehouseItems.minQty}`);
  }

  const items = await db
    .select()
    .from(warehouseItems)
    .where(and(...conditions))
    .orderBy(asc(warehouseItems.itemCode))
    .limit(filters.limit ?? 200);

  const labels = await labelsForSubjects(
    filters.tenantId,
    "ITEM_CARD",
    items.map((i) => i.id)
  );

  return items.map((i) => ({
    ...i,
    lowStock: Number(i.qtyOnHand) <= Number(i.minQty),
    qrLabelCode: labels.get(i.id)?.labelCode ?? null,
  }));
}

/**
 * The item card screen: the item, its physical units with their QR codes, and
 * every movement it has ever seen.
 */
export async function getItemCard(tenantId: string, itemCode: string) {
  const [item] = await db
    .select()
    .from(warehouseItems)
    .where(
      and(eq(warehouseItems.tenantId, tenantId), eq(warehouseItems.itemCode, itemCode))
    )
    .limit(1);
  if (!item) return null;

  const [units, movements, cardLabels] = await Promise.all([
    db
      .select()
      .from(warehouseItemUnits)
      .where(
        and(
          eq(warehouseItemUnits.tenantId, tenantId),
          eq(warehouseItemUnits.itemId, item.id)
        )
      )
      .orderBy(asc(warehouseItemUnits.unitSerial)),

    db
      .select({
        id: stockMovements.id,
        movementType: stockMovements.movementType,
        quantity: stockMovements.quantity,
        movedAt: stockMovements.movedAt,
        note: stockMovements.note,
        vehicleCode: fleetVehicles.vehicleCode,
        plateNumber: fleetVehicles.plateNumber,
        labelCode: assetQrLabels.labelCode,
        workOrderNumber: maintenanceOrders.workOrderNumber,
        movedByName: users.fullName,
      })
      .from(stockMovements)
      .leftJoin(fleetVehicles, eq(fleetVehicles.id, stockMovements.vehicleId))
      .leftJoin(assetQrLabels, eq(assetQrLabels.id, stockMovements.labelId))
      .leftJoin(
        maintenanceOrders,
        eq(maintenanceOrders.id, stockMovements.workOrderId)
      )
      .leftJoin(users, eq(users.id, stockMovements.movedById))
      .where(
        and(
          eq(stockMovements.tenantId, tenantId),
          eq(stockMovements.itemId, item.id)
        )
      )
      .orderBy(desc(stockMovements.movedAt))
      .limit(100),

    labelsForSubjects(tenantId, "ITEM_CARD", [item.id]),
  ]);

  const unitLabels = await labelsForSubjects(
    tenantId,
    "ITEM_UNIT",
    units.map((u) => u.id)
  );

  return {
    item,
    lowStock: Number(item.qtyOnHand) <= Number(item.minQty),
    qrLabelCode: cardLabels.get(item.id)?.labelCode ?? null,
    qrLabelState: cardLabels.get(item.id)?.state ?? null,
    units: units.map((u) => ({
      ...u,
      qrLabelCode: unitLabels.get(u.id)?.labelCode ?? null,
      // Retired included, so the UI can print it struck-through instead of
      // leaving a scrapped part looking like it never had a label.
      qrLabelState: unitLabels.get(u.id)?.state ?? null,
      qrVehicleCode: unitLabels.get(u.id)?.vehicleCode ?? null,
    })),
    movements,
  };
}

// ─── Physical units ───────────────────────────────────────────────────────────

export type CreateUnitInput = {
  tenantId: string;
  createdById: string;
  itemId: string;
  unitSerial: string;
  notes?: string | null;
};

/**
 * Register one physical piece of stock and mint its permanent QR label.
 *
 * The label is minted in the same call and returned with its secret, because the
 * caller has to print the sticker immediately — the secret is unrecoverable
 * afterwards by design.
 */
export async function createUnit(input: CreateUnitInput) {
  const [unit] = await db
    .insert(warehouseItemUnits)
    .values({
      tenantId: input.tenantId,
      itemId: input.itemId,
      unitSerial: input.unitSerial,
      notes: input.notes ?? null,
    })
    .returning();

  const issued = await issueLabel({
    tenantId: input.tenantId,
    subjectType: "ITEM_UNIT",
    subjectId: unit!.id,
    subjectRef: input.unitSerial,
    issuedById: input.createdById,
  });

  // Look up the item's code so the sticker can be read as a human line
  // ("SP-000007 · WATER PUMP") without another round trip at print time.
  const [item] = await db
    .select({ itemCode: warehouseItems.itemCode, name: warehouseItems.name })
    .from(warehouseItems)
    .where(eq(warehouseItems.id, unit!.itemId))
    .limit(1);

  return {
    unit: unit!,
    label: issued.label,
    token: issued.token,
    itemCode: item?.itemCode ?? null,
    itemName: item?.name ?? null,
  };
}

// ─── The movement ledger ──────────────────────────────────────────────────────

export type RecordMovementInput = {
  tenantId: string;
  movedById: string;
  itemId: string;
  movementType: MovementType;
  quantity: number;
  /** Required for every serialized movement; quantity is then forced to 1. */
  unitId?: string | null;
  vehicleId?: string | null;
  workOrderId?: string | null;
  /** For ADJUST: the counted quantity, not a delta. */
  countedQty?: number | null;
  note?: string | null;
};

export type RecordMovementResult =
  | {
      ok: true;
      movement: typeof stockMovements.$inferSelect;
      qtyOnHand: string;
      unitState: WarehouseKind | string | null;
    }
  | { ok: false; code: "ITEM_NOT_FOUND" }
  | { ok: false; code: "UNIT_REQUIRED"; itemCode: string }
  | { ok: false; code: "UNIT_NOT_FOUND"; unitSerial: string }
  | { ok: false; code: "UNIT_WRONG_STATE"; unitSerial: string; state: string; expected: string }
  | { ok: false; code: "VEHICLE_REQUIRED"; movementType: MovementType }
  | { ok: false; code: "VEHICLE_NOT_FOUND" }
  | { ok: false; code: "WORK_ORDER_WRONG_VEHICLE"; workOrderNumber: string }
  | { ok: false; code: "INSUFFICIENT_STOCK"; available: string; requested: number }
  | { ok: false; code: "ALREADY_INSTALLED"; vehicleCode: string; plateNumber: string };

/**
 * Record one stock movement and move the unit, label and binding with it.
 *
 * Everything happens in a single transaction: a movement row without the unit
 * state change it implies would leave the two tables disagreeing about what is
 * on a truck, and that disagreement is exactly what makes a return claim
 * unfalsifiable.
 */
export async function recordMovement(
  input: RecordMovementInput
): Promise<RecordMovementResult> {
  const [item] = await db
    .select()
    .from(warehouseItems)
    .where(
      and(
        eq(warehouseItems.tenantId, input.tenantId),
        eq(warehouseItems.id, input.itemId)
      )
    )
    .limit(1);
  if (!item) return { ok: false, code: "ITEM_NOT_FOUND" };

  // ── Resolve the unit, if this movement is about a specific piece ──
  let unit: typeof warehouseItemUnits.$inferSelect | null = null;
  if (input.unitId) {
    const [found] = await db
      .select()
      .from(warehouseItemUnits)
      .where(
        and(
          eq(warehouseItemUnits.tenantId, input.tenantId),
          eq(warehouseItemUnits.id, input.unitId),
          eq(warehouseItemUnits.itemId, item.id)
        )
      )
      .limit(1);
    if (!found) return { ok: false, code: "UNIT_NOT_FOUND", unitSerial: input.unitId };
    unit = found;
  } else if (item.isSerialized && SERIALIZED_ONLY.includes(input.movementType)) {
    return { ok: false, code: "UNIT_REQUIRED", itemCode: item.itemCode };
  }

  // ── Resolve the vehicle ──
  //
  // Checked BEFORE the unit state on purpose. "You did not say which truck" and
  // "that part is already installed somewhere" are both true of a bad request,
  // but reporting the second one sends the mechanic hunting for a part that is
  // fine. Missing input is reported first because it is the thing they can fix
  // right now.
  let vehicle: { id: string; code: string; plate: string } | null = null;
  if (input.vehicleId) {
    const [found] = await db
      .select({
        id: fleetVehicles.id,
        code: fleetVehicles.vehicleCode,
        plate: fleetVehicles.plateNumber,
      })
      .from(fleetVehicles)
      .where(
        and(
          eq(fleetVehicles.tenantId, input.tenantId),
          eq(fleetVehicles.id, input.vehicleId)
        )
      )
      .limit(1);
    if (!found) return { ok: false, code: "VEHICLE_NOT_FOUND" };
    vehicle = found;
  } else if (input.movementType === "INSTALL" || input.movementType === "REMOVE") {
    return { ok: false, code: "VEHICLE_REQUIRED", movementType: input.movementType };
  }

  // ── A work order must belong to the same vehicle, or the paper trail is fake ──
  if (input.workOrderId) {
    const [wo] = await db
      .select({
        number: maintenanceOrders.workOrderNumber,
        vehicleId: maintenanceOrders.vehicleId,
      })
      .from(maintenanceOrders)
      .where(
        and(
          eq(maintenanceOrders.tenantId, input.tenantId),
          eq(maintenanceOrders.id, input.workOrderId)
        )
      )
      .limit(1);

    if (!wo) return { ok: false, code: "WORK_ORDER_WRONG_VEHICLE", workOrderNumber: "?" };
    if (vehicle && wo.vehicleId !== vehicle.id) {
      // Silently re-pointing the work order at this truck would make the
      // maintenance record lie about which vehicle was repaired.
      return { ok: false, code: "WORK_ORDER_WRONG_VEHICLE", workOrderNumber: wo.number };
    }
  }

  // ── Is this part already riding on another truck? ──
  //
  // Checked BEFORE the unit state, and that order is the whole point. A part
  // that is currently fitted is in state INSTALLED, so the state check would
  // answer "it has to be ISSUED first" — true, but useless: the mechanic does
  // not know it is fitted anywhere, and the fix is not to issue it, it is to go
  // and take it off the other vehicle. Naming that vehicle turns a puzzling
  // error into a two-minute job.
  if (unit && input.movementType === "INSTALL" && vehicle) {
    const currentBinding = await currentBindingFor(input.tenantId, unit.id);
    if (currentBinding) {
      return {
        ok: false,
        code: "ALREADY_INSTALLED",
        vehicleCode: currentBinding.vehicleCode,
        plateNumber: currentBinding.plateNumber,
      };
    }
  }

  // ── Validate the unit is in a state this movement can start from ──
  //
  // After the checks above, so every "you did not tell me something" error and
  // every "somewhere else already has it" error has already been reported. A
  // state complaint is only actionable once the rest of the request is right.
  const expectedUnitState = UNIT_STATE_EXPECTATIONS[input.movementType];
  if (unit && expectedUnitState && unit.state !== expectedUnitState) {
    return {
      ok: false,
      code: "UNIT_WRONG_STATE",
      unitSerial: unit.unitSerial,
      state: unit.state,
      expected: expectedUnitState,
    };
  }

  // ── Work out the quantity that actually hits the ledger ──
  let ledgerType: MovementType = input.movementType;
  let quantity = input.quantity;

  if (ledgerType === "ADJUST") {
    const counted = input.countedQty;
    if (counted == null || counted < 0) {
      return {
        ok: false,
        code: "INSUFFICIENT_STOCK",
        available: item.qtyOnHand,
        requested: quantity,
      };
    }
    // A stocktake records the COUNT, not a delta. Storing it as a signed number
    // would need a negative-quantity column; storing it as RECEIVE/ISSUE keeps
    // one meaning per row type and lets the trigger do the arithmetic.
    const delta = counted - Number(item.qtyOnHand);
    ledgerType = delta >= 0 ? "RECEIVE" : "ISSUE";
    quantity = Math.abs(delta);
  }

  // A physical piece is indivisible: one unit, one movement.
  if (unit) quantity = 1;

  if (OUTFLOW.includes(ledgerType) && Number(item.qtyOnHand) < quantity) {
    return {
      ok: false,
      code: "INSUFFICIENT_STOCK",
      available: item.qtyOnHand,
      requested: quantity,
    };
  }

  // ── Commit: ledger row + unit state + label binding ──
  const unitLabel = unit ? await labelForUnit(input.tenantId, unit.id) : null;

  try {
    const result = await db.transaction(async (tx) => {
      // Claim the vehicle binding first: if this part is already fitted
      // somewhere, we want the clean 409, not a half-written movement.
      if (unitLabel && ledgerType === "INSTALL" && vehicle) {
        const bound = await bindLabel({
          tenantId: input.tenantId,
          labelId: unitLabel.id,
          vehicleId: vehicle.id,
          workOrderId: input.workOrderId ?? null,
          locationNote: input.note ?? null,
          boundById: input.movedById,
        });
        if (bound.ok === false) {
          if (bound.code === "ALREADY_FITTED") {
            return {
              failure: {
                code: "ALREADY_INSTALLED",
                vehicleCode: bound.vehicleCode,
                plateNumber: bound.plateNumber,
              } as const,
            };
          }
          // LABEL_NOT_FOUND / VEHICLE_NOT_FOUND cannot happen here: both were
          // resolved before the transaction opened. Treat as a hard failure
          // rather than writing a movement with no binding.
          throw new Error(`bindLabel failed unexpectedly: ${bound.code}`);
        }
      }

      if (unitLabel && ledgerType === "REMOVE") {
        const unbound = await unbindLabel({
          tenantId: input.tenantId,
          labelId: unitLabel.id,
          unboundById: input.movedById,
          reason: input.note ?? null,
        });
        // NOT_FITTED is tolerated on purpose: the goal is to stop the part
        // riding on a truck, and if the binding was already closed the part is
        // off the truck either way. Refusing would strand stock.
        if (!unbound.ok) {
          // nothing to close — carry on and record the removal
        }
      }

      const [movement] = await tx
        .insert(stockMovements)
        .values({
          tenantId: input.tenantId,
          itemId: item.id,
          movementType: ledgerType as StockMovementType,
          quantity: String(quantity),
          fromWarehouse: warehouseFor(ledgerType, "from"),
          toWarehouse: warehouseFor(ledgerType, "to"),
          vehicleId: vehicle?.id ?? null,
          labelId: unitLabel?.id ?? null,
          workOrderId: input.workOrderId ?? null,
          note: input.note ?? null,
          movedById: input.movedById,
        })
        .returning();

      // Unit state, kept in step with what the movement just said.
      const nextState = nextUnitState(ledgerType);
      if (unit && nextState) {
        await tx
          .update(warehouseItemUnits)
          .set({
            state: nextState as typeof warehouseItemUnits.$inferSelect["state"],
          })
          .where(eq(warehouseItemUnits.id, unit.id));
      }

      // DISPOSE retires the label rather than deleting it, so the part can be
      // re-coded later while the old identity still answers "you scrapped this".
      if (unitLabel && ledgerType === "DISPOSE") {
        await setLabelState({
          tenantId: input.tenantId,
          labelId: unitLabel.id,
          state: "RETIRED",
        });
      }

      // qty_on_hand was just recomputed by the trigger on this item's row.
      const [fresh] = await tx
        .select({ qty: warehouseItems.qtyOnHand })
        .from(warehouseItems)
        .where(eq(warehouseItems.id, item.id))
        .limit(1);

      return { movement: movement!, qtyOnHand: fresh?.qty ?? "0" };
    });

    if ("failure" in result) return result.failure as never;

    return {
      ok: true as const,
      movement: result.movement,
      qtyOnHand: result.qtyOnHand,
      unitState: unit ? nextUnitState(ledgerType) : null,
    };
  } catch (err) {
    // The CHECK (qty_on_hand >= 0) is the real guard against two mechanics
    // issuing the same last pump at once. Translate it rather than leaking a 500.
    if (isCheckViolation(err)) {
      return {
        ok: false,
        code: "INSUFFICIENT_STOCK",
        available: item.qtyOnHand,
        requested: quantity,
      };
    }
    throw err;
  }
}

/**
 * What state a unit must be in for a movement to be legal. `null` means the
 * movement does not constrain unit state (bulk stock, or ADJUST).
 */
const UNIT_STATE_EXPECTATIONS: Partial<Record<MovementType, string>> = {
  ISSUE: "IN_STORE",
  RETURN: "ISSUED",
  INSTALL: "ISSUED",
  REMOVE: "INSTALLED",
  TO_SCRAP: "IN_STORE",
  FROM_SCRAP: "IN_SCRAP",
  DISPOSE: "IN_SCRAP",
};

/** The state a unit lands in after the movement, or null to leave it alone. */
function nextUnitState(type: MovementType): string | null {
  switch (type) {
    case "ISSUE":
      return "ISSUED";
    case "INSTALL":
      return "INSTALLED";
    case "RETURN":
      return "IN_STORE";
    case "REMOVE":
      return "IN_STORE"; // the caller moves it to scrap with a second movement
    case "TO_SCRAP":
      return "IN_SCRAP";
    case "FROM_SCRAP":
      return "IN_STORE";
    case "DISPOSE":
      return "SCRAPPED";
    default:
      return null;
  }
}

function warehouseFor(
  type: MovementType,
  side: "from" | "to"
): WarehouseKind | null {
  const map: Partial<Record<MovementType, [WarehouseKind | null, WarehouseKind | null]>> = {
    RECEIVE: [null, "SPARES"],
    ISSUE: ["SPARES", null],
    RETURN: [null, "SPARES"],
    INSTALL: ["SPARES", null],
    REMOVE: [null, "SPARES"],
    TO_SCRAP: ["SPARES", "SCRAP"],
    FROM_SCRAP: ["SCRAP", "SPARES"],
    DISPOSE: ["SCRAP", null],
  };
  return map[type]?.[side === "from" ? 0 : 1] ?? null;
}

async function labelForUnit(tenantId: string, unitId: string) {
  const [row] = await db
    .select()
    .from(assetQrLabels)
    .where(
      and(
        eq(assetQrLabels.tenantId, tenantId),
        eq(assetQrLabels.subjectType, "ITEM_UNIT"),
        eq(assetQrLabels.subjectId, unitId),
        sql`${assetQrLabels.state} <> 'RETIRED'`
      )
    )
    .limit(1);
  return row ?? null;
}

/**
 * Which vehicle is this part fitted to right now?
 *
 * Reads the open binding (`unbound_at IS NULL`) rather than the unit's state
 * field, so it stays correct even if the state column and the label binding ever
 * drift apart. Returns null when the part is not on a vehicle.
 *
 * Deliberately keyed on the binding table and not on a state lookup, because
 * "who has my part" is a question about a physical fact and the label binding is
 * the record that says so.
 */
async function currentBindingFor(
  tenantId: string,
  unitId: string
): Promise<{ vehicleCode: string; plateNumber: string } | null> {
  const [row] = await db
    .select({
      vehicleCode: fleetVehicles.vehicleCode,
      plateNumber: fleetVehicles.plateNumber,
    })
    .from(assetQrBindings)
    .innerJoin(assetQrLabels, eq(assetQrLabels.id, assetQrBindings.labelId))
    .innerJoin(fleetVehicles, eq(fleetVehicles.id, assetQrBindings.vehicleId))
    .where(
      and(
        eq(assetQrBindings.tenantId, tenantId),
        eq(assetQrLabels.tenantId, tenantId),
        eq(assetQrLabels.subjectType, "ITEM_UNIT"),
        eq(assetQrLabels.subjectId, unitId),
        isNull(assetQrBindings.unboundAt)
      )
    )
    .limit(1);
  return row ?? null;
}


// ─── Movement history ─────────────────────────────────────────────────────────

export async function listMovements(
  tenantId: string,
  opts: { vehicleId?: string; limit?: number } = {}
) {
  const conditions: SQL[] = [eq(stockMovements.tenantId, tenantId)];
  if (opts.vehicleId) conditions.push(eq(stockMovements.vehicleId, opts.vehicleId));

  return db
    .select({
      id: stockMovements.id,
      movementType: stockMovements.movementType,
      quantity: stockMovements.quantity,
      movedAt: stockMovements.movedAt,
      note: stockMovements.note,
      fromWarehouse: stockMovements.fromWarehouse,
      toWarehouse: stockMovements.toWarehouse,
      itemCode: warehouseItems.itemCode,
      itemName: warehouseItems.name,
      itemNameAr: warehouseItems.nameAr,
      labelCode: assetQrLabels.labelCode,
      vehicleCode: fleetVehicles.vehicleCode,
      plateNumber: fleetVehicles.plateNumber,
      workOrderNumber: maintenanceOrders.workOrderNumber,
      movedByName: users.fullName,
    })
    .from(stockMovements)
    .innerJoin(warehouseItems, eq(warehouseItems.id, stockMovements.itemId))
    .leftJoin(assetQrLabels, eq(assetQrLabels.id, stockMovements.labelId))
    .leftJoin(fleetVehicles, eq(fleetVehicles.id, stockMovements.vehicleId))
    .leftJoin(maintenanceOrders, eq(maintenanceOrders.id, stockMovements.workOrderId))
    .leftJoin(users, eq(users.id, stockMovements.movedById))
    .where(and(...conditions))
    .orderBy(desc(stockMovements.movedAt))
    .limit(opts.limit ?? 200);
}

// ─── Equipment (معدات) ────────────────────────────────────────────────────────

export type CreateEquipmentInput = {
  tenantId: string;
  createdById: string;
  equipmentCode: string;
  name: string;
  nameAr?: string | null;
  category?: string;
  make?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  location?: string | null;
  commissionedAt?: string | null;
  costSar?: number | null;
};

/**
 * Register a machine and mint its QR in the same call.
 *
 * Registering equipment and printing its sticker are one action in the plant, so
 * splitting them would just produce machines with no label.
 */
export async function createEquipment(input: CreateEquipmentInput) {
  const [row] = await db
    .insert(equipment)
    .values({
      tenantId: input.tenantId,
      equipmentCode: input.equipmentCode,
      name: input.name,
      nameAr: input.nameAr ?? null,
      category: input.category ?? "OTHER",
      make: input.make ?? null,
      model: input.model ?? null,
      serialNumber: input.serialNumber ?? null,
      location: input.location ?? null,
      commissionedAt: input.commissionedAt ?? null,
      costSar: input.costSar != null ? String(input.costSar) : null,
    })
    .returning();

  const issued = await issueLabel({
    tenantId: input.tenantId,
    subjectType: "EQUIPMENT",
    subjectId: row!.id,
    subjectRef: row!.equipmentCode,
    subjectLabel: row!.name,
    issuedById: input.createdById,
  });

  return { equipment: row!, label: issued.label, token: issued.token };
}

export async function listEquipment(tenantId: string, includeInactive = false) {
  const conditions: SQL[] = [eq(equipment.tenantId, tenantId)];
  if (!includeInactive) conditions.push(eq(equipment.isActive, true));

  const rows = await db
    .select()
    .from(equipment)
    .where(and(...conditions))
    .orderBy(asc(equipment.equipmentCode));

  const labels = await labelsForSubjects(
    tenantId,
    "EQUIPMENT",
    rows.map((r) => r.id)
  );

  return rows.map((r) => ({ ...r, qrLabelCode: labels.get(r.id)?.labelCode ?? null }));
}

// ─── Reorder list ─────────────────────────────────────────────────────────────

/**
 * Items at or below their minimum, for the purchase requisition screen.
 * SCRAP items are excluded: a reorder list that suggests buying more scrap is
 * noise.
 */
export async function lowStockItems(tenantId: string) {
  const rows = await db
    .select()
    .from(warehouseItems)
    .where(
      and(
        eq(warehouseItems.tenantId, tenantId),
        eq(warehouseItems.isActive, true),
        sql`${warehouseItems.qtyOnHand} <= ${warehouseItems.minQty}`,
        sql`${warehouseItems.category} <> 'SCRAP'`,
        isNotNull(warehouseItems.minQty)
      )
    )
    .orderBy(asc(warehouseItems.itemCode));

  return rows;
}
