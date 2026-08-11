/**
 * ============================================================
 *  FIMTO SOFT — Concrete Plant ERP
 *  Multi-Tenant Isolation Utilities
 * ============================================================
 *
 * Every query must be scoped by tenantId from the verified JWT.
 * These helpers make tenant predicates explicit and auditable.
 */

import { sql, type SQL } from "drizzle-orm";

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: string;
  permissions: string[];
}

export function assertTenantId(tenantId: string | null | undefined): string {
  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
    throw new Error("TENANT_CONTEXT_REQUIRED: valid tenant_id is mandatory");
  }
  return tenantId;
}

/** Raw SQL predicate for tables with a tenant_id column. */
export function tenantSql(tenantId: string, alias?: string): SQL {
  assertTenantId(tenantId);
  return alias ? sql.raw(`${alias}.tenant_id = '${tenantId}'`) : sql`tenant_id = ${tenantId}`;
}

/**
 * Guard used by services before bulk analytics. It is intentionally strict:
 * SUPER_ADMIN can see all tenants only when explicitly passing `allowGlobal`.
 */
export function enforceTenantAnalytics(ctx: TenantContext, allowGlobal = false): string | null {
  if (ctx.role === "SUPER_ADMIN" && allowGlobal) return null;
  return assertTenantId(ctx.tenantId);
}
