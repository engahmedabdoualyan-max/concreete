/**
 * ============================================================
 *  GET /api/dispatch/board — the dispatcher's operational board
 * ============================================================
 *  WHY THIS EXISTS
 *  The dispatch screen in most ERPs is a list. The board answers the four
 *  questions a dispatcher actually asks during a shift, in one payload:
 *
 *    1. What must pour today, and is it covered?   (ordered vs assigned m³)
 *    2. What is running right now, and where?      (live trips + checkpoint)
 *    3. What is late?                              (delays, calculated here)
 *    4. What can I send next?                      (idle vehicles, no driver…)
 *
 *  DELAY DETECTION is the part competitors sell and nobody does properly:
 *  a trip that has been sitting at the same checkpoint longer than the
 *  expected time for that leg is flagged with the minutes it has been
 *  stalled, instead of leaving the dispatcher to notice.
 *
 *  Everything is read-only: the board never mutates state, so it is safe to
 *  poll every few seconds from a tablet on the plant floor.
 *
 *  QUERY
 *    date=YYYY-MM-DD  (default today)
 *    horizonDays=N    (default 2 — today plus the next two days)
 *    stalledMinutes=N (default 25 — when a trip counts as stalled)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import {
  orders,
  clients,
  deliverySites,
  mixDesigns,
  trips,
  fleetVehicles,
  users,
} from "@/db/schema";
import { and, eq, gte, lte, inArray, notInArray, sql, desc, type SQL } from "drizzle-orm";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/** Minutes a trip may sit at a checkpoint before it is called stalled. */
const STALLED_MINUTES = 25;
/** Minutes a pour may be late before it is called overdue. */
const POUR_GRACE_MINUTES = 60;

interface Alert {
  severity: "critical" | "warning" | "info";
  code: string;
  messageAr: string;
  ref?: string;
}

/** Expected leg times, used to decide whether a trip is behind. */
const CHECKPOINT_TARGET_MINUTES: Record<string, number> = {
  ARR_PLANT: 20,
  ARR_BSTC: 30,
  DEP_PLANT: 25,
  ARR_SITE: 45,
  POUR_START: 20,
  DEP_SITE: 40,
  RETURN_PLANT: 45,
};

