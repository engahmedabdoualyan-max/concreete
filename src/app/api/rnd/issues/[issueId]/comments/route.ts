/**
 * ============================================================
 *  POST /api/rnd/issues/[issueId]/comments — Add a comment
 * ============================================================
 *  RBAC: RND_READ
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { addIssueComment } from "@/lib/services/rnd.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

const CommentSchema = z.object({
  content: z.string().min(1).max(2000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.RND_READ);
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

  const parsed = CommentSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid comment payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const comment = await addIssueComment(
      auth.user.tenantId,
      issueId,
      auth.user.sub,
      parsed.data.content
    );
    if (!comment) return errorResponse("ISSUE_NOT_FOUND", "Issue not found", 404);
    return successResponse(comment, "Comment added", 201);
  } catch (err) {
    console.error("[POST /api/rnd/issues/:id/comments]", err);
    return errorResponse("RND_ISSUES_ERROR", "Failed to add comment", 500);
  }
}
