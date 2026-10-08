import { NextRequest } from "next/server";
import { db } from "@/db";
import { fleetVehicles, gatePasses, mixDesigns } from "@/db/schema";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { isUniqueViolation } from "@/lib/db/pg-errors";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  Gate & scale tickets (البوابة والميزان)
 *  GET  /api/gate?date=&direction= — today's tickets (+ summary)
 *  POST /api/gate — open a ticket with the first weighing (WEIGHBRIDGE_RECORD)
 * ============================================================
 *  IN  = raw materials & supplies arriving (net proves what was delivered).
 *  OUT = concrete m³ and block units leaving (ticket proves the load left).
 */
const DirectionEnum = z.enum(["IN", "OUT"]);
const CategoryEnum = z.enum([
  "RAW_CEMENT",
  "RAW_SAND",
  "RAW_GRAVEL_10",
  "RAW_GRAVEL_20",
  "RAW_GRAVEL_40",
  "RAW_WATER",
  "RAW_ADMIXTURE",
  "SPARE_PART",
  "SUPPLY_OTHER",
  "CONCRETE",
  "BLOCK",
]);

const OpenSchema = z
  .object({
    direction: DirectionEnum,
    category: CategoryEnum,
    vehicleId: z.string().uuid().optional(),
    externalPlate: z.string().trim().max(30).optional(),
    partyName: z.string().trim().max(160).optional(),
    driverName: z.string().trim().max(120).optional(),
    entryWeightKg: z.number().positive().max(200000).optional(),
    exitWeightKg: z.number().positive().max(200000).optional(),
    quantity: z.number().nonnegative().max(1000000).optional(),
    quantityUnit: z.enum(["KG", "M3", "UNIT", "L"]).optional(),
    mixDesignId: z.string().uuid().optional(),
    orderRef: z.string().trim().max(60).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.vehicleId || d.externalPlate, {
    message: "vehicleId or externalPlate required",
    path: ["externalPlate"],
  })
  .refine((d) => d.entryWeightKg !== undefined || d.exitWeightKg !== undefined, {
    message: "at least one weighing required",
    path: ["entryWeightKg"],
  });

async function nextTicket(tenantId: string): Promise<string> {
  const r = await db.execute(sql`
    SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_no FROM 3) AS int)), 0) AS n
    FROM gate_passes WHERE tenant_id = ${tenantId} AND ticket_no LIKE 'G-%'
  `);
  const n = Number((r.rows as { n: string | number }[])[0]?.n ?? 0) + 1;
  return `G-${String(n).padStart(6, "0")}`;
}

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.WEIGHBRIDGE_READ);
  if ("status" in auth) return auth;
  const url = new URL(req.url);
  const date =
    url.searchParams.get("date") && /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("date")!)
      ? url.searchParams.get("date")!
      : new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  const direction = url.searchParams.get("direction");
  const from = new Date(`${date}T00:00:00+03:00`);
  const to = new Date(from.getTime() + 24 * 3600_000);

  const conds = [
    eq(gatePasses.tenantId, auth.user.tenantId),
    gte(gatePasses.createdAt, from),
    lte(gatePasses.createdAt, to),
  ];
  if (direction === "IN" || direction === "OUT")
    conds.push(eq(gatePasses.direction, direction));

  const rows = await db
    .select({
      id: gatePasses.id,
      ticketNo: gatePasses.ticketNo,
      direction: gatePasses.direction,
      category: gatePasses.category,
      vehicleCode: fleetVehicles.vehicleCode,
      plateNumber: fleetVehicles.plateNumber,
      externalPlate: gatePasses.externalPlate,
      partyName: gatePasses.partyName,
      driverName: gatePasses.driverName,
      entryWeightKg: gatePasses.entryWeightKg,
      exitWeightKg: gatePasses.exitWeightKg,
      netWeightKg: gatePasses.netWeightKg,
      quantity: gatePasses.quantity,
      quantityUnit: gatePasses.quantityUnit,
      orderRef: gatePasses.orderRef,
      status: gatePasses.status,
      createdAt: gatePasses.createdAt,
    })
    .from(gatePasses)
    .leftJoin(fleetVehicles, eq(fleetVehicles.id, gatePasses.vehicleId))
    .where(and(...conds))
    .orderBy(desc(gatePasses.createdAt))
    .limit(300);

  const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
  const summary = {
    inTickets: rows.filter((r) => r.direction === "IN").length,
    outTickets: rows.filter((r) => r.direction === "OUT").length,
    inKg: rows.filter((r) => r.direction === "IN").reduce((s, r) => s + num(r.netWeightKg), 0),
    concreteM3: rows
      .filter((r) => r.category === "CONCRETE")
      .reduce((s, r) => s + num(r.quantity), 0),
    blockUnits: rows
      .filter((r) => r.category === "BLOCK")
      .reduce((s, r) => s + num(r.quantity), 0),
  };
  return successResponse({ date, summary, tickets: rows }, `${rows.length} ticket(s)`);
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.WEIGHBRIDGE_RECORD);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = OpenSchema.safeParse(body);
  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors;
    const first = Object.values(f).flat()[0] ?? "Invalid ticket payload";
    return errorResponse("VALIDATION_ERROR", String(first), 400, { fields: f });
  }
  const d = parsed.data;

  if (d.vehicleId) {
    const v = await db
      .select({ id: fleetVehicles.id })
      .from(fleetVehicles)
      .where(and(eq(fleetVehicles.id, d.vehicleId), eq(fleetVehicles.tenantId, auth.user.tenantId)))
      .limit(1);
    if (!v[0]) return errorResponse("VEHICLE_NOT_FOUND", "المركبة غير موجودة", 404);
  }
  if (d.mixDesignId) {
    const m = await db
      .select({ id: mixDesigns.id })
      .from(mixDesigns)
      .where(and(eq(mixDesigns.id, d.mixDesignId), eq(mixDesigns.tenantId, auth.user.tenantId)))
      .limit(1);
    if (!m[0]) return errorResponse("MIX_NOT_FOUND", "الخلطة غير موجودة", 404);
  }

  const both = d.entryWeightKg !== undefined && d.exitWeightKg !== undefined;
  const net =
    d.entryWeightKg !== undefined && d.exitWeightKg !== undefined
      ? Math.abs(d.entryWeightKg - d.exitWeightKg)
      : null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const [row] = await db
        .insert(gatePasses)
        .values({
          tenantId: auth.user.tenantId,
          ticketNo: await nextTicket(auth.user.tenantId),
          direction: d.direction,
          category: d.category,
          vehicleId: d.vehicleId ?? null,
          externalPlate: d.externalPlate || null,
          partyName: d.partyName || null,
          driverName: d.driverName || null,
          entryWeightKg: d.entryWeightKg !== undefined ? String(d.entryWeightKg) : null,
          exitWeightKg: d.exitWeightKg !== undefined ? String(d.exitWeightKg) : null,
          netWeightKg: net !== null ? String(net) : null,
          quantity: d.quantity !== undefined ? String(d.quantity) : null,
          quantityUnit: d.quantityUnit ?? null,
          mixDesignId: d.mixDesignId ?? null,
          orderRef: d.orderRef || null,
          notes: d.notes || null,
          status: both ? "CLOSED" : "OPEN",
          operatorId: auth.user.sub,
          closedAt: both ? new Date() : null,
        })
        .returning({ id: gatePasses.id, ticketNo: gatePasses.ticketNo });
      return successResponse(row, `تم فتح التذكرة ${row.ticketNo}`, 201);
    } catch (e: unknown) {
      if (isUniqueViolation(e) && attempt === 0) continue; // ticket race: renumber once
      throw e;
    }
  }
  return errorResponse("TICKET_FAILED", "تعذر إصدار التذكرة", 500);
}
