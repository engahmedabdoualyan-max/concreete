/**
 * ============================================================
 *  GET  /api/finance/zatca/config — Taxpayer config (no secrets)
 *  POST /api/finance/zatca/config — Save config (tokens encrypted)
 * ============================================================
 *  RBAC: FINANCE_READ (GET) · FINANCE_INVOICE_MANAGE (POST)
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { getZatcaConfig, saveZatcaConfig } from "@/lib/services/zatca.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_READ);
  if ("status" in auth) return auth;

  try {
    const config = await getZatcaConfig(auth.user.tenantId);
    return successResponse({ config }, "ZATCA config");
  } catch (err) {
    console.error("[GET /api/finance/zatca/config]", err);
    return errorResponse("ZATCA_ERROR", "Failed to load config", 500);
  }
}

const ConfigSchema = z.object({
  sellerName: z.string().max(200).optional(),
  vatNumber: z.string().max(50).optional(),
  street: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  branchName: z.string().max(100).optional(),
  env: z.enum(["simulation", "production"]).optional(),
  // Secrets: only overwritten when explicitly provided
  binaryToken: z.string().max(2000).optional(),
  secret: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_INVOICE_MANAGE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = ConfigSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid config payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    await saveZatcaConfig(auth.user.tenantId, parsed.data);
    const config = await getZatcaConfig(auth.user.tenantId);
    return successResponse({ config }, "ZATCA config saved");
  } catch (err) {
    console.error("[POST /api/finance/zatca/config]", err);
    return errorResponse("ZATCA_ERROR", "Failed to save config", 500);
  }
}
