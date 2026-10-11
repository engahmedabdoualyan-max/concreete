import { NextRequest } from "next/server";
import { db } from "@/db";
import { fleetReadiness, fleetVehicles, sites } from "@/db/schema";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { getReadinessSummary } from "@/lib/services/readiness.service";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  Daily fleet readiness roll-call (تقرير جاهزية التشغيل)
 *  GET  /api/fleet/readiness?date= — rows + per-type summary
 *  POST /api/fleet/readiness — dispatcher marks the day (FLEET_UPDATE)
 * ============================================================
 */
const StatusEnum = z.enum(["WORKING", "IDLE", "IN_WORKSHOP", "STORED"]);

function today(): string {
  return new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FLEET_READ);
  if ("status" in auth) return auth;
  const q = new URL(req.url).searchParams.get("date");
  const date = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : today();

  const fleet = await db
    .select({
      id: fleetVehicles.id,
      code: fleetVehicles.vehicleCode,
      plate: fleetVehicles.plateNumber,
      type: fleetVehicles.vehicleType,
    })
    .from(fleetVehicles)
    .where(and(eq(fleetVehicles.tenantId, auth.user.tenantId), eq(fleetVehicles.isActive, true)))
    .orderBy(fleetVehicles.vehicleCode);

  const marks = await db
    .select()
    .from(fleetReadiness)
    .where(and(eq(fleetReadiness.tenantId, auth.user.tenantId), eq(fleetReadiness.workDate, date)));
  const byV = new Map(marks.map((m) => [m.vehicleId, m]));

  // Carry-over: state recorded once persists until manually changed.
  // Today/future only — past dates show exactly what was recorded then.
  const carried = new Map<string, (typeof marks)[number]>();
  if (date >= today()) {
    const prev = await db
      .select()
      .from(fleetReadiness)
      .where(and(eq(fleetReadiness.tenantId, auth.user.tenantId), lt(fleetReadiness.workDate, date)))
      .orderBy(desc(fleetReadiness.workDate));
    for (const m of prev) {
      if (!byV.has(m.vehicleId) && !carried.has(m.vehicleId)) carried.set(m.vehicleId, m);
    }
  }

  const siteList = await db
    .select({ id: sites.id, code: sites.siteCode, name: sites.siteName })
    .from(sites)
    .where(and(eq(sites.tenantId, auth.user.tenantId), eq(sites.isActive, true)));

  const rows = fleet.map((v) => {
    const mark = byV.get(v.id) ?? carried.get(v.id);
    return {
      vehicleId: v.id,
      vehicleCode: v.code,
      plateNumber: v.plate,
      vehicleType: v.type,
      status: mark?.status ?? null,
      note: mark?.note ?? null,
      siteId: mark?.siteId ?? null,
    };
  });

  const { byType, byBranch } = await getReadinessSummary(auth.user.tenantId, date);
  return successResponse({ date, rows, byType, byBranch, sites: siteList }, `${rows.length} vehicle(s)`);
}

const MarkSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  marks: z
    .array(
      z.object({
        vehicleId: z.string().uuid(),
        status: StatusEnum,
        siteId: z.string().uuid().nullable().optional(),
        note: z.string().trim().max(200).optional(),
      })
    )
    .min(1)
    .max(500),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FLEET_UPDATE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = MarkSchema.safeParse(body);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Invalid readiness payload", 400);
  const date = parsed.data.date ?? today();

  // All vehicles must belong to the caller's tenant.
  const fleet = await db
    .select({ id: fleetVehicles.id })
    .from(fleetVehicles)
    .where(and(eq(fleetVehicles.tenantId, auth.user.tenantId), eq(fleetVehicles.isActive, true)));
  const ok = new Set(fleet.map((v) => v.id));
  const marks = parsed.data.marks.filter((m) => ok.has(m.vehicleId));
  if (!marks.length) return errorResponse("VALIDATION_ERROR", "لا مركبات صالحة", 400);

  for (const m of marks) {
    await db.execute(sql`
        INSERT INTO fleet_readiness (tenant_id, vehicle_id, work_date, status, site_id, note, reported_by_id)
        VALUES (${auth.user.tenantId}, ${m.vehicleId}, ${date}, ${m.status}, ${m.siteId ?? null}, ${m.note || null}, ${auth.user.sub})
        ON CONFLICT (vehicle_id, work_date) DO UPDATE SET
          status = EXCLUDED.status, site_id = EXCLUDED.site_id, note = EXCLUDED.note,
          reported_by_id = EXCLUDED.reported_by_id, updated_at = now()`
    );
  }
  return successResponse({ date, marked: marks.length }, `تم تسجيل جاهزية ${marks.length} مركبة`);
}
