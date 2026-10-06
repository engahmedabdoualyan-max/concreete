import { NextRequest } from "next/server";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  requireAuth,
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/**
 * ============================================================
 *  GET /api/tenant/branding — own company's name + logo
 *  PUT /api/tenant/branding — set them (plant owner only)
 * ============================================================
 *  Reports and the HR page render THE VIEWER'S company (Almotwer sees
 *  Almotwer, Alkhaleej will see Alkhaleej). Logos are small images sent
 *  as data URIs (same pattern as HR documents, ~1 MB cap).
 */

const BrandingSchema = z.object({
  companyName: z.string().min(1).max(200).optional(),
  logoData: z.string().min(1).max(1_500_000).optional(),
  logoUrl: z.string().max(4000).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("status" in auth) return auth;
  const rows = await db
    .select({
      code: tenants.tenantCode,
      companyName: tenants.companyName,
      logoUrl: tenants.logoUrl,
    })
    .from(tenants)
    .where(eq(tenants.id, auth.user.tenantId));
  const t = rows[0];
  if (!t) return errorResponse("TENANT_NOT_FOUND", "Tenant not found", 404);
  return successResponse({ branding: t });
}

export async function PUT(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.SYSTEM_SETTINGS);
  if ("status" in auth) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = BrandingSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "Invalid branding payload", 400);
  }
  const d = parsed.data;
  if (!d.companyName && !d.logoData && !d.logoUrl) {
    return errorResponse("VALIDATION_ERROR", "Nothing to update", 400);
  }

  const patch: { companyName?: string; logoUrl?: string } = {};
  if (d.companyName) patch.companyName = d.companyName;
  if (d.logoUrl) {
    patch.logoUrl = d.logoUrl;
  } else if (d.logoData) {
    patch.logoUrl = d.logoData.startsWith("data:")
      ? d.logoData
      : `data:image/png;base64,${d.logoData}`;
  }

  const [updated] = await db
    .update(tenants)
    .set(patch)
    .where(eq(tenants.id, auth.user.tenantId))
    .returning({ code: tenants.tenantCode, companyName: tenants.companyName, logoUrl: tenants.logoUrl });
  return successResponse({ branding: updated }, "تم حفظ بيانات الشركة");
}
