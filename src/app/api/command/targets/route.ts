import { NextRequest } from "next/server";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  requirePermission,
  successResponse,
  errorResponse,
} from "@/lib/auth/middleware";
import {
  PERMISSIONS,
  roleHasPermission,
} from "@/lib/auth/rbac";
import type { UserRole } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  GET /api/command/targets — the daily production goal
 *  PUT /api/command/targets — set it (plant owner only)
 * ============================================================
 *
 *  The command-center TV screen shows ONE big number: today's goal
 *  achievement % = actual / target, blended from concrete m³ and block
 *  units. The goal itself lives in tenants.settings.dailyTargets so no
 *  migration is needed; only SITE_WRITE roles (plant owner) may change it.
 */

const TargetsSchema = z.object({
  concreteM3: z.number().min(0).max(100000).default(0),
  blocks: z.number().int().min(0).max(10000000).default(0),
});

type Targets = z.infer<typeof TargetsSchema>;

async function readTargets(tenantId: string): Promise<Targets> {
  const rows = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  const raw = (rows[0]?.settings as Record<string, unknown> | null)?.dailyTargets;
  const parsed = TargetsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { concreteM3: 0, blocks: 0 };
}

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.TRIP_READ);
  if ("status" in auth) return auth;
  return successResponse({
    targets: await readTargets(auth.user.tenantId),
    canEdit: roleHasPermission(auth.user.role as UserRole, PERMISSIONS.SITE_WRITE),
  });
}

export async function PUT(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.SITE_WRITE);
  if ("status" in auth) return auth;
  const parsed = TargetsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "أرقام الهدف غير صالحة", 400);

  const rows = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, auth.user.tenantId));
  const current = (rows[0]?.settings as Record<string, unknown>) ?? {};
  await db
    .update(tenants)
    .set({ settings: { ...current, dailyTargets: parsed.data } })
    .where(eq(tenants.id, auth.user.tenantId));

  return successResponse({ targets: parsed.data }, "تم حفظ هدف اليوم");
}
