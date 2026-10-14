/**
 * ============================================================
 *  GET /api/recovery/backups — list a tenant's snapshots (newest first)
 * ============================================================
 *  Guards: RECOVERY_BACKUP permission + per-IP rate limit.
 *  Read-only — never touches the database.
 * ============================================================
 */

import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { checkNextRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { assertTenantId } from "@/lib/tenant";
import { isRecoveryConfigured, listBackups } from "@/lib/services/recovery.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isRecoveryConfigured()) {
    return errorResponse("RECOVERY_NOT_CONFIGURED", "Recovery snapshots are not configured on this server.", 503);
  }

  const ip = clientIpFromHeaders(req.headers);
  const rl = checkNextRateLimit(`recovery-list:${ip}`, 30, 60_000);
  if (!rl.allowed) {
    return errorResponse("RATE_LIMITED", `Too many requests. Retry in ${rl.retryAfterSeconds}s.`, 429);
  }

  const auth = await requirePermission(req, PERMISSIONS.RECOVERY_BACKUP);
  if ("status" in auth) return auth;

  let tenantId: string;
  try {
    tenantId = assertTenantId(auth.user.tenantId);
  } catch {
    return errorResponse("TENANT_CONTEXT_REQUIRED", "Tenant context is required.", 400);
  }

  const backups = await listBackups(tenantId);
  return successResponse({ backups });
}