const CHECKPOINT_AR: Record<string, string> = {
  ARR_PLANT: "وصل المصنع",
  ARR_BSTC: "تحت الخلاط",
  DEP_PLANT: "خرج من المصنع",
  ARR_SITE: "وصل الموقع",
  POUR_START: "بدأ الصب",
  DEP_SITE: "خرج من الموقع",
  RETURN_PLANT: "رجع للمصنع",
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const minutesSince = (date: Date | null | undefined) =>
  date ? Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 60000)) : null;

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.TRIP_READ);
  if ("status" in auth) return auth;
  const tenantId = auth.user.tenantId;

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  const horizonDays = Math.min(7, Math.max(0, Number(url.searchParams.get("horizonDays") ?? 2)));
  const stalledAfter = Math.max(5, Number(url.searchParams.get("stalledMinutes") ?? STALLED_MINUTES));

  const dayStart = dateParam ? new Date(`${dateParam}T00:00:00.000Z`) : new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + horizonDays);
  dayEnd.setUTCHours(23, 59, 59, 999);
  const now = new Date();

  const alerts: Alert[] = [];

  // ── orders due in the window, with their assigned loads ──────────────────
  const orderConditions: SQL[] = [
    eq(orders.tenantId, tenantId),
    gte(orders.scheduledDate, dayStart),
    lte(orders.scheduledDate, dayEnd),
    // `= ALL (...)` needs an array or a subquery, not a value list, so the
    // plain NOT IN form is used here.
    notInArray(orders.status, ["CANCELLED", "FINANCE_REJECTED", "DRAFT"]),
  ];

  const orderRows = await db
    .select({
      id: orders.id,
      number: orders.orderNumber,
      status: orders.status,
      volumeM3: sql<string>`CAST(${orders.totalVolumeM3} AS text)`,
      remainingM3: sql<string>`CAST(${orders.remainingVolumeM3} AS text)`,
      pourRate: sql<string>`COALESCE(CAST(${orders.requestedPourRateM3PerHour} AS text), '')`,
      scheduledDate: sql<string>`to_char(${orders.scheduledDate}::date, 'YYYY-MM-DD')`,
      scheduledTime: sql<string>`COALESCE(to_char(${orders.scheduledDate}, 'HH24:MI'), '')`,
      client: clients.companyName,
      site: deliverySites.siteName,
      city: deliverySites.city,
      mix: mixDesigns.designCode,
      grade: mixDesigns.gradeDescription,
      isBlacklisted: clients.isBlacklisted,
      creditLimit: clients.creditLimitSar,
      outstanding: clients.outstandingBalanceSar,
    })
    .from(orders)
    .innerJoin(clients, eq(orders.clientId, clients.id))
    .innerJoin(deliverySites, eq(orders.deliverySiteId, deliverySites.id))
    .innerJoin(mixDesigns, eq(orders.mixDesignId, mixDesigns.id))
    .where(and(...orderConditions))
    .orderBy(orders.scheduledDate)
    .limit(200);

  const orderIds = orderRows.map((o) => o.id);

  // Assigned and delivered volume per order, from the trips themselves.
  const tripAgg = orderIds.length
    ? await db
        .select({
          orderId: trips.orderId,
          tripsCount: sql<number>`COUNT(*)::int`,
          assignedM3: sql<string>`COALESCE(SUM(CAST(${trips.loadedVolumeM3} AS numeric)), 0)::text`,
          deliveredM3: sql<string>`COALESCE(SUM(COALESCE(CAST(${trips.confirmedVolumeM3} AS numeric), 0)), 0)::text`,
          activeCount: sql<number>`COUNT(*) FILTER (WHERE ${trips.isCompleted} = false AND ${trips.isCancelled} = false)::int`,
        })
        .from(trips)
        .where(and(eq(trips.tenantId, tenantId), inArray(trips.orderId, orderIds)))
        .groupBy(trips.orderId)
    : [];
  const aggByOrder = new Map(tripAgg.map((t) => [t.orderId, t]));

  // ── live trips ────────────────────────────────────────────────────────────
  const activeTrips = await db
    .select({
      id: trips.id,
      number: trips.tripNumber,
      orderId: trips.orderId,
      checkpoint: trips.currentCheckpoint,
      loadedM3: sql<string>`CAST(${trips.loadedVolumeM3} AS text)`,
      deliveredM3: sql<string>`CAST(${trips.confirmedVolumeM3} AS text)`,
      vehicle: fleetVehicles.vehicleCode,
      plate: fleetVehicles.plateNumber,
      vehicleStatus: fleetVehicles.currentStatus,
      driver: users.fullName,
      ticket: trips.deliveryTicketNumber,
      batchTempC: sql<string>`CAST(${trips.batchTempC} AS text)`,
      createdAt: trips.createdAt,
      updatedAt: trips.updatedAt,
    })
    .from(trips)
    .innerJoin(fleetVehicles, eq(trips.vehicleId, fleetVehicles.id))
    .innerJoin(users, eq(trips.driverId, users.id))
    .where(
      and(
        eq(trips.tenantId, tenantId),
        eq(trips.isCompleted, false),
        eq(trips.isCancelled, false)
      )
    )
    .orderBy(desc(trips.createdAt))
    .limit(150);

  const orderNumberById = new Map(orderRows.map((o) => [o.id, o.number]));

  const liveTrips = activeTrips.map((t) => {
    const ageAtCheckpoint = minutesSince(t.updatedAt);
    const target = CHECKPOINT_TARGET_MINUTES[String(t.checkpoint)] ?? 30;
    const stalled = ageAtCheckpoint !== null && ageAtCheckpoint > stalledAfter;
    const behind = ageAtCheckpoint !== null && ageAtCheckpoint > target;
    return {
      id: t.id,
      number: t.number,
      orderNumber: t.orderId ? orderNumberById.get(t.orderId) ?? null : null,
      checkpoint: t.checkpoint,
      checkpointAr: CHECKPOINT_AR[String(t.checkpoint)] ?? String(t.checkpoint),
      loadedM3: Number(t.loadedM3) || 0,
      deliveredM3: Number(t.deliveredM3) || 0,
      vehicle: t.vehicle,
      plate: t.plate,
      vehicleStatus: t.vehicleStatus,
      driver: t.driver,
      ticket: t.ticket,
      batchTempC: t.batchTempC ? Number(t.batchTempC) : null,
      minutesAtCheckpoint: ageAtCheckpoint,
      targetMinutes: target,
      stalled,
      behind,
    };
  });

  // ── fleet availability ───────────────────────────────────────────────────
  const fleetRows = await db
    .select({
      status: fleetVehicles.currentStatus,
      isExternal: fleetVehicles.isExternal,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(fleetVehicles)
    .where(and(eq(fleetVehicles.tenantId, tenantId), eq(fleetVehicles.isActive, true)))
    .groupBy(fleetVehicles.currentStatus, fleetVehicles.isExternal);

  const freeVehicle = (status: string) =>
    fleetRows.find((f) => f.status === status && !f.isExternal)?.count ?? 0;

  // ── assemble the order board and raise alerts ────────────────────────────
  const board = orderRows.map((o) => {
    const agg = o.id ? aggByOrder.get(o.id) : undefined;
    const remaining = Number(o.remainingM3) || 0;
    const total = Number(o.volumeM3) || 0;
    const assigned = agg ? Number(agg.assignedM3) || 0 : 0;
    const delivered = agg ? Number(agg.deliveredM3) || 0 : 0;
    const uncovered = round1(Math.max(0, remaining - assigned));
    const scheduledAt = new Date(`${o.scheduledDate}T00:00:00.000Z`);
    const dueToday = o.scheduledDate === dayStart.toISOString().slice(0, 10);
    const overdueMinutes = dueToday
      ? Math.round((now.getTime() - scheduledAt.getTime()) / 60000) - POUR_GRACE_MINUTES
      : 0;

    // ── alerts, most valuable first
    if (o.isBlacklisted) {
      alerts.push({
        severity: "critical",
        code: "CLIENT_BLACKLISTED",
        messageAr: `العميل «${o.client}» مُدرج في القائمة السوداء — لا ترسل`,
        ref: o.number,
      });
    }
    if (o.status === "CREDIT_HOLD") {
      alerts.push({
        severity: "critical",
        code: "CREDIT_HOLD",
        messageAr: `«${o.client}» محجوب ائتمانيًا (حد ${o.creditLimit} / عليه ${o.outstanding})`,
        ref: o.number,
      });
    }
    if (overdueMinutes > 0 && remaining > 0) {
      alerts.push({
        severity: "critical",
        code: "POUR_OVERDUE",
        messageAr: `صب «${o.client}» متأخر ${overdueMinutes} دقيقة ولم يُسلَّم بعد`,
        ref: o.number,
      });
    }
    if (dueToday && uncovered > 0 && remaining > 0) {
      alerts.push({
        severity: "warning",
        code: "VOLUME_UNCOVERED",
        messageAr: `«${o.client}» ناقصه ${uncovered} م³ بدون رحلات`,
        ref: o.number,
      });
    }
    if (o.status === "APPROVED" && dueToday && assigned === 0) {
      alerts.push({
        severity: "warning",
        code: "NOT_DISPATCHED",
        messageAr: `«${o.client}» معتمد ولم يُجدول أي رحل`,
        ref: o.number,
      });
    }

    return {
      id: o.id,
      number: o.number,
      status: o.status,
      client: o.client,
      site: o.site,
      city: o.city,
      mix: o.mix,
      grade: o.grade,
      date: o.scheduledDate,
      time: o.scheduledTime,
      totalM3: round1(total),
      remainingM3: round1(remaining),
      assignedM3: round1(assigned),
      deliveredM3: round1(delivered),
      uncoveredM3: uncovered,
      trips: agg?.tripsCount ?? 0,
      activeTrips: agg?.activeCount ?? 0,
      overdueMinutes: overdueMinutes > 0 ? overdueMinutes : 0,
      readyToDispatch:
        uncovered === 0 && freeVehicle("AVAILABLE") > 0 && o.status !== "CREDIT_HOLD",
    };
  });

  for (const t of liveTrips.filter((t) => t.stalled)) {
    alerts.push({
      severity: "warning",
      code: "TRIP_STALLED",
      messageAr: `الرحلة ${t.number} واقفة في «${t.checkpointAr}» من ${t.minutesAtCheckpoint} دقيقة`,
      ref: t.number,
    });
  }

  const idleVehicles = freeVehicle("AVAILABLE");
  if (idleVehicles > 0 && liveTrips.length === 0 && board.some((o) => o.uncoveredM3 > 0)) {
    alerts.push({
      severity: "info",
      code: "IDLE_FLEET",
      messageAr: `${idleVehicles} معدة متاحة و مفيش رحلات شغالة`,
    });
  }

  const severityRank = { critical: 0, warning: 1, info: 2 } as const;
  alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return successResponse({
    window: {
      from: dayStart.toISOString().slice(0, 10),
      to: dayEnd.toISOString().slice(0, 10),
    },
    summary: {
      orders: board.length,
      totalM3: round1(board.reduce((a, o) => a + o.totalM3, 0)),
      remainingM3: round1(board.reduce((a, o) => a + o.remainingM3, 0)),
      uncoveredM3: round1(board.reduce((a, o) => a + o.uncoveredM3, 0)),
      activeTrips: liveTrips.length,
      stalledTrips: liveTrips.filter((t) => t.stalled).length,
      deliveredTodayM3: round1(
        board.reduce((a, o) => a + o.deliveredM3, 0)
      ),
      idleVehicles,
      criticalAlerts: alerts.filter((a) => a.severity === "critical").length,
    },
    alerts,
    orders: board,
    trips: liveTrips,
    fleet: fleetRows.map((f) => ({
      status: f.status,
      isExternal: f.isExternal,
      count: f.count,
    })),
    generatedAt: new Date().toISOString(),
  });
}
