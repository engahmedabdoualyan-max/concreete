/**
 * ============================================================
 *  GET /api/cron/recovery-backup — scheduled snapshots for ALL tenants
 * ============================================================
 *  Called by the platform scheduler (Vercel Cron). Auth: shared
 *  CRON_SECRET as `Authorization: Bearer <secret>`.
 *  Fails closed when CRON_SECRET or the recovery hash is missing.
 *
 *  Suggested schedule (Vercel Cron, Pro): every 6 hours
 *    "0 0,6,12,18 * * *"  →  worst-case loss ≈ 6h of data.
 *
 *  Each tenant snapshot is independent; one tenant's failure never
 *  blocks the others. Per-tenant audit rows are written best-effort.
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { errorResponse, successResponse } from "@/lib/auth/middleware";
import { backupTenant, isRecoveryConfigured, listTenantTables, mapLimit } from "@/lib/services/recovery.service";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

function cronSecret(): string | null {
  const configured = process.env.CRON_SECRET?.trim();
  if (!configured && process.env.NODE_ENV === "production") return null;
  return configured ?? null;
}

export async function GET(req: NextRequest) {
  if (!isRecoveryConfigured()) {
    return errorResponse("RECOVERY_NOT_CONFIGURED", "Recovery snapshots are not configured on this server.", 503);
  }
  const secret = cronSecret();
  const presented = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!secret || presented.length === 0 || presented !== secret) {
    return errorResponse("UNAUTHORIZED", "Invalid or missing cron secret.", 401);
  }

  let tenantIds: string[];
  try {
    const res = await db.execute(sql`SELECT id FROM "tenants" ORDER BY 1`);
    tenantIds = (res.rows as Array<{ id: string }>).map((r) => r.id).filter(Boolean);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse("TENANT_LIST_FAILED", message, 500);
  }

  const results: Array<{ tenantId: string; ok: boolean; totalRows?: number; sha256?: string; error?: string }> = [];
  // One shared table scan for all tenants; tenants back up concurrently
  // (bounded) so the whole run fits comfortably inside proxy timeouts.
  const sharedTables = await listTenantTables().catch(() => null as string[] | null);
  await mapLimit(tenantIds, 3, async (tenantId) => {
    try {
      const manifest = await backupTenant(tenantId, null, sharedTables ?? undefined);
      results.push({ tenantId, ok: true, totalRows: manifest.totalRows, sha256: manifest.sha256 });
      try {
        await db.insert(auditLogs).values({
          tenantId,
          userId: null,
          action: "RECOVERY_BACKUP_CREATED",
          entityType: "recovery_snapshot",
          newState: { via: "cron", totalRows: manifest.totalRows, sha256: manifest.sha256 },
        });
      } catch {
        // best-effort
      }
    } catch (err) {
      results.push({ tenantId, ok: false, error: err instanceof Error ? err.message : "Unknown error" });
    }
  });

  const failed = results.filter((r) => !r.ok);
  return successResponse(
    { tenants: results.length, succeeded: results.length - failed.length, failed: failed.map((f) => f.tenantId), results },
    failed.length === 0 ? "All tenant snapshots completed." : `${failed.length} tenant snapshot(s) failed.`
  );
}
