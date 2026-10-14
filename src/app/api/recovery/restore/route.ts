/**
 * ============================================================
 *  POST /api/recovery/restore — point-in-time restore of a snapshot
 * ============================================================
 *  Guards: RECOVERY_RESTORE permission + recovery password +
 *  explicit { confirmText: "RESTORE" } + per-IP rate limit (3/min).
 *  Restores ONLY the caller's own tenant, inside one transaction,
 *  and writes an audit record AFTER the restore commits.
 *
 *  ⚠️  Test on staging first. A restore overwrites current tenant rows
 *      with the snapshot's rows — take a fresh backup before restoring.
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
import {
  backupTenant,
  isRecoveryConfigured,
  restoreTenant,
  verifyRecoveryPassword,
} from "@/lib/services/recovery.service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const RestoreSchema = z.object({
  /** Snapshot file name from GET /api/recovery/backups (e.g. 20261014-060000.json) */
  file: z.string().min(5).max(32),
  /** Explicit confirmation string — guards against accidental restores */
  confirmText: z.literal("RESTORE"),
  recoveryPassword: z.string().min(1, "Recovery password is required"),
});

export async function POST(req: NextRequest) {
  if (!isRecoveryConfigured()) {
    return errorResponse("RECOVERY_NOT_CONFIGURED", "Recovery snapshots are not configured on this server.", 503);
  }

  const ip = clientIpFromHeaders(req.headers);
  const rl = checkNextRateLimit(`recovery-restore:${ip}`, 3, 60_000);
  if (!rl.allowed) {
    return errorResponse("RATE_LIMITED", `Too many requests. Retry in ${rl.retryAfterSeconds}s.`, 429);
  }

  const auth = await requirePermission(req, PERMISSIONS.RECOVERY_RESTORE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON.", 400);
  }
  const parsed = RestoreSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "CONFIRMATION_REQUIRED",
      'You must send { "confirmText": "RESTORE" } with the snapshot file to restore.',
      400,
      { fields: parsed.error.flatten().fieldErrors }
    );
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
    // Safety net first: snapshot the CURRENT state before overwriting it.
    const safety = await backupTenant(tenantId, auth.user.sub);
    const result = await restoreTenant(tenantId, parsed.data.file, auth.user.sub);
    try {
      await db.insert(auditLogs).values({
        tenantId,
        userId: auth.user.sub,
        action: "RECOVERY_RESTORE_COMPLETED",
        entityType: "recovery_snapshot",
        previousState: { safetyBackupSha256: safety.sha256, totalRows: safety.totalRows },
        newState: { file: parsed.data.file, snapshotAt: result.snapshotAt, totalRows: result.totalRows },
      });
    } catch {
      // Audit must never break the restore path.
    }
    return successResponse(
      { ...result, safetyBackup: safety.sha256 },
      "Tenant restored from snapshot. A safety backup of the pre-restore state was taken first."
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const code =
      message === "BACKUP_NOT_FOUND" || message === "CORRUPT_BACKUP" || message === "INVALID_BACKUP_FILE"
        ? 400
        : 500;
    return errorResponse("RESTORE_FAILED", message, code);
  }
}
