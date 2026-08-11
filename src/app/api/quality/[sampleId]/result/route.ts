/**
 * POST /api/quality/[sampleId]/result
 * Records a compressive strength test result for a cube specimen.
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { labTestResults, labTestSamples, mixDesigns, auditLogs } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

const RecordResultSchema = z.object({
  testResultId: z.string().uuid("Invalid test result ID"),
  measuredValue: z.number().positive("Measured strength must be positive"),
  notes: z.string().max(500).optional(),
  certificateUrl: z.string().url().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sampleId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.LAB_RECORD_STRENGTH);
  if ("status" in auth) return auth;

  const { sampleId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = RecordResultSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid result data", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  // Verify the test belongs to this sample
  const testRows = await db
    .select()
    .from(labTestResults)
    .where(
      and(
        eq(labTestResults.id, parsed.data.testResultId),
        eq(labTestResults.sampleId, sampleId),
        eq(labTestResults.tenantId, auth.user.tenantId)
      )
    )
    .limit(1);

  if (testRows.length === 0) {
    return errorResponse("NOT_FOUND", "Test result not found for this sample", 404);
  }

  const test = testRows[0];
  if (test.result !== "PENDING") {
    return errorResponse("ALREADY_RECORDED", "Test result has already been recorded", 409);
  }

  // Determine pass/fail
  const required = parseFloat(test.requiredMinimumValue ?? "0");
  let result: "PASS" | "FAIL" | "MARGINAL";

  if (parsed.data.measuredValue >= required) {
    result = "PASS";
  } else if (parsed.data.measuredValue >= required * 0.9) {
    result = "MARGINAL";
  } else {
    result = "FAIL";
  }

  await db
    .update(labTestResults)
    .set({
      measuredValue: parsed.data.measuredValue.toFixed(3),
      result,
      testedById: auth.user.sub,
      testedAt: new Date(),
      notes: parsed.data.notes,
      certificateUrl: parsed.data.certificateUrl,
      updatedAt: new Date(),
    })
    .where(eq(labTestResults.id, parsed.data.testResultId));

  // Alert if failure
  if (result === "FAIL") {
    await db.insert(auditLogs).values({
      userId: auth.user.sub,
      tenantId: test.tenantId,
      action: "STRENGTH_TEST_FAILED",
      entityType: "lab_test_results",
      entityId: parsed.data.testResultId,
      newState: {
        measuredValue: parsed.data.measuredValue,
        requiredValue: required,
        testType: test.testType,
        specimenCode: test.specimenCode,
      },
      socketEvent: "quality:strength_fail",
    });
  }

  return successResponse({
    testResultId: parsed.data.testResultId,
    specimenCode: test.specimenCode,
    testType: test.testType,
    measuredValue: parsed.data.measuredValue,
    requiredMinimumValue: required,
    result,
    variance: `${((parsed.data.measuredValue / required - 1) * 100).toFixed(1)}%`,
    alert:
      result === "FAIL"
        ? `⚠️ STRENGTH FAILURE: ${test.specimenCode} measured ${parsed.data.measuredValue} MPa against required ${required} MPa. Investigate.`
        : null,
  }, `Result recorded: ${result}`);
}
