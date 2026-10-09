import { NextRequest } from "next/server";
import { db } from "@/db";
import { gateCamera } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import {
  requirePermission,
  errorResponse,
  successResponse,
} from "@/lib/auth/middleware";
import { PERMISSIONS } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

/** POST /api/gate/camera/unlock — open the settings panel (admin password). */
export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, PERMISSIONS.WEIGHBRIDGE_READ);
  if ("status" in auth) return auth;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("INVALID_JSON", "Request body must be valid JSON", 400);
  }
  const parsed = z.object({ password: z.string().min(1).max(100) }).safeParse(body);
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "Invalid payload", 400);
  const [row] = await db
    .select({ adminHash: gateCamera.adminHash })
    .from(gateCamera)
    .where(eq(gateCamera.tenantId, auth.user.tenantId))
    .limit(1);
  if (!row) return errorResponse("NO_CAMERA", "لا كاميرا مربوطة بعد", 404);
  if (!(await bcrypt.compare(parsed.data.password, row.adminHash)))
    return errorResponse("WRONG_PASSWORD", "كلمة السر غير صحيحة", 403);
  return successResponse({ unlocked: true }, "OK");
}
