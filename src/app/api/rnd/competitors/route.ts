/**
 * ============================================================
 *  GET  /api/rnd/competitors  — List rival plants
 *  POST /api/rnd/competitors  — Register a rival plant
 * ============================================================
 *  RBAC: RND_READ (GET) · RND_WRITE (POST)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { listCompetitors, createCompetitor } from "@/lib/services/rnd-competitor.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.RND_READ);
  if ("status" in auth) return auth;

  try {
    const competitors = await listCompetitors(auth.user.tenantId);
    return successResponse({ competitors }, `${competitors.length} competitor(s)`);
  } catch (err) {
    console.error("[GET /api/rnd/competitors]", err);
    return errorResponse("RND_COMP_ERROR", "Failed to load competitors", 500);
  }
}

const CreateCompetitorSchema = z.object({
  name: z.string().min(1).max(200),
  city: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().max(200).optional(),
  website: z.string().max(300).optional(),
  notes: z.string().max(5000).optional(),
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

  const parsed = CreateCompetitorSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid competitor payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const competitor = await createCompetitor(
      auth.user.tenantId,
      auth.user.sub,
      parsed.data
    );
    return successResponse(competitor, "Competitor registered", 201);
  } catch (err) {
    console.error("[POST /api/rnd/competitors]", err);
    return errorResponse("RND_COMP_ERROR", "Failed to register competitor", 500);
  }
}
