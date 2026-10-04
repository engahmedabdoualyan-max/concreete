/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/warehouse/items — item cards for both warehouses
 * ============================================================
 *
 *  ENDPOINTS:
 *  GET  /api/warehouse/items?warehouse=SPARES|SCRAP|ALL — the stores list
 *  POST /api/warehouse/items                          — create a card (+ QR)
 *
 *  Creating an item card also prints its label identity, because a card with no
 *  QR is a card nobody can scan. The one-time `qrPayload` in the response is the
 *  only time the code exists in readable form.
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { isUniqueViolation } from "@/lib/db/pg-errors";
import { auditLogs } from "@/db/schema";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { buildQrPayload } from "@/lib/services/asset-qr.service";
import {
  createItem,
  listItems,
} from "@/lib/services/warehouse.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CreateItemSchema = z.object({
  itemCode: z
    .string()
    .trim()
    .min(2, "itemCode is too short")
    .max(40)
    .regex(/^[A-Za-z0-9._-]+$/, "itemCode may only contain letters, digits, dot, dash, underscore"),
  name: z.string().trim().min(2).max(160),
  nameAr: z.string().trim().max(160).optional().nullable(),
  category: z.enum(["SPARE_PART", "LUBRICANT", "CONSUMABLE", "SCRAP"]).optional(),
  defaultWarehouse: z.enum(["SPARES", "SCRAP"]).optional(),
  unit: z.string().trim().max(20).optional(),
  minQty: z.number().min(0).optional(),
  unitCostSar: z.number().min(0).optional(),
  oemPartNumber: z.string().trim().max(80).optional().nullable(),
  appliesToMake: z.string().trim().max(80).optional().nullable(),
  appliesToModel: z.string().trim().max(80).optional().nullable(),
  /** False for bulk oil/filters sold by the box; true for pumps, motors, boxes. */
  isSerialized: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.WAREHOUSE_READ);
  if ("status" in auth) return auth;

  const sp = req.nextUrl.searchParams;
  const warehouse = sp.get("warehouse") ?? "ALL";

  if (!["SPARES", "SCRAP", "ALL"].includes(warehouse)) {
    return errorResponse(
      "INVALID_WAREHOUSE",
      "warehouse must be SPARES, SCRAP or ALL.",
      400
    );
  }

  const items = await listItems({
    tenantId: auth.user.tenantId,
    warehouse: warehouse as "SPARES" | "SCRAP" | "ALL",
    search: sp.get("search") ?? undefined,
    category: sp.get("category") ?? undefined,
    lowStockOnly: sp.get("lowStock") === "1",
    includeInactive: sp.get("includeInactive") === "1",
  });

  return successResponse(items, `${items.length} item(s)`);
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.WAREHOUSE_WRITE);
  if ("status" in auth) return auth;

  const body = await req.json().catch(() => null);
  const parsed = CreateItemSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "INVALID_BODY",
      parsed.error.issues[0]?.message ?? "Invalid item.",
      400,
      parsed.error.flatten()
    );
  }

  try {
    const result = await createItem({
      tenantId: auth.user.tenantId,
      createdById: auth.user.sub,
      ...parsed.data,
    });

    await db.insert(auditLogs).values({
      userId: auth.user.sub,
      tenantId: auth.user.tenantId,
      action: "WAREHOUSE_ITEM_CREATED",
      entityType: "warehouse_items",
      entityId: result.item.id,
      newState: {
        itemCode: result.item.itemCode,
        name: result.item.name,
        category: result.item.category,
        defaultWarehouse: result.item.defaultWarehouse,
        isSerialized: result.item.isSerialized,
        cardLabelCode: result.cardLabel.labelCode,
      },
    });

    return successResponse(
      {
        item: result.item,
        qrLabelCode: result.cardLabel.labelCode,
        qrPayload: result.cardToken
          ? buildQrPayload(result.cardLabel.labelCode, result.cardToken)
          : null,
      },
      "Item created. Print its card QR now — the code cannot be recovered later.",
      201
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      return errorResponse(
        "ITEM_CODE_TAKEN",
        `Item code "${parsed.data.itemCode}" already exists in your plant.`,
        409,
        { constraint: (err as { constraint?: string }).constraint ?? null }
      );
    }
    throw err;
  }
}
