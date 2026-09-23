/**
 * ============================================================
 *  GET    /api/auth/sso/providers      — List IdP bindings
 *  POST   /api/auth/sso/providers      — Register / update IdP
 *  DELETE /api/auth/sso/providers/[id] — Remove IdP binding
 * ============================================================
 *  Body: { id, label, issuer, clientId, clientSecret?, active? }
 *  Secrets are AES-encrypted; omitted secret keeps the previous one.
 *  RBAC: SYSTEM_SETTINGS
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission, errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import {
  listSsoProviders,
  saveSsoProvider,
  deleteSsoProvider,
} from "@/lib/services/sso.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.SYSTEM_SETTINGS);
  if ("status" in auth) return auth;

  try {
    const providers = await listSsoProviders(auth.user.tenantId);
    return successResponse({ providers }, `${providers.length} provider(s)`);
  } catch (err) {
    console.error("[GET /api/auth/sso/providers]", err);
    return errorResponse("SSO_ERROR", "Failed to list providers", 500);
  }
}

const ProviderSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
  issuer: z.string().url(),
  clientId: z.string().min(1).max(500),
  clientSecret: z.string().max(2000).optional(),
  active: z.boolean().optional().default(true),
});

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.SYSTEM_SETTINGS);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }

  const parsed = ProviderSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid provider payload", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    const saved = await saveSsoProvider(auth.user.tenantId, {
      ...parsed.data,
      active: parsed.data.active ?? true,
    });
    return successResponse(saved, "Identity provider saved", 201);
  } catch (err) {
    console.error("[POST /api/auth/sso/providers]", err);
    return errorResponse("SSO_ERROR", "Failed to save provider", 500);
  }
}
