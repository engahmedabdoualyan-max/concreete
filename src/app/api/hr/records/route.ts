import { NextRequest } from "next/server";
import { db } from "@/db";
import {
  hrBroadcastReads,
  hrBroadcasts,
  hrCompanyDocs,
  hrCustody,
  hrDocuments,
  hrExpenseClaims,
  hrInvestigations,
  hrLeaveBalances,
  hrOvertime,
  hrPenalties,
  hrRequests,
  hrRewards,
  hrSeparations,
  hrVehicleLogs,
  hrViolations,
  hrPettyExpenses,
  hrPettyFunds,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  DELETE /api/hr/records?table=&id= — red-X removal (HR_WRITE)
 * ============================================================
 *  One tenant-scoped delete door for every HR operational table,
 *  instead of ten copy-pasted handlers. The table name comes from a
 *  fixed allow-list (never from raw user input), every delete is
 *  tenant-scoped, and child rows go first (broadcast reads, petty
 *  lines) so no orphans are left behind.
 */

const TABLES = {
  violations: hrViolations,
  penalties: hrPenalties,
  rewards: hrRewards,
  investigations: hrInvestigations,
  custody: hrCustody,
  overtime: hrOvertime,
  expenses: hrExpenseClaims,
  "vehicle-logs": hrVehicleLogs,
  requests: hrRequests,
  broadcasts: hrBroadcasts,
  documents: hrDocuments,
  "leave-balances": hrLeaveBalances,
  "company-docs": hrCompanyDocs,
  separations: hrSeparations,
  "petty-funds": hrPettyFunds,
} as const;

type TableKey = keyof typeof TABLES;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;
  const url = new URL(req.url);
  const table = url.searchParams.get("table") ?? "";
  const id = url.searchParams.get("id") ?? "";
  if (!(table in TABLES)) return errorResponse("INVALID_TABLE", "Unknown table", 400);
  if (!UUID_RE.test(id)) return errorResponse("INVALID_ID", "Invalid id", 400);

  const t = TABLES[table as TableKey] as typeof hrViolations;
  try {
    // Child rows first so FKs never block the delete.
    if (table === "broadcasts") {
      await db
        .delete(hrBroadcastReads)
        .where(eq(hrBroadcastReads.broadcastId, id));
    }
    if (table === "petty-funds") {
      await db
        .delete(hrPettyExpenses)
        .where(eq(hrPettyExpenses.fundId, id));
    }
    const [deleted] = await db
      .delete(t)
      .where(and(eq(t.id, id), eq(t.tenantId, auth.user.tenantId)))
      .returning({ id: t.id });
    if (!deleted) return errorResponse("NOT_FOUND", "Record not found", 404);
    return successResponse({ id: deleted.id }, "تم الحذف");
  } catch (err) {
    console.error("[DELETE /api/hr/records]", err);
    return errorResponse("HR_ERROR", "Delete failed", 500);
  }
}
