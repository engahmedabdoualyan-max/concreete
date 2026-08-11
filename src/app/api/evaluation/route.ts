/**
 * ============================================================
 *  GET  /api/evaluation  — Live plant performance rating (/#/evaluation)
 *  POST /api/evaluation  — Run evaluation and persist a snapshot
 * ============================================================
 *
 *  Query params (GET):
 *    ?windowHours=24    Rolling analysis window (1–168)
 *    ?history=true      Also return the last 30 persisted snapshots
 *
 *  RBAC: SUPER_ADMIN (full), FINANCE / DISPATCHER (read-only)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requireAnyPermission, requireRole } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  evaluatePlantPerformance,
  getEvaluationHistory,
} from "@/lib/services/evaluation.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAnyPermission(req, [
    PERMISSIONS.AUDIT_LOG_READ,
    PERMISSIONS.FINANCE_READ,
    PERMISSIONS.WORKSHOP_READ,
  ]);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const windowHours = Math.min(
    168,
    Math.max(1, parseInt(url.searchParams.get("windowHours") ?? "24"))
  );
  const includeHistory = url.searchParams.get("history") === "true";

  try {
    const evaluation = await evaluatePlantPerformance(windowHours, false);

    const payload: Record<string, unknown> = { evaluation };

    if (includeHistory) {
      payload.history = await getEvaluationHistory(30);
    }

    return successResponse(
      payload,
      `Plant rating: ${evaluation.overallScore}/100 (${evaluation.grade}) — ${evaluation.recommendations.length} recommendation(s).`
    );
  } catch (err) {
    console.error("[GET /api/evaluation]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("EVALUATION_ERROR", message, 500);
  }
}

/**
 * POST — Runs the evaluation and PERSISTS a snapshot row.
 * Intended to be called by a scheduled job (e.g. hourly cron).
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["SUPER_ADMIN"]);
  if ("status" in auth) return auth;

  let windowHours = 24;
  try {
    const body = (await req.json()) as { windowHours?: number };
    if (body?.windowHours) {
      windowHours = Math.min(168, Math.max(1, body.windowHours));
    }
  } catch {
    // Body is optional — default window applies
  }

  try {
    const evaluation = await evaluatePlantPerformance(windowHours, true);

    return successResponse(
      {
        evaluation,
        snapshotPersisted: true,
        socketBroadcast: {
          event: "evaluation:updated",
          rooms: ["admin-live-map", "dispatch", "workshop"],
          payload: {
            overallScore: evaluation.overallScore,
            grade: evaluation.grade,
            scores: evaluation.scores,
            criticalRecommendations: evaluation.recommendations.filter(
              (r) => r.severity === "CRITICAL"
            ).length,
            timestamp: evaluation.evaluatedAt,
          },
        },
      },
      `Evaluation snapshot stored. Plant rating: ${evaluation.overallScore}/100 (${evaluation.grade}).`,
      201
    );
  } catch (err) {
    console.error("[POST /api/evaluation]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("EVALUATION_ERROR", message, 500);
  }
}
