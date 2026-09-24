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
import { checkNextRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
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
  vatNumber: z
    .string()
    .trim()
    .max(50)
    .refine((value) => value === "" || /^3\d{13}3$/.test(value), {
      message: "VAT number must be 15 digits starting and ending with 3",
    })
    .optional(),
  street: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  branchName: z.string().max(100).optional(),
  env: z.enum(["sandbox", "simulation", "production"]).optional(),
  confirmProduction: z.boolean().optional(),
  // Secrets: only overwritten when explicitly provided
  binaryToken: z.string().max(2000).optional(),
  secret: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.FINANCE_INVOICE_MANAGE);
  if ("status" in auth) return auth;
  const rate = checkNextRateLimit(
    `zatca-config:${auth.user.tenantId}:${clientIpFromHeaders(req.headers)}`,
    20
  );
  if (!rate.allowed) {
    return errorResponse("RATE_LIMITED", "Too many ZATCA configuration requests", 429, {
      retryAfterSeconds: rate.retryAfterSeconds,
    });
  }

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

  const currentConfig = await getZatcaConfig(auth.user.tenantId);
  const targetEnv = parsed.data.env ?? currentConfig.env;
  if (targetEnv === "production" && parsed.data.confirmProduction !== true) {
    return errorResponse(
      "PRODUCTION_CONFIRMATION_REQUIRED",
      "Explicit production confirmation is required before saving this environment",
      409
    );
  }

  try {
    await saveZatcaConfig(auth.user.tenantId, parsed.data, auth.user.sub);
    const config = await getZatcaConfig(auth.user.tenantId);
    return successResponse({ config }, "ZATCA config saved");
  } catch (err) {
    console.error("[POST /api/finance/zatca/config]", err);
    return errorResponse("ZATCA_ERROR", "Failed to save config", 500);
  }
}
