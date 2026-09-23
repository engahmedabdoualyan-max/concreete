/**
 * ============================================================
 *  PUT /api/rnd/issues/[issueId] — Update status / assignment /
 *  root cause / resolution (auto-stamps resolvedAt on RESOLVED)
 * ============================================================
 *  RBAC: RND_WRITE
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { updateExternalIssue } from "@/lib/services/rnd.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

const UpdateIssueSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  category: z.enum(["EQUIPMENT", "QUALITY", "SAFETY", "STAFF", "SUPPLIER", "OTHER"]).optional(),
  assignedToId: z.string().max(36).optional(),
  assignedToName: z.string().max(120).optional(),
  status: z.enum(["OPEN", "INVESTIGATING", "RESOLVING", "RESOLVED", "CLOSED"]).optional(),
  rootCause: z.string().max(5000).optional(),
  resolution: z.string().max(5000).optional(),
  relatedPlanId: z.string().max(36).optional(),
  relatedTaskId: z.string().max(36).optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.RND_WRITE);
  if ("status" in auth) return auth;

  const { issueId } = await params;
  if (!issueId || !UUID_RE.test(issueId)) {
    return errorResponse("INVALID_ISSUE_ID", "Issue ID must be a valid UUID", 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = UpdateIssueSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid issue payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const updated = await updateExternalIssue(
      auth.user.tenantId,
      issueId,
      auth.user.sub,
      parsed.data
    );
    if (!updated) return errorResponse("ISSUE_NOT_FOUND", "Issue not found", 404);
    return successResponse(updated, "Issue updated");
  } catch (err) {
    console.error("[PUT /api/rnd/issues/:id]", err);
    return errorResponse("RND_ISSUES_ERROR", "Failed to update issue", 500);
  }
}
