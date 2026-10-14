/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/quality — Lab & Quality Control Module
 * ============================================================
 *
 *  ENDPOINTS:
 *  GET  /api/quality         — QC dashboard: pending tests, failing results
 *  POST /api/quality         — Record a new lab sample at pour point
 *
 *  TESTING PROTOCOL:
 *  ─────────────────────────────────────────────────────────
 *  1. Slump test → at site (fresh concrete)
 *  2. 3 cube specimens cast per trip
 *  3. 7-day compressive test (≥ 70% of target strength)
 *  4. 28-day final compressive test (≥ 100% of target strength)
 *
 *  ENVIRONMENT COMPENSATION OUTPUT:
 *  Each sample references the compensation that was applied,
 *  allowing correlation of slump variance with temp/humidity.
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import {
  labTestSamples,
  labTestResults,
  orders,
  trips,
  mixDesigns,
  users,
  auditLogs,
} from "@/db/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { z } from "zod";
import { issueLabel } from "@/lib/services/asset-qr.service";
import { addDays } from "date-fns";

export const dynamic = "force-dynamic";

// ─── GET /api/quality ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.LAB_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const resultFilter = url.searchParams.get("result"); // PENDING | PASS | FAIL | MARGINAL
  const testTypeFilter = url.searchParams.get("testType");

  // ── Pending Lab Tests (due soon) ──────────────────────────────────────────
  const pendingTests = await db
    .select({
      id: labTestResults.id,
      testType: labTestResults.testType,
      testDue: labTestResults.testDue,
      result: labTestResults.result,
      specimenCode: labTestResults.specimenCode,
      requiredMinimumValue: labTestResults.requiredMinimumValue,
      sampleNumber: labTestSamples.sampleNumber,
      sampleFreshSlumpCm: labTestSamples.freshSlumpCm,
      sampledAt: labTestSamples.sampledAt,
      orderNumber: orders.orderNumber,
      designCode: mixDesigns.designCode,
      targetStrengthMpa: mixDesigns.targetStrengthMpa,
      targetSlumpCm: mixDesigns.targetSlumpCm,
    })
    .from(labTestResults)
    .innerJoin(labTestSamples, eq(labTestResults.sampleId, labTestSamples.id))
    .innerJoin(orders, eq(labTestSamples.orderId, orders.id))
    .innerJoin(mixDesigns, eq(labTestSamples.mixDesignId, mixDesigns.id))
    .where(
      and(
        eq(labTestResults.tenantId, auth.user.tenantId),
        eq(labTestSamples.tenantId, auth.user.tenantId),
        eq(orders.tenantId, auth.user.tenantId),
        eq(mixDesigns.tenantId, auth.user.tenantId),
        eq(labTestResults.result, "PENDING")
      )
    )
    .orderBy(labTestResults.testDue)
    .limit(50);

  // ── Recent Failing Results ────────────────────────────────────────────────
  const failingResults = await db
    .select({
      id: labTestResults.id,
      testType: labTestResults.testType,
      testedAt: labTestResults.testedAt,
      measuredValue: labTestResults.measuredValue,
      requiredMinimumValue: labTestResults.requiredMinimumValue,
      result: labTestResults.result,
      notes: labTestResults.notes,
      sampleNumber: labTestSamples.sampleNumber,
      orderNumber: orders.orderNumber,
      designCode: mixDesigns.designCode,
    })
    .from(labTestResults)
    .innerJoin(labTestSamples, eq(labTestResults.sampleId, labTestSamples.id))
    .innerJoin(orders, eq(labTestSamples.orderId, orders.id))
    .innerJoin(mixDesigns, eq(labTestSamples.mixDesignId, mixDesigns.id))
    .where(
      and(
        eq(labTestResults.tenantId, auth.user.tenantId),
        eq(labTestSamples.tenantId, auth.user.tenantId),
        eq(orders.tenantId, auth.user.tenantId),
        eq(mixDesigns.tenantId, auth.user.tenantId),
        inArray(labTestResults.result, ["FAIL", "MARGINAL"])
      )
    )
    .orderBy(desc(labTestResults.testedAt))
    .limit(20);

  // ── Monthly QC Stats ──────────────────────────────────────────────────────
  const monthlyStats = await db
    .select({
      result: labTestResults.result,
      testType: labTestResults.testType,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(labTestResults)
    .where(
      and(
        eq(labTestResults.tenantId, auth.user.tenantId),
        sql`created_at >= date_trunc('month', NOW())`
      )
    )
    .groupBy(labTestResults.result, labTestResults.testType);

  // ── Pass Rate Calculation ─────────────────────────────────────────────────
  const totalCompleted = monthlyStats
    .filter((s) => s.result !== "PENDING")
    .reduce((sum, s) => sum + s.count, 0);
  const passCount = monthlyStats
    .filter((s) => s.result === "PASS")
    .reduce((sum, s) => sum + s.count, 0);
  const passRate =
    totalCompleted > 0 ? Math.round((passCount / totalCompleted) * 100) : 0;

  return successResponse({
    pendingTests,
    failingResults,
    monthlyStats,
    passRate: `${passRate}%`,
    totalCompleted,
  });
}

// ─── POST /api/quality ────────────────────────────────────────────────────────

const CreateSampleSchema = z.object({
  tripId: z.string().uuid("Invalid trip ID"),
  cubesCount: z.number().int().min(1).max(9).default(3),
  /** Slump measured at site (cm) */
  freshSlumpCm: z.number().min(0).max(30),
  sampleTempC: z.number().min(-10).max(60).optional(),
  sampleHumidityPct: z.number().min(0).max(100).optional(),
  labNotes: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.LAB_RECORD_SLUMP);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = CreateSampleSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid sample data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  // Fetch trip to get order and mix design
  const tripRows = await db
    .select({
      id: trips.id,
      tenantId: trips.tenantId,
      orderId: trips.orderId,
      mixDesignId: trips.mixDesignId,
      tripNumber: trips.tripNumber,
    })
    .from(trips)
    .where(
      and(
        eq(trips.id, parsed.data.tripId),
        eq(trips.tenantId, auth.user.tenantId)
      )
    )
    .limit(1);

  if (tripRows.length === 0) {
    return errorResponse("NOT_FOUND", "Trip not found", 404);
  }

  const trip = tripRows[0];

  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.id, trip.orderId),
        eq(orders.tenantId, auth.user.tenantId)
      )
    )
    .limit(1);

  if (!order) {
    return errorResponse("ORDER_NOT_FOUND", "Order not found", 404);
  }

  // Fetch mix design for targets
  const mixRows = await db
    .select()
    .from(mixDesigns)
    .where(
      and(
        eq(mixDesigns.id, trip.mixDesignId),
        eq(mixDesigns.tenantId, auth.user.tenantId)
      )
    )
    .limit(1);

  if (mixRows.length === 0) {
    return errorResponse("MIX_DESIGN_NOT_FOUND", "Mix design not found", 404);
  }

  const mixDesign = mixRows[0];
  const targetSlumpCm = parseFloat(mixDesign.targetSlumpCm ?? "12");
  const targetStrengthMpa = parseFloat(mixDesign.targetStrengthMpa ?? "25");

  // Determine slump result
  const slumpTolerance = 2.5; // ±2.5cm acceptable
  let freshSlumpResult: "PASS" | "FAIL" | "MARGINAL" = "PASS";
  if (parsed.data.freshSlumpCm < targetSlumpCm - slumpTolerance) {
    freshSlumpResult = "FAIL";
  } else if (parsed.data.freshSlumpCm < targetSlumpCm - 1) {
    freshSlumpResult = "MARGINAL";
  } else if (parsed.data.freshSlumpCm > targetSlumpCm + slumpTolerance * 2) {
    freshSlumpResult = "MARGINAL"; // Too wet
  }

  // Generate sample number
  const sampleCount = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(labTestSamples)
    .where(eq(labTestSamples.tenantId, auth.user.tenantId));
  const sampleSeq = (sampleCount[0].count + 1).toString().padStart(4, "0");
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const sampleNumber = `QC-${datePart}-${sampleSeq}`;

  // Create the sample record
  const [newSample] = await db
    .insert(labTestSamples)
    .values({
      sampleNumber,
      tenantId: auth.user.tenantId,
      tripId: parsed.data.tripId,
      orderId: trip.orderId,
      mixDesignId: trip.mixDesignId,
      sampledById: auth.user.sub,
      sampleTempC: parsed.data.sampleTempC?.toFixed(1),
      sampleHumidityPct: parsed.data.sampleHumidityPct?.toFixed(2),
      freshSlumpCm: parsed.data.freshSlumpCm.toFixed(1),
      freshSlumpResult,
      cubesCount: parsed.data.cubesCount,
      labNotes: parsed.data.labNotes,
      sampledAt: new Date(),
    })
    .returning();

  // Cube specimens are labelled at the moment they are cast, while the technician
  // still has the sample in hand. A label added later risks being stuck on the
  // wrong crate of cubes — which is the one mistake the 7- and 28-day crush tests
  // cannot survive.
  const sampleLabel = await issueLabel({
    tenantId: auth.user.tenantId,
    subjectType: "CONCRETE_SAMPLE",
    subjectId: newSample!.id,
    subjectRef: newSample!.sampleNumber,
    subjectLabel: `${newSample!.cubesCount} cubes`,
    issuedById: auth.user.sub,
  });

  await db.insert(auditLogs).values({
    userId: auth.user.sub,
    tenantId: auth.user.tenantId,
    action: "SAMPLE_QR_ISSUED",
    entityType: "lab_test_samples",
    entityId: newSample!.id,
    newState: {
      sampleNumber: newSample!.sampleNumber,
      labelCode: sampleLabel.label.labelCode,
    },
  });

  const now = new Date();

  // Auto-create the scheduled test result rows
  const testSchedule: { type: "COMPRESSIVE_7DAY" | "COMPRESSIVE_28DAY"; daysAhead: number; minMpa: number }[] = [
    { type: "COMPRESSIVE_7DAY", daysAhead: 7, minMpa: targetStrengthMpa * 0.7 },
    { type: "COMPRESSIVE_28DAY", daysAhead: 28, minMpa: targetStrengthMpa },
  ];

  const createdTests = [];

  for (let i = 0; i < parsed.data.cubesCount; i++) {
    const cubeCode = `${sampleNumber}-C${(i + 1).toString().padStart(2, "0")}`;

    for (const schedule of testSchedule) {
      const [newTest] = await db
        .insert(labTestResults)
        .values({
          sampleId: newSample.id,
          tenantId: auth.user.tenantId,
          testType: schedule.type,
          testDue: addDays(now, schedule.daysAhead),
          requiredMinimumValue: schedule.minMpa.toFixed(2),
          result: "PENDING",
          specimenCode: cubeCode,
        })
        .returning();

      createdTests.push(newTest);
    }
  }

  // Slump failure alert
  if (freshSlumpResult === "FAIL") {
    await db.insert(auditLogs).values({
      userId: auth.user.sub,
      tenantId: auth.user.tenantId,
      action: "SLUMP_TEST_FAILED",
      entityType: "lab_test_samples",
      entityId: newSample.id,
      newState: {
        sampleNumber,
        freshSlumpCm: parsed.data.freshSlumpCm,
        targetSlumpCm,
        tripNumber: trip.tripNumber,
      },
      socketEvent: "quality:slump_fail",
    });
  }

  return successResponse(
    {
      sampleId: newSample.id,
      sampleNumber,
      freshSlumpCm: parsed.data.freshSlumpCm,
      targetSlumpCm,
      freshSlumpResult,
      cubesCount: parsed.data.cubesCount,
      scheduledTests: createdTests.map((t) => ({
        id: t.id,
        testType: t.testType,
        testDue: t.testDue,
        specimenCode: t.specimenCode,
        requiredMinMpa: t.requiredMinimumValue,
      })),
      slumpWarning:
        freshSlumpResult !== "PASS"
          ? `⚠️ SLUMP ${freshSlumpResult}: Measured ${parsed.data.freshSlumpCm}cm, target ${targetSlumpCm}cm. Investigate mix design and transit conditions.`
          : null,
      socketBroadcast:
        freshSlumpResult === "FAIL"
          ? {
              event: "quality:slump_fail",
              rooms: ["lab", "dispatch", "admin"],
              payload: { sampleNumber, tripId: parsed.data.tripId, freshSlumpCm: parsed.data.freshSlumpCm },
            }
          : null,
    },
    `Sample ${sampleNumber} recorded. ${createdTests.length} compressive strength tests scheduled.`,
    201
  );
}
