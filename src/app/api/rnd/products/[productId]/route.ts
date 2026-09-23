/**
 * ============================================================
 *  PUT    /api/rnd/products/[productId]  — Update a rival mix row
 *  DELETE /api/rnd/products/[productId]  — Remove a rival mix row
 * ============================================================
 *  RBAC: RND_WRITE
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  updateCompetitorProduct,
  deleteCompetitorProduct,
} from "@/lib/services/rnd-competitor.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function badId() {
  return errorResponse("INVALID_PRODUCT_ID", "Product ID must be a valid UUID", 400);
}

const UpdateProductSchema = z.object({
  grade: z.string().min(1).max(60).optional(),
  productName: z.string().max(200).optional(),
  theirPriceSar: z.number().int().nonnegative().optional(),
  ourMixDesignId: z.string().max(36).optional(),
  ourPriceSar: z.number().int().nonnegative().optional(),
  extrasNote: z.string().max(300).optional(),
  observedAt: z.string().min(1).optional(),
  source: z.string().max(30).optional(),
  notes: z.string().max(2000).optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.RND_WRITE);
  if ("status" in auth) return auth;

  const { productId } = await params;
  if (!productId || !UUID_RE.test(productId)) return badId();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = UpdateProductSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid product payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const updated = await updateCompetitorProduct(
      auth.user.tenantId,
      productId,
      parsed.data
    );
    if (!updated) return errorResponse("PRODUCT_NOT_FOUND", "Product not found", 404);
    return successResponse(updated, "Rival mix updated");
  } catch (err) {
    console.error("[PUT /api/rnd/products/:id]", err);
    return errorResponse("RND_COMP_ERROR", "Failed to update mix", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const auth = await requirePermission(req, PERMISSIONS.RND_WRITE);
  if ("status" in auth) return auth;

  const { productId } = await params;
  if (!productId || !UUID_RE.test(productId)) return badId();

  try {
    const ok = await deleteCompetitorProduct(auth.user.tenantId, productId);
    if (!ok) return errorResponse("PRODUCT_NOT_FOUND", "Product not found", 404);
    return successResponse({ id: productId }, "Rival mix removed");
  } catch (err) {
    console.error("[DELETE /api/rnd/products/:id]", err);
    return errorResponse("RND_COMP_ERROR", "Failed to remove mix", 500);
  }
}
