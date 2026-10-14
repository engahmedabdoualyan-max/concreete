/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/equipment — معدات: the plant's own machinery register
 * ============================================================
 *
 *  ENDPOINTS:
 *  GET  /api/equipment  — the register, each row with its QR
 *  POST /api/equipment  — register a machine and mint its QR in one call
 *
 *  Registering equipment and printing its sticker are one action in the plant,
 *  so they are one endpoint here. A machine registered without a label is a
 *  machine nobody can scan, which is the same as not registering it.
 *
 *  There was no register for plant machinery before this: batching plants were
 *  only production stations, and generators, compressors and crushers existed
 *  nowhere at all. This is that missing list.
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { isUniqueViolation } from "@/lib/db/pg-errors";
import { auditLogs, equipment } from "@/db/schema";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { createEquipment, listEquipment } from "@/lib/services/warehouse.service";
import { buildQrPayload } from "@/lib/services/asset-qr.service";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CreateEquipmentSchema = z.object({
  equipmentCode: z
    .string()
    .trim()
    .min(2, "equipmentCode is too short")
    .max(30)
    .regex(/^[A-Za-z0-9._-]+$/, "equipmentCode may only contain letters, digits, dot, dash, underscore"),
  name: z.string().trim().min(2).max(120),
  nameAr: z.string().trim().max(120).optional().nullable(),
  category: z
    .enum(["MIXER", "PUMP", "GENERATOR", "COMPRESSOR", "CRUSHER", "CONVEYOR", "OTHER"])
    .optional(),
  make: z.string().trim().max(80).optional().nullable(),
  model: z.string().trim().max(80).optional().nullable(),
  serialNumber: z.string().trim().max(80).optional().nullable(),
  location: z.string().trim().max(120).optional().nullable(),
  commissionedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "commissionedAt must be YYYY-MM-DD")
    .optional()
    .nullable(),
  costSar: z.number().min(0).optional().nullable(),
});

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.QR_SCAN);
  if ("status" in auth) return auth;

  const includeInactive = req.nextUrl.searchParams.get("includeInactive") === "1";
  const rows = await listEquipment(auth.user.tenantId, includeInactive);

  return successResponse(rows, `${rows.length} machine(s)`);
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.EQUIPMENT_WRITE);
  if ("status" in auth) return auth;

  const parsed = CreateEquipmentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(
      "INVALID_BODY",
      parsed.error.issues[0]?.message ?? "Invalid equipment.",
      400,
      parsed.error.flatten()
    );
  }

  try {
    const result = await createEquipment({
      tenantId: auth.user.tenantId,
      createdById: auth.user.sub,
      ...parsed.data,
    });

    await db.insert(auditLogs).values({
      userId: auth.user.sub,
      tenantId: auth.user.tenantId,
      action: "EQUIPMENT_REGISTERED",
      entityType: "equipment",
      entityId: result.equipment.id,
      newState: {
        equipmentCode: result.equipment.equipmentCode,
        name: result.equipment.name,
        category: result.equipment.category,
        serialNumber: result.equipment.serialNumber,
        labelCode: result.label.labelCode,
      },
    });

    return successResponse(
      {
        equipment: result.equipment,
        qrLabelCode: result.label.labelCode,
        qrPayload: result.token
          ? buildQrPayload(result.label.labelCode, result.token)
          : null,
      },
      "Equipment registered. Print its QR now — the code cannot be recovered later.",
      201
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Two different things can collide here — the printed code and the
      // manufacturer's serial — and they deserve different advice.
      //
      // Which one collided is decided by asking which value is actually a
      // duplicate, NOT by reading `err.constraint`: this schema declares its
      // uniqueness as bare unique INDEXES, so Postgres reports those violations
      // without a constraint name and the field is usually undefined. Guessing
      // from an absent name would blame the wrong field.
      const [codeClash, serialClash] = await Promise.all([
        parsed.data.equipmentCode
          ? db
              .select({ id: equipment.id })
              .from(equipment)
              .where(
                and(
                  eq(equipment.tenantId, auth.user.tenantId),
                  eq(equipment.equipmentCode, parsed.data.equipmentCode)
                )
              )
              .limit(1)
          : Promise.resolve([]),
        parsed.data.serialNumber
          ? db
              .select({ id: equipment.id })
              .from(equipment)
              .where(
                and(
                  eq(equipment.tenantId, auth.user.tenantId),
                  eq(equipment.serialNumber, parsed.data.serialNumber)
                )
              )
              .limit(1)
          : Promise.resolve([]),
      ]);

      const serialTaken = serialClash.length > 0;
      return errorResponse(
        serialTaken ? "SERIAL_TAKEN" : "EQUIPMENT_CODE_TAKEN",
        serialTaken
          ? `Serial "${parsed.data.serialNumber}" is already registered to another machine. A serial identifies one physical machine, so two machines cannot share it.`
          : `Equipment code "${parsed.data.equipmentCode}" already exists in your plant.`,
        409,
        {
          equipmentCodeClash: codeClash.length > 0,
          serialClash,
        }
      );
    }
    throw err;
  }
}