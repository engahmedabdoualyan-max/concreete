/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  /api/workspace/summary — Cross-tenant workspace summary
 * ============================================================
 *
 *  SUPER_ADMIN only. Aggregates every tenant's website workspace +
 *  ERP-native counts so the website's MultiPlant / Admin pages and
 *  live-position feeds work against the unified database.
 *
 *  GET /api/workspace/summary
 * ============================================================
 */

import { NextRequest } from "next/server";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { sql } from "drizzle-orm";
import { requireRole } from "@/lib/auth/middleware";
import { successResponse } from "@/lib/auth/middleware";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["SUPER_ADMIN"]);
  if ("status" in auth) return auth;

  const tenantsRows = await db
    .select({
      id: tenants.id,
      tenantCode: tenants.tenantCode,
      companyName: tenants.companyName,
      primaryPlantName: tenants.primaryPlantName,
      settings: tenants.settings,
    })
    .from(tenants);

  const out: any[] = [];
  for (const t of tenantsRows) {
    const workspace = await db.execute(
      sql`SELECT collection, data FROM website_workspace WHERE tenant_id = ${t.id}`
    );
    const blobs: Record<string, any> = {};
    for (const row of workspace.rows as any[]) {
      blobs[row.collection] = row.data;
    }
    const trips = Array.isArray(blobs.trips) ? blobs.trips : [];
    const orders = Array.isArray(blobs.orders) ? blobs.orders : [];
    const payments = Array.isArray(blobs.payments) ? blobs.payments : [];
    const qc = Array.isArray(blobs.qcRecords) ? blobs.qcRecords : [];
    const live = Array.isArray(blobs.livePositions) ? blobs.livePositions : [];

    // ERP-native counts (real mobile/system data)
    const erp = await db.execute(sql`
      SELECT
        (SELECT count(*) FROM orders o WHERE o.tenant_id = ${t.id}) AS orders,
        (SELECT count(*) FROM trips tr WHERE tr.tenant_id = ${t.id}) AS trips,
        (SELECT count(*) FROM clients c WHERE c.tenant_id = ${t.id}) AS clients,
        (SELECT count(*) FROM fleet_vehicles fv WHERE fv.tenant_id = ${t.id}) AS vehicles
    `);

    out.push({
      tenantId: t.id,
      tenantCode: t.tenantCode,
      companyName: t.companyName,
      plantName: (t.settings as any)?.plantName || t.primaryPlantName || t.companyName,
      country: (t.settings as any)?.country || "—",
      city: (t.settings as any)?.city || "—",
      workspaceTrips: trips.length,
      workspaceOrders: orders.length,
      workspacePayments: payments.length,
      workspaceQc: qc.length,
      livePositions: live,
      trips: (erp.rows[0] as any).trips,
      orders: (erp.rows[0] as any).orders,
      clients: (erp.rows[0] as any).clients,
      vehicles: (erp.rows[0] as any).vehicles,
      settings: (t.settings as any)?.workshopConfig ?? null,
      profile: blobs.plantProfile ?? null,
    });
  }

  return successResponse({ tenants: out, total: out.length });
}
