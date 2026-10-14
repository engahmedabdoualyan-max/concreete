import { NextRequest } from "next/server";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  GET /api/hr/settings — which HR modules this company uses
 *  PUT /api/hr/settings — flip them (HR_WRITE, usually HR manager)
 * ============================================================
 *  Every optional HR unit (leave balances, vehicle log, overtime,
 *  expenses) is gated here, so each company runs the system it follows:
 *  a plant with no overtime culture simply leaves it off and its tab
 *  never renders. Stored in tenants.settings.hrModules — no migration.
 */

const MODULES = [
  "requests", "team", "attendance", "broadcasts", "payroll", "actions",
  "investigations", "custody", "vehicles", "deductions", "company", "petty",
  "leaveBalances", "vehicleLog", "overtime", "expenses", "org", "tree", "exit",
] as const;
type ModuleKey = (typeof MODULES)[number];

const SettingsSchema = z.object({
  modules: z.record(z.string(), z.boolean()),
});

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_READ);
  if ("status" in auth) return auth;
  const rows = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, auth.user.tenantId));
  const stored = ((rows[0]?.settings as Record<string, unknown>)?.hrModules ?? {}) as Record<string, boolean>;
  const modules: Record<string, boolean> = {};
  for (const m of MODULES) modules[m] = stored[m] ?? true;
  return successResponse({ modules });
}

export async function PUT(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.HR_WRITE);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = SettingsSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid settings payload", 400);
  }
  const clean: Record<string, boolean> = {};
  for (const m of MODULES) {
    if (typeof parsed.data.modules[m] === "boolean") clean[m] = parsed.data.modules[m];
  }

  const rows = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, auth.user.tenantId));
  const current = (rows[0]?.settings as Record<string, unknown>) ?? {};
  const prev = (current.hrModules as Record<string, boolean>) ?? {};
  await db
    .update(tenants)
    .set({ settings: { ...current, hrModules: { ...prev, ...clean } } })
    .where(eq(tenants.id, auth.user.tenantId));

  return successResponse({ modules: { ...prev, ...clean } }, "تم حفظ إعدادات الوحدات");
}
