/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Geofence Attendance Service (Epic 12b)
 * ============================================================
 *
 *  Location-based attendance (dedicated-app parity):
 *   • ping() — mobile position fix → enter/exit evaluation:
 *       first zone entry of the day  = check-in  (حضور)
 *       exit after being inside       = check-out (انصراف, stamped
 *                                        with the LAST inside fix)
 *       re-entry after exit           = shift continues (checkout moves)
 *   • Zones are tenant work geofences (factory gate, yards, sites).
 *   • driverOvertimeReport() — per-driver trips + attendance hours
 *     with overtime minutes over a configurable daily threshold
 *     (default 8h) for الإضافي payroll evidence.
 * ============================================================
 */

import { db } from "@/db";
import {
  hrZones,
  hrAttendance,
  trips,
  users,
} from "@/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";

function toNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return NaN;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : NaN;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function todayISO(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

// ─── Zones ────────────────────────────────────────────────────────────────────

export async function listZones(tenantId: string) {
  return db
    .select()
    .from(hrZones)
    .where(eq(hrZones.tenantId, tenantId))
    .orderBy(hrZones.createdAt);
}

export async function createZone(
  tenantId: string,
  userId: string,
  input: { name: string; latitude: number; longitude: number; radiusM?: number }
) {
  const [created] = await db
    .insert(hrZones)
    .values({
      tenantId,
      name: input.name,
      latitude: String(input.latitude),
      longitude: String(input.longitude),
      radiusM: input.radiusM ?? 200,
      createdById: userId,
    })
    .returning();
  return created;
}

export async function deleteZone(tenantId: string, zoneId: string) {
  const deleted = await db
    .delete(hrZones)
    .where(and(eq(hrZones.id, zoneId), eq(hrZones.tenantId, tenantId)))
    .returning({ id: hrZones.id });
  return deleted.length > 0;
}

// ─── Ping → enter/exit ────────────────────────────────────────────────────────

export interface PingResult {
  inside: boolean;
  zoneId: string | null;
  zoneName: string | null;
  event: "CHECKED_IN" | "CHECKED_OUT" | "STILL_INSIDE" | "STILL_OUTSIDE" | "NO_ZONES";
  checkInAt: string | null;
  checkOutAt: string | null;
}

export async function ping(
  tenantId: string,
  userId: string,
  latitude: number,
  longitude: number,
  at: Date = new Date()
): Promise<PingResult> {
  const zones = await db
    .select()
    .from(hrZones)
    .where(and(eq(hrZones.tenantId, tenantId), eq(hrZones.isActive, true)));

  if (zones.length === 0) {
    return {
      inside: false, zoneId: null, zoneName: null, event: "NO_ZONES",
      checkInAt: null, checkOutAt: null,
    };
  }

  let insideZone: typeof zones[0] | null = null;
  for (const z of zones) {
    const d = haversineKm(latitude, longitude, toNum(z.latitude), toNum(z.longitude));
    if (Number.isFinite(d) && d * 1000 <= (z.radiusM ?? 200)) {
      insideZone = z;
      break;
    }
  }

  const day = todayISO(at);
  const rows = await db
    .select()
    .from(hrAttendance)
    .where(
      and(
        eq(hrAttendance.tenantId, tenantId),
        eq(hrAttendance.userId, userId),
        eq(hrAttendance.workDate, day)
      )
    )
    .limit(1);

  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const lat7 = (n: number) => n.toFixed(7);

  if (rows.length === 0) {
    if (!insideZone) {
      return {
        inside: false, zoneId: null, zoneName: null, event: "STILL_OUTSIDE",
        checkInAt: null, checkOutAt: null,
      };
    }
    const [created] = await db
      .insert(hrAttendance)
      .values({
        tenantId,
        userId,
        workDate: day,
        checkInAt: at,
        checkInLat: lat7(latitude),
        checkInLng: lat7(longitude),
        checkInZoneId: insideZone.id,
        lastInsideAt: at,
        lastInsideLat: lat7(latitude),
        lastInsideLng: lat7(longitude),
        source: "AUTO",
      })
      .returning();
    return {
      inside: true,
      zoneId: insideZone.id,
      zoneName: insideZone.name,
      event: "CHECKED_IN",
      checkInAt: iso(created.checkInAt),
      checkOutAt: null,
    };
  }

  const row = rows[0];
  if (insideZone) {
    const [updated] = await db
      .update(hrAttendance)
      .set({
        lastInsideAt: at,
        lastInsideLat: lat7(latitude),
        lastInsideLng: lat7(longitude),
        // Re-entry after an exit continues the shift — checkout follows
        // the latest exit, so clear a stale checkout while inside.
        checkOutAt: null,
        checkOutLat: null,
        checkOutLng: null,
        updatedAt: new Date(),
      })
      .where(eq(hrAttendance.id, row.id))
      .returning();
    return {
      inside: true,
      zoneId: insideZone.id,
      zoneName: insideZone.name,
      event: row.checkInAt ? "STILL_INSIDE" : "CHECKED_IN",
      checkInAt: iso(updated.checkInAt),
      checkOutAt: null,
    };
  }

  // Outside: if we were inside before, stamp checkout with the last inside fix
  if (row.lastInsideAt && !row.checkOutAt) {
    const [updated] = await db
      .update(hrAttendance)
      .set({
        checkOutAt: row.lastInsideAt,
        checkOutLat: row.lastInsideLat,
        checkOutLng: row.lastInsideLng,
        updatedAt: new Date(),
      })
      .where(eq(hrAttendance.id, row.id))
      .returning();
    return {
      inside: false,
      zoneId: null,
      zoneName: null,
      event: "CHECKED_OUT",
      checkInAt: iso(updated.checkInAt),
      checkOutAt: iso(updated.checkOutAt),
    };
  }

  return {
    inside: false,
    zoneId: null,
    zoneName: null,
    event: "STILL_OUTSIDE",
    checkInAt: iso(row.checkInAt),
    checkOutAt: iso(row.checkOutAt),
  };
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export interface AttendanceRow {
  userId: string;
  fullName: string;
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  minutesWorked: number | null;
  source: string;
}

export async function attendanceReport(
  tenantId: string,
  from: string,
  to: string,
  userId?: string
): Promise<AttendanceRow[]> {
  const conds = [
    eq(hrAttendance.tenantId, tenantId),
    gte(hrAttendance.workDate, from),
    lte(hrAttendance.workDate, to),
  ];
  if (userId) conds.push(eq(hrAttendance.userId, userId));

  const rows = await db
    .select({
      userId: hrAttendance.userId,
      fullName: users.fullName,
      workDate: hrAttendance.workDate,
      checkInAt: hrAttendance.checkInAt,
      checkOutAt: hrAttendance.checkOutAt,
      source: hrAttendance.source,
    })
    .from(hrAttendance)
    .innerJoin(users, eq(hrAttendance.userId, users.id))
    .where(and(...conds))
    .orderBy(hrAttendance.workDate, users.fullName);

  return rows.map((r) => ({
    userId: r.userId,
    fullName: r.fullName,
    workDate: r.workDate,
    checkInAt: r.checkInAt ? r.checkInAt.toISOString() : null,
    checkOutAt: r.checkOutAt ? r.checkOutAt.toISOString() : null,
    minutesWorked:
      r.checkInAt && r.checkOutAt
        ? Math.max(
            0,
            Math.round(
              (new Date(r.checkOutAt).getTime() - new Date(r.checkInAt).getTime()) / 60_000
            )
          )
        : null,
    source: r.source,
  }));
}

export interface DriverOvertimeRow {
  driverId: string;
  driverName: string;
  tripsCount: number;
  deliveredM3: number;
  attendanceMinutes: number | null;
  overtimeMinutes: number;
}

/**
 * Driver overtime evidence: trip counts + delivered volume joined with
 * geofence attendance hours. Overtime = minutes over `dailyThresholdH`
 * per worked day, summed across the window (default 8h).
 */
export async function driverOvertimeReport(
  tenantId: string,
  from: string,
  to: string,
  dailyThresholdH = 8
): Promise<DriverOvertimeRow[]> {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T23:59:59.999Z`);

  // Trips created in window, per driver (completed or not — counts work done)
  const tripRows = await db
    .select({
      driverId: trips.driverId,
      driverName: users.fullName,
      tripId: trips.id,
      volume: trips.loadedVolumeM3,
      isCompleted: trips.isCompleted,
    })
    .from(trips)
    .innerJoin(users, eq(trips.driverId, users.id))
    .where(
      and(
        eq(trips.tenantId, tenantId),
        gte(trips.createdAt, start),
        lte(trips.createdAt, end)
      )
    );

  // Attendance minutes per driver per day
  const att = await attendanceReport(tenantId, from, to);

  const byDriver = new Map<
    string,
    { name: string; trips: number; vol: number; days: Map<string, number> }
  >();

  for (const t of tripRows) {
    const cur = byDriver.get(t.driverId) ?? { name: t.driverName, trips: 0, vol: 0, days: new Map() };
    cur.trips += 1;
    const v = parseFloat(t.volume ?? "0");
    if (Number.isFinite(v)) cur.vol += v;
    byDriver.set(t.driverId, cur);
  }

  for (const a of att) {
    let cur = byDriver.get(a.userId);
    if (!cur) {
      cur = { name: a.fullName, trips: 0, vol: 0, days: new Map() };
      byDriver.set(a.userId, cur);
    }
    if (a.minutesWorked !== null) {
      cur.days.set(a.workDate, a.minutesWorked);
    }
  }

  const thresholdMin = dailyThresholdH * 60;
  const out: DriverOvertimeRow[] = [];
  for (const [driverId, d] of byDriver) {
    let attMin = 0;
    let otMin = 0;
    for (const mins of d.days.values()) {
      attMin += mins;
      otMin += Math.max(0, mins - thresholdMin);
    }
    out.push({
      driverId,
      driverName: d.name,
      tripsCount: d.trips,
      deliveredM3: Math.round(d.vol * 100) / 100,
      attendanceMinutes: d.days.size > 0 ? attMin : null,
      overtimeMinutes: otMin,
    });
  }

  out.sort((a, b) => b.overtimeMinutes - a.overtimeMinutes || b.tripsCount - a.tripsCount);
  return out;
}

export async function myAttendanceToday(tenantId: string, userId: string) {
  const rows = await db
    .select()
    .from(hrAttendance)
    .where(
      and(
        eq(hrAttendance.tenantId, tenantId),
        eq(hrAttendance.userId, userId),
        eq(hrAttendance.workDate, todayISO())
      )
    )
    .limit(1);
  return rows[0] ?? null;
}
