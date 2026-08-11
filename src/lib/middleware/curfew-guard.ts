/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Curfew Guard Middleware — Heavy Vehicle Restriction Interceptor
 * ============================================================
 *
 *  BUSINESS RULES:
 *  ─────────────────────────────────────────────────────────
 *  Municipal heavy vehicle curfews in Al-Sharqia restrict
 *  concrete truck movements during peak traffic hours:
 *    • Morning rush: 06:00 – 09:00 (Sun–Thu)
 *    • Evening rush: 15:00 – 19:00 (Sun–Thu)
 *    • Friday prayer: 11:00 – 13:00 (Fri)
 *    • Weekend night: 22:00 – 05:00 (Sat)
 *
 *  This middleware is called BEFORE any scheduling operation:
 *    • Order scheduling onto smart calendar
 *    • Trip dispatch to a truck
 *    • Batch plant batch start
 *
 *  It checks:
 *    1. Global curfew_zones table
 *    2. Site-specific delivery_sites.trafficCurfewWindows
 *    3. Returns:
 *       - { blocked: true, zoneName, startTime, endTime } if BLOCKING curfew
 *       - { blocked: false, warnings: [] } if no curfew
 *       - { blocked: false, warnings: ['soft curfew'] } if non-blocking warning
 *
 *  Integration points:
 *    • POST /api/dispatch           — checks before creating trip
 *    • POST /api/orders (schedule)  — checks before scheduling order
 *    • POST /api/batching/start     — checks before batch production
 * ============================================================
 */

import { db } from "@/db";
import { curfewZones, deliverySites, orders } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CurfewCheckResult {
  /** True if a BLOCKING curfew is active */
  blocked: boolean;
  /** List of active curfew zones (blocking) */
  blockingZones: CurfewZoneMatch[];
  /** List of active curfew zones (warning-only, non-blocking) */
  warningZones: CurfewZoneMatch[];
  /** Site-specific curfew windows that are active */
  siteCurfewMatches: SiteCurfewMatch[];
  /** Aggregated message for the user */
  message: string;
  /** Earliest available slot (if blocked) */
  earliestAvailableAt?: Date;
}

export interface CurfewZoneMatch {
  zoneId: string;
  zoneName: string;
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
  reason: string | null;
  /** The specific day(s) that triggered the match */
  triggeredDay: number;
}

export interface SiteCurfewMatch {
  siteId: string;
  siteName: string;
  startTime: string;
  endTime: string;
  reason: string;
  days: number[];
}

// ─── Day Mapping (ISO 8601) ───────────────────────────────────────────────────

/**
 * Converts JS getDay() (0=Sunday) to our curfew zone convention (0=Sunday)
 * Both use the same mapping, but we document this for clarity.
 */
export function getDayOfWeekName(day: number): string {
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return names[day] ?? "Unknown";
}

// ─── Time Parsing ─────────────────────────────────────────────────────────────

/**
 * Parses "HH:MM" string into minutes since midnight.
 * Returns NaN if invalid.
 */
function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return NaN;
  return h * 60 + m;
}

/**
 * Returns true if currentTime (in minutes since midnight) falls within
 * the [startTime, endTime] range. Handles overnight ranges.
 */
