/**
 * ============================================================
 *  GET  /api/rnd/competitors/[id]/products  — Their mixes & prices
 *  POST /api/rnd/competitors/[id]/products  — Record a rival mix+price
 * ============================================================
 *  RBAC: RND_READ (GET) · RND_WRITE (POST)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  listCompetitorProducts,
  createCompetitorProduct,
} from "@/lib/services/rnd-competitor.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function badId() {
  return errorResponse("INVALID_COMPETITOR_ID", "Competitor ID must be a valid UUID", 400);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.RND_READ);
  if ("status" in auth) return auth;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) return badId();

  try {
    const products = await listCompetitorProducts(auth.user.tenantId, id);
    return successResponse({ products }, `${products.length} product(s)`);
  } catch (err) {
    console.error("[GET /api/rnd/competitors/:id/products]", err);
    return errorResponse("RND_COMP_ERROR", "Failed to load products", 500);
  }
}

const CreateProductSchema = z.object({
  grade: z.string().min(1).max(60),
  productName: z.string().max(200).optional(),
  theirPriceSar: z.number().int().nonnegative(),
  ourMixDesignId: z.string().uuid().optional(),
  ourPriceSar: z.number().int().nonnegative(),
  extrasNote: z.string().max(300).optional(),
  observedAt: z.string().min(1).optional(),
  source: z.string().max(30).optional(),
  notes: z.string().max(2000).optional(),
});

export async function POST(
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

  const parsed = CreateProductSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid product payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const product = await createCompetitorProduct(
      auth.user.tenantId,
      auth.user.sub,
      { ...parsed.data, competitorId: id }
    );
    if (!product)
      return errorResponse("COMPETITOR_NOT_FOUND", "Competitor not found", 404);
    return successResponse(product, "Rival mix recorded", 201);
  } catch (err) {
    console.error("[POST /api/rnd/competitors/:id/products]", err);
    return errorResponse("RND_COMP_ERROR", "Failed to record mix", 500);
  }
}
