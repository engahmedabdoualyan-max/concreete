/**
 * ============================================================
 *  PUT    /api/rnd/competitors/[id]  — Update a rival plant
 *  DELETE /api/rnd/competitors/[id]  — Soft-delete (keeps history)
 * ============================================================
 *  RBAC: RND_WRITE
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { updateCompetitor, deleteCompetitor } from "@/lib/services/rnd-competitor.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function badId() {
  return errorResponse("INVALID_COMPETITOR_ID", "Competitor ID must be a valid UUID", 400);
}

const UpdateCompetitorSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  city: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().max(200).optional(),
  website: z.string().max(300).optional(),
  notes: z.string().max(5000).optional(),
  isActive: z.boolean().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.RND_WRITE);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return badId();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = UpdateCompetitorSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid competitor payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const updated = await updateCompetitor(auth.user.tenantId, id, parsed.data);
    if (!updated) return errorResponse("COMPETITOR_NOT_FOUND", "Competitor not found", 404);
    return successResponse(updated, "Competitor updated");
  } catch (err) {
    console.error("[PUT /api/rnd/competitors/:id]", err);
    return errorResponse("RND_COMP_ERROR", "Failed to update competitor", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.RND_WRITE);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return badId();

  try {
    const ok = await deleteCompetitor(auth.user.tenantId, id);
    if (!ok) return errorResponse("COMPETITOR_NOT_FOUND", "Competitor not found", 404);
    return successResponse({ id }, "Competitor archived");
  } catch (err) {
    console.error("[DELETE /api/rnd/competitors/:id]", err);
    return errorResponse("RND_COMP_ERROR", "Failed to archive competitor", 500);
  }
}