function isTimeInRange(currentMinutes: number, startMinutes: number, endMinutes: number): boolean {
  if (startMinutes <= endMinutes) {
    // Normal range (e.g., 06:00-09:00)
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    // Overnight range (e.g., 22:00-05:00)
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}

// ─── Core Curfew Check ───────────────────────────────────────────────────────

/**
 * Checks curfew restrictions for a given date/time and optional delivery site.
 *
 * @param checkDateTime  The scheduled date/time to check
 * @param siteId         Optional: if set, also checks site-specific curfew windows
 * @returns CurfewCheckResult indicating if scheduling should be blocked
 */
export async function checkCurfewRestrictions(
  checkDateTime: Date,
  siteId?: string
): Promise<CurfewCheckResult> {
  const dayOfWeek = checkDateTime.getDay(); // 0=Sunday
  const timeStr = checkDateTime.toTimeString().slice(0, 5); // "HH:MM"
  const currentMinutes = parseTimeToMinutes(timeStr);

  const blockingZones: CurfewZoneMatch[] = [];
  const warningZones: CurfewZoneMatch[] = [];

  // 1. Check global curfew zones
  const allCurfews = await db
    .select()
    .from(curfewZones)
    .where(eq(curfewZones.isActive, true));

  for (const zone of allCurfews) {
    const activeDays = zone.activeDays as number[];
    if (!activeDays.includes(dayOfWeek)) continue;

    const startMin = parseTimeToMinutes(zone.startTime);
    const endMin = parseTimeToMinutes(zone.endTime);

    if (isNaN(startMin) || isNaN(endMin)) continue;

    if (isTimeInRange(currentMinutes, startMin, endMin)) {
      const match: CurfewZoneMatch = {
        zoneId: zone.id,
        zoneName: zone.zoneName,
        startTime: zone.startTime,
        endTime: zone.endTime,
        reason: zone.reason,
        triggeredDay: dayOfWeek,
      };

      if (zone.isBlocking) {
        blockingZones.push(match);
      } else {
        warningZones.push(match);
      }
    }
  }

  // 2. Check site-specific curfew windows (stored in delivery_sites as JSONB)
  const siteCurfewMatches: SiteCurfewMatch[] = [];

  if (siteId) {
    const siteRows = await db
      .select({
        id: deliverySites.id,
        siteName: deliverySites.siteName,
        trafficCurfewWindows: deliverySites.trafficCurfewWindows,
      })
      .from(deliverySites)
      .where(eq(deliverySites.id, siteId))
      .limit(1);

    if (siteRows.length > 0) {
      const windows = siteRows[0].trafficCurfewWindows ?? [];

      for (const window of windows) {
        if (!window.days.includes(getDayOfWeekName(dayOfWeek))) continue;

        const startMin = parseTimeToMinutes(window.startTime);
        const endMin = parseTimeToMinutes(window.endTime);

        if (isNaN(startMin) || isNaN(endMin)) continue;

        if (isTimeInRange(currentMinutes, startMin, endMin)) {
          siteCurfewMatches.push({
            siteId: siteRows[0].id,
            siteName: siteRows[0].siteName,
            startTime: window.startTime,
            endTime: window.endTime,
            reason: window.reason,
            days: window.days.map((d) => getDayIndexByName(d)),
          });
        }
      }
    }
  }

  // 3. Build result
  const blocked = blockingZones.length > 0 || siteCurfewMatches.length > 0;

  const messageParts: string[] = [];
  if (blockingZones.length > 0) {
    messageParts.push(
      `BLOCKED by ${blockingZones.length} curfew zone(s): ${blockingZones.map((z) => z.zoneName).join(", ")}`
    );
  }
  if (siteCurfewMatches.length > 0) {
    messageParts.push(
      `Site-specific restriction: ${siteCurfewMatches.map((s) => s.siteName).join(", ")}`
    );
  }
  if (warningZones.length > 0) {
    messageParts.push(
      `⚠️ WARNING: ${warningZones.length} non-blocking curfew zone(s) active: ${warningZones.map((z) => z.zoneName).join(", ")}`
    );
  }

  // 4. Calculate earliest available slot (if blocked)
  let earliestAvailableAt: Date | undefined;
  if (blocked) {
    earliestAvailableAt = calculateEarliestAvailable(
      checkDateTime,
      blockingZones,
      siteCurfewMatches
    );
  }

  return {
    blocked,
    blockingZones,
    warningZones,
    siteCurfewMatches,
    message: messageParts.length > 0 ? messageParts.join(". ") : "No curfew restrictions active.",
    earliestAvailableAt,
  };
}

// ─── Helper: Calculate Earliest Available Slot ────────────────────────────────

/**
 * Given a blocked time, finds the next available slot outside curfew windows.
 * Scans forward up to 48 hours.
 */
function calculateEarliestAvailable(
  fromDateTime: Date,
  blockingZones: CurfewZoneMatch[],
  siteCurfewMatches: SiteCurfewMatch[]
): Date {
  const candidate = new Date(fromDateTime);
  const maxIterations = 48 * 12; // 48 hours × 12 (5-min steps)

  for (let i = 0; i < maxIterations; i++) {
    candidate.setMinutes(candidate.getMinutes() + 5);

    const dayOfWeek = candidate.getDay();
    const currentMinutes =
      candidate.getHours() * 60 + candidate.getMinutes();

    const isBlocked =
      blockingZones.some((zone) => {
        if (!zone.triggeredDay) return false;
        if (zone.triggeredDay !== dayOfWeek) return false;
        return isTimeInRange(
          currentMinutes,
          parseTimeToMinutes(zone.startTime),
          parseTimeToMinutes(zone.endTime)
        );
      }) ||
      siteCurfewMatches.some((site) => {
        if (!site.days.includes(dayOfWeek)) return false;
        return isTimeInRange(
          currentMinutes,
          parseTimeToMinutes(site.startTime),
          parseTimeToMinutes(site.endTime)
        );
      });

    if (!isBlocked) {
      return candidate;
    }
  }

  // If no slot found within 48h, return null (handled by caller)
  return new Date(fromDateTime.getTime() + 48 * 60 * 60 * 1000);
}

// ─── Helper: Day Name → Index ─────────────────────────────────────────────────

function getDayIndexByName(name: string): number {
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const idx = names.indexOf(name);
  return idx >= 0 ? idx : -1;
}

// ─── Order Scheduling Interceptor ─────────────────────────────────────────────

/**
 * Intercepts order scheduling: checks curfew BEFORE allowing an order
 * to be placed on the smart calendar.
 *
 * If a blocking curfew is active at the scheduled time:
 *   - Reject the scheduling
 *   - Return the earliest available slot
 *
 * Used by:
 *   • POST /api/finance/approve (when approving, also schedules)
 *   • POST /api/dispatch (when creating trip)
 */
export async function interceptOrderScheduling(orderId: string): Promise<{
  allowed: boolean;
  curfewResult: CurfewCheckResult;
  suggestedReschedule?: Date;
}> {
  const orderRows = await db
    .select({
      id: orders.id,
      scheduledDate: orders.scheduledDate,
      deliverySiteId: orders.deliverySiteId,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (orderRows.length === 0) {
    throw new Error(`Order not found: ${orderId}`);
  }

  const order = orderRows[0];
  const curfewResult = await checkCurfewRestrictions(
    order.scheduledDate,
    order.deliverySiteId
  );

  return {
    allowed: !curfewResult.blocked,
    curfewResult,
    suggestedReschedule: curfewResult.earliestAvailableAt,
  };
}
