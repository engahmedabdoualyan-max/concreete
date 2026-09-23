/**
 * ============================================================
 *  GET  /api/hr/broadcasts  — Announcements for me (any staff)
 *  POST /api/hr/broadcasts  — Publish (HR desk)
 * ============================================================
 *  Body: { title, body, audience?: ["DRIVER", ...] } (empty = all)
 *  RBAC: any authenticated user (GET, audience-filtered) · HR_WRITE (POST)
 * ============================================================
 */

import { NextRequest } from "next/server";
import {
  requireAuth,
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { listBroadcasts, createBroadcast } from "@/lib/services/hr-social.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;

  try {
    const rows = await listBroadcasts(auth.user.tenantId, auth.user.sub, auth.user.role);
    return successResponse({ broadcasts: rows }, `${rows.length} announcement(s)`);
  } catch (err) {
    console.error("[GET /api/hr/broadcasts]", err);
    return errorResponse("HR_ERROR", "Failed to load announcements", 500);
  }
}

const BroadcastSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  audience: z.array(z.string().max(30)).max(20).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = BroadcastSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid broadcast payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const created = await createBroadcast(auth.user.tenantId, auth.user.sub, parsed.data);
    return successResponse(created, "Announcement published", 201);
  } catch (err) {
    console.error("[POST /api/hr/broadcasts]", err);
    return errorResponse("HR_ERROR", "Publish failed", 500);
  }
}
