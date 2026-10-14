/**
 * ============================================================
 *  POST /api/recovery/backup — take a tenant recovery snapshot
 * ============================================================
 *  Guards: RECOVERY_BACKUP permission + recovery password +
 *  per-IP rate limit (5/min). Fails closed when the recovery
 *  hash is not configured. Additive only — never modifies data.
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { requirePermission } from "@/lib/auth/middleware";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";
import { checkNextRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";
import { assertTenantId } from "@/lib/tenant";
import { backupTenant, isRecoveryConfigured, verifyRecoveryPassword } from "@/lib/services/recovery.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const BackupSchema = z.object({
  recoveryPassword: z.string().min(1, "Recovery password is required"),
});

export async function POST(req: NextRequest) {
  if (!isRecoveryConfigured()) {
    return errorResponse("RECOVERY_NOT_CONFIGURED", "Recovery snapshots are not configured on this server.", 503);
  }

  const ip = clientIpFromHeaders(req.headers);
  const rl = checkNextRateLimit(`recovery-backup:${ip}`, 5, 60_000);
  if (!rl.allowed) {
    return errorResponse("RATE_LIMITED", `Too many requests. Retry in ${rl.retryAfterSeconds}s.`, 429);
  }

  const auth = await requirePermission(req, PERMISSIONS.RECOVERY_BACKUP);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON.", 400);
  }
  const parsed = BackupSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid request.", 400, {
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  if (!(await verifyRecoveryPassword(parsed.data.recoveryPassword))) {
    return errorResponse("INVALID_RECOVERY_PASSWORD", "Wrong recovery password.", 401);
  }

  let tenantId: string;
  try {
    tenantId = assertTenantId(auth.user.tenantId);
  } catch {
    return errorResponse("TENANT_CONTEXT_REQUIRED", "Tenant context is required.", 400);
  }

  try {
    const manifest = await backupTenant(tenantId, auth.user.sub);
    try {
      await db.insert(auditLogs).values({
        tenantId,
        userId: auth.user.sub,
        action: "RECOVERY_BACKUP_CREATED",
        entityType: "recovery_snapshot",
        newState: { totalRows: manifest.totalRows, sha256: manifest.sha256, tables: Object.keys(manifest.tables).length },
      });
    } catch {
      // Audit must never break the backup path.
    }
    const res = successResponse({ manifest }, "Recovery snapshot created.");
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("BACKUP_FAILED", message, 500);
  }
}
