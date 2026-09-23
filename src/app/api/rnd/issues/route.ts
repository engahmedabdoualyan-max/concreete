/**
 * ============================================================
 *  GET  /api/rnd/issues[?status=]  — List off-plan factory issues
 *  POST /api/rnd/issues            — Report a new issue
 * ============================================================
 *  RBAC: RND_READ (GET) · RND_WRITE (POST)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { listExternalIssues, createExternalIssue } from "@/lib/services/rnd.service";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["OPEN", "INVESTIGATING", "RESOLVING", "RESOLVED", "CLOSED"] as const;

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.RND_READ);
  if ("status" in auth) return auth;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  if (status && !(VALID_STATUSES as readonly string[]).includes(status)) {
    return errorResponse(
      "INVALID_STATUS",
      `status must be one of: ${VALID_STATUSES.join(", ")}`,
      400
    );
  }

  try {
    const issues = await listExternalIssues(auth.user.tenantId, status ?? undefined);
    return successResponse({ issues }, `${issues.length} issue(s)`);
  } catch (err) {
    console.error("[GET /api/rnd/issues]", err);
    return errorResponse("RND_ISSUES_ERROR", "Failed to load issues", 500);
  }
}

const CreateIssueSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  category: z.enum(["EQUIPMENT", "QUALITY", "SAFETY", "STAFF", "SUPPLIER", "OTHER"]).optional(),
  assignedToId: z.string().uuid().optional(),
  assignedToName: z.string().max(120).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.RND_WRITE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = CreateIssueSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid issue payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const reporter = await db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, auth.user.sub))
      .limit(1);

    const issue = await createExternalIssue(
      auth.user.tenantId,
      auth.user.sub,
      reporter[0]?.fullName ?? "Unknown",
      parsed.data
    );
    return successResponse(issue, "Issue reported", 201);
  } catch (err) {
    console.error("[POST /api/rnd/issues]", err);
    return errorResponse("RND_ISSUES_ERROR", "Failed to report issue", 500);
  }
}
